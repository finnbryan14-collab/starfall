import { z } from 'zod';

/**
 * Backups: every table in one JSON file.
 *
 * Starfall has no server, so this file is the only copy of a player's history
 * that can survive a cleared browser or a new laptop. That makes two things
 * non-negotiable: it must be readable by a human who has lost everything else,
 * and restoring it must never half-succeed.
 *
 * What is *not* in it: the HoYoLAB cookie. A backup is a file people email
 * themselves and drop in cloud storage, and that cookie reads their whole
 * account. It is left out, and the restore says so, rather than quietly
 * shipping a credential into a text file (docs/DECISIONS.md).
 */

export const BACKUP_FORMAT = 'starfall-backup';

/** Bumped when the file's own shape changes, not when a table gains a field. */
export const BACKUP_VERSION = 1;

export const BACKUP_TABLES = [
  'plans',
  'profile',
  'characters',
  'artifacts',
  'wishes',
  'timers',
  'settings',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Settings keys held back from a backup, because they are credentials. */
export const EXCLUDED_SETTING_KEYS = ['hoyolab-cookie'] as const;

const row = z.looseObject({});

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().positive(),
  exportedAt: z.string(),
  /** The Dexie schema version the rows were written under. */
  schemaVersion: z.number().int().positive(),
  tables: z.object({
    plans: z.array(row),
    profile: z.array(row),
    characters: z.array(row),
    artifacts: z.array(row),
    wishes: z.array(row),
    timers: z.array(row),
    settings: z.array(row),
  }),
});

export type Backup = z.infer<typeof backupSchema>;

export type BackupFailure = 'not-json' | 'not-a-backup' | 'too-new' | 'malformed';

export const BACKUP_FAILURE_COPY: Record<BackupFailure, string> = {
  'not-json': 'That file isn’t JSON. Pick the .json file Starfall exported.',
  'not-a-backup': 'That’s a JSON file, but not a Starfall backup.',
  'too-new': 'That backup was made by a newer version of Starfall. Update, then bring it back in.',
  malformed: 'That backup is damaged — some of its tables are missing or the wrong shape.',
};

export type ParsedBackup =
  | { ok: true; backup: Backup; counts: Record<BackupTable, number> }
  | { ok: false; reason: BackupFailure };

/**
 * Reads a backup file, refusing anything it cannot restore faithfully.
 *
 * Returns the row counts alongside it so the screen can show what is about to
 * be replaced — "312 artifacts, 1,204 wishes" — before anything is written.
 */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }

  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not-a-backup' };
  if ((raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, reason: 'not-a-backup' };
  }

  // Checked before the full parse, so a future format gets the message that
  // tells the player what to do rather than a list of shape errors.
  const version = (raw as { version?: unknown }).version;
  if (typeof version === 'number' && version > BACKUP_VERSION) {
    return { ok: false, reason: 'too-new' };
  }

  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'malformed' };

  const counts = Object.fromEntries(
    BACKUP_TABLES.map((table) => [table, parsed.data.tables[table].length]),
  ) as Record<BackupTable, number>;

  return { ok: true, backup: parsed.data, counts };
}

/** Strips the values a backup must not carry off the device. */
export function withoutCredentials(settings: readonly unknown[]): unknown[] {
  const excluded = new Set<string>(EXCLUDED_SETTING_KEYS);
  return settings.filter((setting) => {
    const key = (setting as { key?: unknown }).key;
    return typeof key !== 'string' || !excluded.has(key);
  });
}

/** `starfall-backup-2026-09-29.json`. */
export function backupFilename(now: Date = new Date()): string {
  return `starfall-backup-${now.toISOString().slice(0, 10)}.json`;
}

/** A one-line summary of what a backup holds, for the confirm step. */
export function describeCounts(counts: Record<BackupTable, number>): string {
  const parts: string[] = [];
  const say = (n: number, one: string, many = `${one}s`) =>
    n > 0 ? parts.push(`${n.toLocaleString('en-US')} ${n === 1 ? one : many}`) : undefined;

  say(counts.wishes, 'wish', 'wishes');
  say(counts.artifacts, 'artifact');
  say(counts.plans, 'plan');
  say(counts.characters, 'character');
  say(counts.timers, 'timer');

  return parts.length > 0 ? parts.join(', ') : 'nothing at all';
}
