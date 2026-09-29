import { describe, expect, it } from 'vitest';

import { isSubstatKey } from '@/engine/artifacts/model';

import {
  countBySlot,
  describeGood,
  GOOD_FAILURE_COPY,
  GOOD_MAIN_STAT_KEYS,
  GOOD_SUBSTAT_KEYS,
  parseGood,
  toImportedArtifacts,
} from './good';

/** Shaped like a real Inventory Kamera export. */
function good(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: 'GOOD',
    version: 2,
    source: 'Inventory Kamera',
    characters: [{ key: 'KamisatoAyaka', level: 90, constellation: 1 }],
    weapons: [{ key: 'MistsplitterReforged', level: 90, refinement: 1 }],
    artifacts: [
      {
        setKey: 'BlizzardStrayer',
        slotKey: 'flower',
        level: 20,
        rarity: 5,
        mainStatKey: 'hp',
        location: 'KamisatoAyaka',
        lock: true,
        substats: [
          { key: 'critRate_', value: 7.8 },
          { key: 'critDMG_', value: 21.8 },
          { key: 'eleMas', value: 40 },
          { key: 'enerRech_', value: 5.8 },
        ],
      },
      {
        setKey: 'BlizzardStrayer',
        slotKey: 'goblet',
        level: 16,
        rarity: 5,
        mainStatKey: 'cryo_dmg_',
        location: '',
        lock: false,
        substats: [
          { key: 'atk_', value: 9.9 },
          { key: '', value: 0 },
        ],
      },
    ],
    ...overrides,
  });
}

describe('parseGood', () => {
  it('reads an export and counts what is in it', () => {
    const result = parseGood(good());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts).toEqual({ artifacts: 2, characters: 1, weapons: 1, skipped: 0 });
    expect(result.source).toBe('Inventory Kamera');
  });

  it('tells apart the ways a file can be wrong', () => {
    expect(parseGood('nope')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseGood('{"format":"NOTGOOD","version":2}')).toEqual({
      ok: false,
      reason: 'not-good',
    });
    expect(parseGood('[]')).toEqual({ ok: false, reason: 'not-good' });
  });

  it('refuses a version it does not understand rather than half-reading it', () => {
    expect(parseGood(good({ version: 99 }))).toEqual({ ok: false, reason: 'unsupported-version' });
    expect(parseGood(good({ version: 'two' }))).toEqual({
      ok: false,
      reason: 'unsupported-version',
    });
  });

  it('refuses an artifact list that is not the shape GOOD describes', () => {
    expect(parseGood(good({ artifacts: [{ setKey: 'BlizzardStrayer' }] }))).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(parseGood(good({ artifacts: 'lots' }))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('accepts an export with no artifacts at all', () => {
    // A character-only scan is a legitimate thing to export.
    const result = parseGood(good({ artifacts: undefined }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.counts.artifacts).toBe(0);
  });

  /**
   * Scanners are third-party tools of varying quality. One odd entry must not
   * cost the player the other four hundred good ones.
   */
  it('keeps fields it has never heard of', () => {
    const withExtras = JSON.parse(good()) as { artifacts: Record<string, unknown>[] };
    withExtras.artifacts[0].astralMark = true;
    withExtras.artifacts[0].totalRolls = 9;

    expect(parseGood(JSON.stringify(withExtras)).ok).toBe(true);
  });

  it('counts an unrecognised main stat as skipped rather than failing', () => {
    const odd = JSON.parse(good()) as { artifacts: Record<string, unknown>[] };
    odd.artifacts[1].mainStatKey = 'sandwich_dmg_';

    const result = parseGood(JSON.stringify(odd));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.counts.artifacts).toBe(1);
      expect(result.counts.skipped).toBe(1);
    }
  });

  it('has a name for a scanner that did not give one', () => {
    const result = parseGood(good({ source: '  ' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.source).toBe('an unnamed scanner');
  });

  it('has copy for every failure', () => {
    for (const [reason, copy] of Object.entries(GOOD_FAILURE_COPY)) {
      expect(copy.length, reason).toBeGreaterThan(20);
    }
  });
});

describe('stat key mapping', () => {
  /**
   * The names differ and so does the percentage convention. Every GOOD substat
   * key has to land on one our scorer knows, or the value is quietly lost.
   */
  it('maps every GOOD substat onto one the scorer knows', () => {
    for (const [goodKey, ours] of Object.entries(GOOD_SUBSTAT_KEYS)) {
      expect(isSubstatKey(ours), `${goodKey} -> ${ours}`).toBe(true);
    }
  });

  it('covers all ten substats GOOD defines', () => {
    expect(Object.keys(GOOD_SUBSTAT_KEYS)).toHaveLength(10);
    expect(GOOD_SUBSTAT_KEYS.eleMas).toBe('em');
    expect(GOOD_SUBSTAT_KEYS.enerRech_).toBe('er');
    expect(GOOD_SUBSTAT_KEYS.critRate_).toBe('cr');
    expect(GOOD_SUBSTAT_KEYS.critDMG_).toBe('cd');
  });

  it('covers every main stat, including the goblet bonuses and healing', () => {
    // 18 in genshin-optimizer's list, minus flat DEF which is never a main
    // stat, plus flat DEF which we carry because it is a substat.
    for (const key of [
      'physical_dmg_',
      'anemo_dmg_',
      'geo_dmg_',
      'electro_dmg_',
      'hydro_dmg_',
      'pyro_dmg_',
      'cryo_dmg_',
      'dendro_dmg_',
      'heal_',
    ]) {
      expect(GOOD_MAIN_STAT_KEYS[key], key).toBeTruthy();
    }
  });
});

describe('toImportedArtifacts', () => {
  const parsed = parseGood(good());
  const artifacts = parsed.ok ? toImportedArtifacts(parsed.good) : [];

  it('carries every field the scorer needs', () => {
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]).toMatchObject({
      setKey: 'BlizzardStrayer',
      slotKey: 'flower',
      level: 20,
      rarity: 5,
      mainStat: 'hp',
      location: 'KamisatoAyaka',
      lock: true,
    });
  });

  it('translates the substats into our keys', () => {
    expect(artifacts[0].substats).toEqual({ cr: 7.8, cd: 21.8, em: 40, er: 5.8 });
  });

  it('drops the empty fourth line rather than recording a zero', () => {
    // GOOD spells an unrolled line as an empty key with value 0. Keeping it
    // would make a three-line artifact look like a four-line one.
    expect(artifacts[1].substats).toEqual({ atk_: 9.9 });
    expect(Object.keys(artifacts[1].substats)).toHaveLength(1);
  });

  it('translates a goblet damage bonus', () => {
    expect(artifacts[1].mainStat).toBe('cryo_dmg');
  });

  it('gives every artifact a distinct id, even when two are identical', () => {
    // Two genuinely different artifacts can have identical stats; a
    // content-hashed id would collapse them and shrink the inventory.
    const twins = JSON.parse(good()) as { artifacts: unknown[] };
    twins.artifacts = [twins.artifacts[0], twins.artifacts[0]];

    const result = parseGood(JSON.stringify(twins));
    if (!result.ok) throw new Error('expected a valid export');

    const ids = toImportedArtifacts(result.good).map((a) => a.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('skips an artifact whose main stat means nothing to us', () => {
    const odd = JSON.parse(good()) as { artifacts: Record<string, unknown>[] };
    odd.artifacts[0].mainStatKey = 'nonsense';

    const result = parseGood(JSON.stringify(odd));
    if (!result.ok) throw new Error('expected a valid export');
    expect(toImportedArtifacts(result.good)).toHaveLength(1);
  });
});

describe('presentation', () => {
  it('describes an import in the units a player thinks in', () => {
    expect(describeGood({ artifacts: 312, characters: 41, weapons: 120, skipped: 0 })).toBe(
      '312 artifacts, 41 characters, 120 weapons',
    );
    expect(describeGood({ artifacts: 1, characters: 0, weapons: 0, skipped: 0 })).toBe(
      '1 artifact',
    );
    expect(describeGood({ artifacts: 0, characters: 0, weapons: 0, skipped: 0 })).toBe(
      'nothing at all',
    );
  });

  it('counts every slot, including the ones a scan missed', () => {
    const parsed = parseGood(good());
    if (!parsed.ok) throw new Error('expected a valid export');

    const counts = countBySlot(toImportedArtifacts(parsed.good));
    expect(counts).toEqual({ flower: 1, plume: 0, sands: 0, goblet: 1, circlet: 0 });
  });
});
