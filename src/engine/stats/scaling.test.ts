import { describe, expect, it } from 'vitest';

import {
  addStats,
  ascensionForLevel,
  characterBaseStats,
  fromArtifactValue,
  scaleStat,
  weaponBaseStats,
  type AscensionStep,
  type CharacterScaling,
  type WeaponScaling,
} from './scaling';

/**
 * docs/MATH.md section 7.
 *
 * Every expected value here is the figure the wiki prints in the character's
 * or the weapon's own ascension table, so this checks against a published
 * source rather than against the generator that produced our data.
 *
 *   https://genshin-impact.fandom.com/wiki/Hu_Tao
 *   https://genshin-impact.fandom.com/wiki/Bennett
 *   https://genshin-impact.fandom.com/wiki/Staff_of_Homa
 */

/**
 * A curve table cut to the levels these tests touch.
 *
 * Index is level - 1. Everything between is left NaN so that reading the wrong
 * level fails loudly instead of quietly returning a neighbour's value.
 */
function curveAt(points: Record<number, number>): number[] {
  const curve = new Array<number>(100).fill(Number.NaN);
  for (const [level, value] of Object.entries(points)) curve[Number(level) - 1] = value;
  return curve;
}

/** Hu Tao: 5 star, every stat on the S5 curve, CRIT DMG as her bonus. */
const HU_TAO: CharacterScaling = {
  base: { hp: 1210.7164, atk: 8.2859, def: 68.2062 },
  curve: {
    hp: curveAt({ 1: 1, 20: 2.594, 40: 4.307, 90: 8.739 }),
    atk: curveAt({ 1: 1, 20: 2.594, 40: 4.307, 90: 8.739 }),
    def: curveAt({ 1: 1, 20: 2.594, 40: 4.307, 90: 8.739 }),
  },
  ascension: [
    { maxLevel: 20, hp: 0, atk: 0, def: 0, bonus: 0 },
    { maxLevel: 40, hp: 1038.0798, atk: 7.103891, def: 58.482, bonus: 0 },
    { maxLevel: 50, hp: 1775.6628, atk: 12.151393, def: 100.035, bonus: 0.096 },
    { maxLevel: 60, hp: 2759.107, atk: 18.881393, def: 155.439, bonus: 0.192 },
    { maxLevel: 70, hp: 3496.69, atk: 23.928896, def: 196.992, bonus: 0.192 },
    { maxLevel: 80, hp: 4234.273, atk: 28.976398, def: 238.545, bonus: 0.288 },
    { maxLevel: 90, hp: 4971.856, atk: 34.0239, def: 280.098, bonus: 0.384 },
  ],
  bonusStat: 'cd',
};

/** Bennett: 4 star, an ordinary bonus stat rather than a crit one. */
const BENNETT: CharacterScaling = {
  base: { hp: 1039.4418, atk: 16.0272, def: 64.66425 },
  curve: {
    hp: curveAt({ 90: 8.349 }),
    atk: curveAt({ 90: 8.349 }),
    def: curveAt({ 90: 8.349 }),
  },
  ascension: [
    { maxLevel: 20, hp: 0, atk: 0, def: 0, bonus: 0 },
    { maxLevel: 40, hp: 0, atk: 0, def: 0, bonus: 0 },
    { maxLevel: 50, hp: 0, atk: 0, def: 0, bonus: 0.0667 },
    { maxLevel: 60, hp: 0, atk: 0, def: 0, bonus: 0.1333 },
    { maxLevel: 70, hp: 0, atk: 0, def: 0, bonus: 0.1333 },
    { maxLevel: 80, hp: 0, atk: 0, def: 0, bonus: 0.2 },
    { maxLevel: 90, hp: 3719.104, atk: 57.34638, def: 231.3675, bonus: 0.2667 },
  ],
  bonusStat: 'er',
};

const HOMA: WeaponScaling = {
  base: { atk: 45.9364, substat: 0.144 },
  curve: {
    atk: curveAt({ 1: 1, 20: 2.65, 70: 7.238, 90: 9.173 }),
    substat: curveAt({ 1: 1, 20: 1.767, 70: 3.786, 90: 4.594 }),
  },
  ascension: [
    { maxLevel: 20, atk: 0 },
    { maxLevel: 40, atk: 31.1 },
    { maxLevel: 50, atk: 62.2 },
    { maxLevel: 60, atk: 93.4 },
    { maxLevel: 70, atk: 124.5 },
    { maxLevel: 80, atk: 155.6 },
    { maxLevel: 90, atk: 186.7 },
  ],
  substatKey: 'cd',
};

describe('scaleStat', () => {
  it('is the base value at level 1, where every curve is 1', () => {
    expect(scaleStat(1210.7164, curveAt({ 1: 1 }), 1)).toBeCloseTo(1210.7164, 6);
  });

  it('refuses a level the curve does not cover', () => {
    expect(() => scaleStat(100, curveAt({ 1: 1 }), 0)).toThrow(RangeError);
    expect(() => scaleStat(100, curveAt({ 1: 1 }), 101)).toThrow(RangeError);
  });

  /**
   * A hole in the curve table is a generator bug, and a silent NaN would travel
   * all the way to a damage figure before anyone noticed it.
   */
  it('refuses a curve with a hole in it rather than returning NaN', () => {
    expect(() => scaleStat(100, curveAt({ 1: 1 }), 50)).toThrow(RangeError);
  });
});

describe('ascensionForLevel', () => {
  const steps: readonly AscensionStep[] = HU_TAO.ascension;

  it('keeps the phase it is given when the level allows it', () => {
    expect(ascensionForLevel(steps, 90, 6)).toBe(6);
    expect(ascensionForLevel(steps, 45, 2)).toBe(2);
  });

  /**
   * Both readings of level 20 are real — 20/20 unascended and 20/40 ascended —
   * which is exactly why GOOD carries the phase alongside the level.
   */
  it('respects both readings of an ascension boundary', () => {
    expect(ascensionForLevel(steps, 20, 0)).toBe(0);
    expect(ascensionForLevel(steps, 20, 1)).toBe(1);
  });

  /**
   * Clamped rather than rejected: this is third-party scanner data, and losing
   * a whole character from the roster over an inconsistent phase would be a
   * worse answer than showing them one phase out.
   */
  it('clamps a phase the level cannot support', () => {
    expect(ascensionForLevel(steps, 90, 0)).toBe(6);
    expect(ascensionForLevel(steps, 1, 6)).toBe(0);
    expect(ascensionForLevel(steps, 55, 1)).toBe(3);
  });

  it('allows the levels past 90 that the game now permits', () => {
    expect(ascensionForLevel(steps, 100, 6)).toBe(6);
  });
});

describe('characterBaseStats', () => {
  /** Wiki, Hu Tao, row 90/90: HP 15,552.31, ATK 106.43, DEF 876.15. */
  it('matches the published table at maximum level', () => {
    const { stats } = characterBaseStats(HU_TAO, 90, 6);

    expect(stats.hp).toBeCloseTo(15_552.31, 2);
    expect(stats.atk).toBeCloseTo(106.43, 2);
    expect(stats.def).toBeCloseTo(876.15, 2);
  });

  /** Wiki, Hu Tao, row 1/20. The bonus column reads a dash for phase 0. */
  it('matches the published table at level 1, with no bonus yet', () => {
    const { stats } = characterBaseStats(HU_TAO, 1, 0);

    expect(stats.hp).toBeCloseTo(1210.72, 2);
    expect(stats.atk).toBeCloseTo(8.29, 2);
    expect(stats.def).toBeCloseTo(68.21, 2);
    // Only the universal base, since Hu Tao's bonus stat is CRIT DMG.
    expect(stats.cd).toBeCloseTo(0.5, 10);
  });

  /** Wiki, Hu Tao: 20/20 is 3,140.60 HP and 20/40 is 4,178.68. */
  it('tells the two readings of level 20 apart', () => {
    expect(characterBaseStats(HU_TAO, 20, 0).stats.hp).toBeCloseTo(3140.6, 1);
    expect(characterBaseStats(HU_TAO, 20, 1).stats.hp).toBeCloseTo(4178.68, 2);
  });

  /**
   * Everyone starts at 5% and 50%. The wiki's bonus column shows the ascension
   * gain alone — 38.4% for Hu Tao at phase 6 — so the total is 88.4%, which is
   * what her character screen reads.
   */
  it('folds the bonus stat into the universal crit base', () => {
    const { stats } = characterBaseStats(HU_TAO, 90, 6);

    expect(stats.cr).toBeCloseTo(0.05, 10);
    expect(stats.cd).toBeCloseTo(0.884, 10);
  });

  /** Wiki, Bennett, row 90/90: HP 12,397.40, ATK 191.16, DEF 771.25. */
  it('puts a non-crit bonus stat in its own slot', () => {
    const { stats } = characterBaseStats(BENNETT, 90, 6);

    expect(stats.hp).toBeCloseTo(12_397.4, 1);
    expect(stats.atk).toBeCloseTo(191.16, 2);
    expect(stats.def).toBeCloseTo(771.25, 2);
    // The wiki prints 26.68%, rounded up from its own source; the game data
    // says 0.2667, and the character screen shows 26.7% either way.
    expect(stats.er).toBeCloseTo(0.2667, 4);
    // Crit is untouched, at the universal base.
    expect(stats.cr).toBeCloseTo(0.05, 10);
    expect(stats.cd).toBeCloseTo(0.5, 10);
  });

  it('reports the level and phase it actually used', () => {
    expect(characterBaseStats(HU_TAO, 90, 0)).toMatchObject({ level: 90, ascension: 6 });
  });
});

describe('weaponBaseStats', () => {
  /** Wiki, Staff of Homa, row 90/90: 608 ATK, 66.2% CRIT DMG. */
  it('matches the published table at maximum level', () => {
    const { stats } = weaponBaseStats(HOMA, 90, 6);

    expect(stats.atk).toBeCloseTo(608, 0);
    expect(stats.cd).toBeCloseTo(0.662, 3);
  });

  /** Row 1/20: 46 ATK, 14.4% CRIT DMG. */
  it('matches the published table at level 1', () => {
    const { stats } = weaponBaseStats(HOMA, 1, 0);

    expect(stats.atk).toBeCloseTo(46, 0);
    expect(stats.cd).toBeCloseTo(0.144, 4);
  });

  /**
   * A weapon's substat is pure curve — ascending adds nothing to it, which is
   * why the wiki shows 25.4% for both 20/20 and 20/40.
   */
  it('gives the substat no ascension bonus', () => {
    expect(weaponBaseStats(HOMA, 20, 0).stats.cd).toBeCloseTo(0.2544, 4);
    expect(weaponBaseStats(HOMA, 20, 1).stats.cd).toBeCloseTo(0.2544, 4);
    // While base ATK does jump: 122 against 153.
    expect(weaponBaseStats(HOMA, 20, 0).stats.atk).toBeCloseTo(122, 0);
    expect(weaponBaseStats(HOMA, 20, 1).stats.atk).toBeCloseTo(153, 0);
  });

  it('gives a weapon with no substat nothing but ATK', () => {
    const plain: WeaponScaling = { ...HOMA, substatKey: null };
    expect(Object.keys(weaponBaseStats(plain, 90, 6).stats)).toEqual(['atk']);
  });

  /**
   * A 1 and 2 star weapon stops at 70, and its ascension table stops with it,
   * so the cap is whatever the last phase says rather than a separate field
   * that could disagree with it.
   */
  it('refuses a level past the last phase the weapon has', () => {
    const lowRarity: WeaponScaling = { ...HOMA, ascension: HOMA.ascension.slice(0, 5) };
    expect(() => weaponBaseStats(lowRarity, 90, 6)).toThrow(RangeError);
    // The wiki's row 70/70 reads 457.
    expect(weaponBaseStats(lowRarity, 70, 4).stats.atk).toBeCloseTo(457, 0);
  });
});

describe('addStats', () => {
  it('sums the keys both sides have and keeps the rest', () => {
    expect(addStats({ atk: 100, cd: 0.5 }, { atk: 50, cr: 0.05 })).toEqual({
      atk: 150,
      cd: 0.5,
      cr: 0.05,
    });
  });

  it('leaves its arguments alone', () => {
    const a = { atk: 100 };
    addStats(a, { atk: 50 });
    expect(a).toEqual({ atk: 100 });
  });
});

describe('fromArtifactValue', () => {
  /**
   * The one place the two conventions meet. The artifact model counts
   * percentages in points (5.83 means 5.83%) because that is how the game
   * prints them; everything downstream of here works in fractions, because
   * that is what the damage formula multiplies by.
   */
  it('turns percentage points into a fraction', () => {
    expect(fromArtifactValue('cr', 3.89)).toBeCloseTo(0.0389, 10);
    expect(fromArtifactValue('atk_', 5.83)).toBeCloseTo(0.0583, 10);
    expect(fromArtifactValue('pyro_dmg', 46.6)).toBeCloseTo(0.466, 10);
  });

  it('leaves flat stats exactly as they are', () => {
    expect(fromArtifactValue('atk', 311)).toBe(311);
    expect(fromArtifactValue('em', 187)).toBe(187);
    expect(fromArtifactValue('hp', 4780)).toBe(4780);
  });
});
