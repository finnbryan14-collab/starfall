import { describe, expect, it } from 'vitest';

import {
  BACKUP_FAILURE_COPY,
  BACKUP_FORMAT,
  BACKUP_TABLES,
  BACKUP_VERSION,
  backupFilename,
  describeCounts,
  parseBackup,
  withoutCredentials,
} from './backup';

function file(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: '2026-09-29T12:00:00.000Z',
    schemaVersion: 1,
    tables: {
      plans: [{ id: 'p1' }],
      profile: [],
      characters: [],
      artifacts: [{ id: 'a1' }, { id: 'a2' }],
      wishes: [{ id: 'w1' }],
      timers: [],
      settings: [{ key: 'enka-profile', value: {} }],
    },
    ...overrides,
  });
}

describe('parseBackup', () => {
  it('reads a backup and counts what is in it', () => {
    const result = parseBackup(file());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.artifacts).toBe(2);
    expect(result.counts.wishes).toBe(1);
    expect(result.counts.profile).toBe(0);
  });

  it('counts every table the backup carries', () => {
    const result = parseBackup(file());
    if (!result.ok) throw new Error('expected a valid backup');

    // A table added to the file but not to the counts would silently not be
    // shown on the confirm step, which is where "replace everything" is agreed.
    for (const table of BACKUP_TABLES) {
      expect(result.counts[table], table).toBeTypeOf('number');
    }
  });

  it('tells apart the ways a file can be wrong', () => {
    expect(parseBackup('not json at all')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseBackup('{"hello":"world"}')).toEqual({ ok: false, reason: 'not-a-backup' });
    expect(parseBackup('[]')).toEqual({ ok: false, reason: 'not-a-backup' });
    expect(parseBackup('null')).toEqual({ ok: false, reason: 'not-a-backup' });
  });

  it('refuses a backup from a newer version rather than half-reading it', () => {
    const result = parseBackup(file({ version: BACKUP_VERSION + 1 }));
    expect(result).toEqual({ ok: false, reason: 'too-new' });
  });

  it('refuses a backup with a table missing', () => {
    const damaged = JSON.parse(file()) as { tables: Record<string, unknown> };
    delete damaged.tables.wishes;

    expect(parseBackup(JSON.stringify(damaged))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('refuses a table that is not an array', () => {
    const damaged = JSON.parse(file()) as { tables: Record<string, unknown> };
    damaged.tables.wishes = { id: 'w1' };

    expect(parseBackup(JSON.stringify(damaged))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('keeps rows it does not recognise, rather than dropping fields', () => {
    // A backup taken by a later build may carry fields this one has never
    // heard of. Restoring it must not quietly strip them.
    const withExtras = JSON.parse(file()) as { tables: { plans: Record<string, unknown>[] } };
    withExtras.tables.plans[0].somethingNew = 'keep me';

    const result = parseBackup(JSON.stringify(withExtras));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.backup.tables.plans[0]).toMatchObject({ somethingNew: 'keep me' });
  });

  it('has copy for every failure', () => {
    for (const [reason, copy] of Object.entries(BACKUP_FAILURE_COPY)) {
      expect(copy.length, reason).toBeGreaterThan(20);
    }
  });
});

describe('withoutCredentials', () => {
  /**
   * A backup is a file people email themselves. The HoYoLAB cookie reads a
   * whole account, so it must never be in one.
   */
  it('leaves the HoYoLAB cookie out', () => {
    const kept = withoutCredentials([
      { key: 'enka-profile', value: { uid: '600000000' } },
      { key: 'hoyolab-cookie', value: 'ltoken_v2=SECRET' },
    ]);

    expect(kept).toHaveLength(1);
    expect(JSON.stringify(kept)).not.toContain('SECRET');
    expect(JSON.stringify(kept)).toContain('enka-profile');
  });

  it('keeps rows with no key rather than losing them', () => {
    expect(withoutCredentials([{ value: 1 }])).toHaveLength(1);
  });
});

describe('presentation', () => {
  it('names the file by the day it was taken', () => {
    expect(backupFilename(new Date('2026-09-29T23:00:00Z'))).toBe(
      'starfall-backup-2026-09-29.json',
    );
  });

  it('describes a backup in the units a player thinks in', () => {
    const counts = {
      plans: 1,
      profile: 1,
      characters: 8,
      artifacts: 312,
      wishes: 1_204,
      timers: 3,
      settings: 2,
    };

    const described = describeCounts(counts);
    expect(described).toContain('1,204 wishes');
    expect(described).toContain('312 artifacts');
    expect(described).toContain('1 plan');
    // Settings are not something anyone counts.
    expect(described).not.toContain('setting');
  });

  it('says so plainly when there is nothing in it', () => {
    const empty = {
      plans: 0,
      profile: 0,
      characters: 0,
      artifacts: 0,
      wishes: 0,
      timers: 0,
      settings: 0,
    };

    expect(describeCounts(empty)).toBe('nothing at all');
  });
});
