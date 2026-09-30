import { describe, expect, it } from 'vitest';

import { characterBaseStats, weaponBaseStats } from '@/engine/stats/scaling';
import { isSubstatKey, MAIN_STAT_ODDS } from '@/engine/artifacts/model';

import { CHARACTER_CURVES, CHARACTERS, characterScaling } from './characters-generated';
import { WEAPON_CURVES, WEAPONS, weaponScaling } from './weapons-generated';

/**
 * The generated data, checked end to end.
 *
 * scaling.test.ts proves the arithmetic against hand-written fixtures. This
 * proves the committed files carry the right numbers into it — the failure this
 * catches is a regeneration that quietly dropped or shifted something, which
 * would otherwise show up as every damage figure being slightly wrong.
 *
 * Every expected value is the figure the wiki prints.
 */

const ELEMENTS = ['anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'];
const WEAPON_TYPES = ['sword', 'claymore', 'polearm', 'bow', 'catalyst'];

/** Stats a character's ascension or a weapon's second line can actually be. */
function isKnownStat(key: string): boolean {
  return isSubstatKey(key) || key === 'heal' || key in MAIN_STAT_ODDS.goblet;
}

describe('characters-generated', () => {
  it('has the whole roster, including one Traveler per element', () => {
    // 122 named characters plus seven Travelers. A number that drops is a
    // patch's worth of characters gone missing.
    expect(Object.keys(CHARACTERS).length).toBeGreaterThanOrEqual(129);

    for (const element of ELEMENTS) {
      const key = `Traveler${element.charAt(0).toUpperCase()}${element.slice(1)}`;
      expect(CHARACTERS[key], key).toBeDefined();
    }
  });

  /** Wiki, Hu Tao, row 90/90: HP 15,552.31, ATK 106.43, DEF 876.15, CRIT DMG 38.4%. */
  it('reproduces a published ascension table through the real data', () => {
    const { stats } = characterBaseStats(characterScaling(CHARACTERS.HuTao), 90, 6);

    expect(stats.hp).toBeCloseTo(15_552.31, 2);
    expect(stats.atk).toBeCloseTo(106.43, 2);
    expect(stats.def).toBeCloseTo(876.15, 2);
    // 50% base plus her 38.4%.
    expect(stats.cd).toBeCloseTo(0.884, 6);
  });

  /** Wiki, Bennett, row 90/90: HP 12,397.40, ATK 191.16, DEF 771.25. */
  it('reproduces a second one, on the 4-star curves', () => {
    const { stats } = characterBaseStats(characterScaling(CHARACTERS.Bennett), 90, 6);

    expect(stats.hp).toBeCloseTo(12_397.4, 1);
    expect(stats.atk).toBeCloseTo(191.16, 2);
    expect(stats.def).toBeCloseTo(771.25, 2);
    expect(stats.er).toBeCloseTo(0.2667, 4);
  });

  it('scales every character at every level without a hole', () => {
    for (const [key, data] of Object.entries(CHARACTERS)) {
      const scaling = characterScaling(data);
      for (const level of [1, 20, 40, 50, 60, 70, 80, 90, 100]) {
        const { stats } = characterBaseStats(scaling, level, 6);
        expect(Number.isFinite(stats.atk), `${key} at ${level}`).toBe(true);
        expect(stats.atk, `${key} at ${level}`).toBeGreaterThan(0);
      }
    }
  });

  it('describes every character with values the rest of the app knows', () => {
    for (const [key, data] of Object.entries(CHARACTERS)) {
      expect(data.key, key).toBe(key);
      expect(WEAPON_TYPES, key).toContain(data.weaponType);
      expect([4, 5], key).toContain(data.rarity);
      expect(isKnownStat(data.bonusStat), `${key}: ${data.bonusStat}`).toBe(true);
      // Two 6.1 characters carry no element in the game data; everyone else
      // must have one the damage engine recognises.
      if (data.element !== null) expect(ELEMENTS, key).toContain(data.element);
      expect(data.ascension.length, key).toBe(7);
      expect(CHARACTER_CURVES[data.curve.atk], key).toBeDefined();
    }
  });

  /**
   * Ascension bonuses are cumulative, so they can only go up. A generator that
   * wrote the per-phase gain instead would still look plausible here and be
   * wrong by a factor of six at level 90.
   */
  it('has ascension bonuses that never go backwards', () => {
    for (const [key, data] of Object.entries(CHARACTERS)) {
      for (let phase = 1; phase < data.ascension.length; phase++) {
        const previous = data.ascension[phase - 1];
        const current = data.ascension[phase];
        expect(current.hp, `${key} phase ${phase}`).toBeGreaterThanOrEqual(previous.hp);
        expect(current.atk, `${key} phase ${phase}`).toBeGreaterThanOrEqual(previous.atk);
        expect(current.bonus, `${key} phase ${phase}`).toBeGreaterThanOrEqual(previous.bonus);
        expect(current.maxLevel, `${key} phase ${phase}`).toBeGreaterThan(previous.maxLevel);
      }
    }
  });
});

describe('weapons-generated', () => {
  it('has every weapon in the game', () => {
    expect(Object.keys(WEAPONS).length).toBeGreaterThanOrEqual(253);
  });

  /** Wiki, Staff of Homa, row 90/90: 608 ATK, 66.2% CRIT DMG. */
  it('reproduces a published weapon table through the real data', () => {
    const { stats } = weaponBaseStats(weaponScaling(WEAPONS.StaffOfHoma), 90, 6);

    expect(stats.atk).toBeCloseTo(608, 0);
    expect(stats.cd).toBeCloseTo(0.662, 3);
  });

  /** Wiki, Favonius Sword, row 90/90: 454 ATK, 61.3% Energy Recharge. */
  it('reproduces a 4-star weapon too', () => {
    const { stats } = weaponBaseStats(weaponScaling(WEAPONS.FavoniusSword), 90, 6);

    expect(stats.atk).toBeCloseTo(454, 0);
    expect(stats.er).toBeCloseTo(0.613, 3);
  });

  it('scales every weapon to its own cap', () => {
    for (const [key, data] of Object.entries(WEAPONS)) {
      const cap = data.ascension[data.ascension.length - 1].maxLevel;
      // Low-rarity weapons stop at 70, everything else at 90.
      expect([70, 90], key).toContain(cap);

      const { stats } = weaponBaseStats(weaponScaling(data), cap, 6);
      expect(stats.atk, key).toBeGreaterThan(0);
      if (data.substatKey) {
        expect(isKnownStat(data.substatKey), `${key}: ${data.substatKey}`).toBe(true);
        expect(stats[data.substatKey as 'cd'], key).toBeGreaterThan(0);
      }
    }
  });

  it('names every curve it points at', () => {
    for (const [key, data] of Object.entries(WEAPONS)) {
      expect(WEAPON_CURVES[data.curve.atk], key).toBeDefined();
      if (data.curve.substat) expect(WEAPON_CURVES[data.curve.substat], key).toBeDefined();
      expect(WEAPON_TYPES, key).toContain(data.weaponType);
    }
  });
});

describe('growth curves', () => {
  it('start at 1 and only ever rise', () => {
    for (const [name, curve] of Object.entries({ ...CHARACTER_CURVES, ...WEAPON_CURVES })) {
      expect(curve[0], name).toBeCloseTo(1, 6);
      for (let index = 1; index < curve.length; index++) {
        expect(curve[index], `${name} at level ${index + 1}`).toBeGreaterThanOrEqual(
          curve[index - 1],
        );
      }
    }
  });

  it('cover the levels the game allows', () => {
    for (const curve of Object.values(CHARACTER_CURVES)) expect(curve.length).toBe(100);
    for (const curve of Object.values(WEAPON_CURVES)) expect(curve.length).toBe(90);
  });
});
