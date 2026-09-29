import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  BACKUP_VERSION,
  withoutCredentials,
  type Backup,
  type BackupTable,
} from '@/lib/backup';

import { db } from './schema';

/**
 * Reading every table out, and putting one back.
 *
 * The restore replaces rather than merges. Merging two histories by id sounds
 * kinder but produces a state that was never real — half of one device's plans
 * beside the other's — and there is no way to tell which is right. Replace is
 * the only outcome that can be described in one sentence on the confirm step.
 */

/** The Dexie schema version these rows were written under. */
const SCHEMA_VERSION = 1;

type TableRows = Record<BackupTable, unknown[]>;

export async function exportBackup(now: Date = new Date()): Promise<Backup> {
  const [plans, profile, characters, artifacts, wishes, timers, settings] = await Promise.all([
    db.plans.toArray(),
    db.profile.toArray(),
    db.characters.toArray(),
    db.artifacts.toArray(),
    db.wishes.toArray(),
    db.timers.toArray(),
    db.settings.toArray(),
  ]);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    schemaVersion: SCHEMA_VERSION,
    tables: {
      plans,
      profile,
      characters,
      artifacts,
      wishes,
      timers,
      // A backup is a file people email themselves; the HoYoLAB cookie is not
      // going in one.
      settings: withoutCredentials(settings),
    } as Backup['tables'],
  };
}

/**
 * Replaces everything with the backup's contents, in one transaction.
 *
 * All seven tables in a single Dexie transaction, so a failure part-way leaves
 * the device exactly as it was. A half-restored device — new wishes, old plans
 * — would be worse than a failed restore, because nothing would say so.
 */
export async function restoreBackup(backup: Backup): Promise<void> {
  const rows = backup.tables as unknown as TableRows;

  await db.transaction(
    'rw',
    [db.plans, db.profile, db.characters, db.artifacts, db.wishes, db.timers, db.settings],
    async () => {
      // The cookie is the one thing a restore leaves alone: it is not in the
      // file, and clearing settings wholesale would sign the player out of an
      // opt-in they never touched.
      const cookie = await db.settings.get('hoyolab-cookie');

      for (const table of BACKUP_TABLES) {
        await db.table(table).clear();
        const incoming = rows[table];
        if (incoming.length > 0) await db.table(table).bulkPut(incoming);
      }

      if (cookie) await db.settings.put(cookie);
    },
  );
}
