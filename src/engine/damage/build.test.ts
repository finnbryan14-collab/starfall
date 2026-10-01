import { describe, expect, it } from 'vitest';

import {
  assembleBuild,
  hitDamage,
  splitBaseStats,
  statValue,
  talentBaseDamage,
  totalStat,
  type BuildStats,
  type TalentHit,
} from './build';

/**
 * docs/MATH.md section 8.
 *
 * The formula's shape is the wiki's:
 *
 *     ATK = [(ATK_character + ATK_weapon) × (1 + ATK%)] + flat ATK
 *
 *   https://genshin-impact.fandom.com/wiki/ATK
 *
 * The figures below are Hu Tao at 90 (base ATK 106.43, CRIT DMG 88.4%) holding
 * Staff of Homa at 90 (base ATK 608.07, CRIT DMG 66.2%) — both from the wiki's
 * ascension tables, asserted in src/engine/stats/scaling.test.ts.
 */

const HU_TAO_90 = { hp: 15_552.31, atk: 106.43, def: 876.15, cr: 0.05, cd: 0.884 };
const HOMA_90 = { atk: 608.07, cd: 0.662 };

/** One ATK% sands, at the 5-star maximum. */
const ATK_SANDS = {
  slotKey: 'sands' as const,
  setKey: 'CrimsonWitchOfFlames',
  mainStat: 'atk_' as const,
  mainValue: 46.6,
  substats: {},
};
/** One flat-ATK plume, at the 5-star maximum. */
const ATK_PLUME = {
  slotKey: 'plume' as const,
  setKey: 'CrimsonWitchOfFlames',
  mainStat: 'atk' as const,
  mainValue: 311,
  substats: {},
};

function build(...artifacts: (typeof ATK_SANDS | typeof ATK_PLUME)[]): BuildStats {
  return assembleBuild({
    character: HU_TAO_90,
    weapon: HOMA_90,
    artifacts,
  });
}

describe('splitBaseStats', () => {
  it('separates the three stats percentages multiply from everything else', () => {
    const split = splitBaseStats({ hp: 100, atk: 50, def: 20, cr: 0.05, cd: 0.5, em: 80 });

    expect(split.base).toEqual({ hp: 100, atk: 50, def: 20 });
    expect(split.bonus).toEqual({ cr: 0.05, cd: 0.5, em: 80 });
  });

  /**
   * An ascension bonus of ATK% is a bonus, not a base — it belongs on the
   * multiplying side. The key it arrives under is what says so.
   */
  it('leaves a percentage bonus on the bonus side', () => {
    const split = splitBaseStats({ atk: 50, atk_: 0.24 });

    expect(split.base.atk).toBe(50);
    expect(split.bonus.atk_).toBe(0.24);
    expect(split.bonus.atk).toBeUndefined();
  });
});

describe('assembleBuild', () => {
  /**
   * The weapon contributes base ATK and nothing else: no weapon in the game has
   * base HP or base DEF. Getting this wrong would inflate every HP-scaling
   * character's damage.
   */
  it('adds the weapon to base ATK only', () => {
    const stats = build();

    expect(stats.base.atk).toBeCloseTo(106.43 + 608.07, 2);
    expect(stats.base.hp).toBeCloseTo(15_552.31, 2);
    expect(stats.base.def).toBeCloseTo(876.15, 2);
  });

  /** 88.4% from Hu Tao's ascension plus 66.2% from Homa: the 154.6% players quote. */
  it('sums the crit the character and the weapon each bring', () => {
    expect(build().bonus.cd).toBeCloseTo(1.546, 3);
    expect(build().bonus.cr).toBeCloseTo(0.05, 10);
  });

  /**
   * Artifacts arrive in the artifact model's units — 46.6 meaning 46.6% — and
   * have to cross into fractions exactly once.
   */
  it('converts an artifact percentage and keeps a flat one', () => {
    expect(build(ATK_SANDS).bonus.atk_).toBeCloseTo(0.466, 6);
    expect(build(ATK_PLUME).bonus.atk).toBeCloseTo(311, 6);
  });

  it('adds substats to the same totals as main stats', () => {
    const stats = assembleBuild({
      character: HU_TAO_90,
      weapon: HOMA_90,
      artifacts: [{ ...ATK_SANDS, substats: { cr: 3.9, atk_: 5.8, atk: 19 } }],
    });

    expect(stats.bonus.cr).toBeCloseTo(0.05 + 0.039, 6);
    expect(stats.bonus.atk_).toBeCloseTo(0.466 + 0.058, 6);
    expect(stats.bonus.atk).toBeCloseTo(19, 6);
  });

  it('takes set bonuses and explicit buffs in engine units', () => {
    const stats = assembleBuild({
      character: HU_TAO_90,
      weapon: HOMA_90,
      artifacts: [],
      // Crimson Witch 2-piece.
      setStats: [{ pyro_dmg: 0.15 }],
      // What a player types in for Bennett's burst.
      buffs: { atk: 800 },
    });

    expect(stats.bonus.pyro_dmg).toBeCloseTo(0.15, 6);
    expect(stats.bonus.atk).toBeCloseTo(800, 6);
  });
});

describe('totalStat', () => {
  /** The wiki's formula, applied: 714.50 × 1.466 = 1,047.45. */
  it('multiplies base by the percentage before adding the flat', () => {
    expect(totalStat(build(ATK_SANDS), 'atk')).toBeCloseTo((106.43 + 608.07) * 1.466, 2);
  });

  it('adds the flat bonus after the multiplication, not before', () => {
    const both = totalStat(build(ATK_SANDS, ATK_PLUME), 'atk');

    expect(both).toBeCloseTo((106.43 + 608.07) * 1.466 + 311, 2);
    // And emphatically not (714.50 + 311) × 1.466, which is 165 ATK higher.
    expect(both).not.toBeCloseTo((106.43 + 608.07 + 311) * 1.466, 0);
  });

  it('is the base alone when nothing is equipped', () => {
    expect(totalStat(build(), 'atk')).toBeCloseTo(106.43 + 608.07, 2);
  });
});

describe('statValue', () => {
  it('reads the three basic stats through the percentage formula', () => {
    const stats = build(ATK_SANDS);
    expect(statValue(stats, 'atk')).toBeCloseTo(totalStat(stats, 'atk'), 10);
    expect(statValue(stats, 'hp')).toBeCloseTo(15_552.31, 2);
  });

  /**
   * Elemental Mastery has no base and no percentage — it is only ever a flat
   * bonus, so running it through the base formula would return zero.
   */
  it('reads Elemental Mastery as a plain total', () => {
    const stats = assembleBuild({
      character: HU_TAO_90,
      weapon: HOMA_90,
      artifacts: [],
      buffs: { em: 200 },
    });

    expect(statValue(stats, 'em')).toBeCloseTo(200, 6);
    expect(statValue(build(), 'em')).toBe(0);
  });
});

describe('talentBaseDamage', () => {
  const skill: TalentHit = {
    label: 'Skill DMG',
    parts: [{ join: '', stat: 'atk', values: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2] }],
  };

  it('reads the multiplier off the talent level', () => {
    const stats = build();
    const atk = totalStat(stats, 'atk');

    expect(talentBaseDamage(skill, 1, stats)).toBeCloseTo(atk * 1, 6);
    expect(talentBaseDamage(skill, 10, stats)).toBeCloseTo(atk * 2, 6);
  });

  it('refuses a talent level the multiplier table does not cover', () => {
    expect(() => talentBaseDamage(skill, 0, build())).toThrow(RangeError);
    expect(() => talentBaseDamage(skill, 11, build())).toThrow(RangeError);
  });

  /**
   * Nahida's Tri-Karma is `{param} ATK + {param} Elemental Mastery`, and the
   * plus really is a sum of two scalings of the same hit.
   */
  it('sums parts joined with a plus', () => {
    const triKarma: TalentHit = {
      label: 'Tri-Karma Purification DMG',
      parts: [
        { join: '', stat: 'atk', values: [1.7544] },
        { join: '+', stat: 'em', values: [3.5088] },
      ],
    };
    const stats = assembleBuild({
      character: HU_TAO_90,
      weapon: HOMA_90,
      artifacts: [],
      buffs: { em: 800 },
    });

    expect(talentBaseDamage(triKarma, 1, stats)).toBeCloseTo(
      totalStat(stats, 'atk') * 1.7544 + 800 * 3.5088,
      4,
    );
  });

  /**
   * A slash is two different hits sharing one label — a low and a high plunge —
   * so the caller picks, and picking nothing means the first.
   */
  it('treats parts joined with a slash as alternatives', () => {
    const plunge: TalentHit = {
      label: 'Low/High Plunge DMG',
      parts: [
        { join: '', stat: 'atk', values: [2] },
        { join: '/', stat: 'atk', values: [4] },
      ],
    };
    const stats = build();
    const atk = totalStat(stats, 'atk');

    expect(talentBaseDamage(plunge, 1, stats)).toBeCloseTo(atk * 2, 6);
    expect(talentBaseDamage(plunge, 1, stats, 1)).toBeCloseTo(atk * 4, 6);
  });

  it('refuses an alternative that does not exist', () => {
    expect(() => talentBaseDamage(skill, 1, build(), 1)).toThrow(RangeError);
  });

  /** Noelle's skill scales off DEF, and the label is the only thing that says so. */
  it('scales off whichever stat the part names', () => {
    const noelle: TalentHit = {
      label: 'Skill DMG',
      parts: [{ join: '', stat: 'def', values: [1.2] }],
    };
    const stats = build();

    expect(talentBaseDamage(noelle, 1, stats)).toBeCloseTo(876.15 * 1.2, 2);
  });
});

describe('hitDamage', () => {
  const skill: TalentHit = {
    label: 'Skill DMG',
    parts: [{ join: '', stat: 'atk', values: [2] }],
  };

  const enemy = { level: 90, resistance: 0.1 };

  it('applies the matching elemental bonus and no other', () => {
    const stats = assembleBuild({
      character: HU_TAO_90,
      weapon: HOMA_90,
      artifacts: [],
      setStats: [{ pyro_dmg: 0.15, cryo_dmg: 0.5 }],
    });

    const pyro = hitDamage({
      hit: skill,
      category: 'skill',
      talentLevel: 1,
      stats,
      element: 'pyro',
      enemy,
    });

    expect(pyro.parts.damageBonus).toBeCloseTo(1.15, 6);
  });

  it('uses the physical bonus for a physical hit', () => {
    const stats = assembleBuild({
      character: HU_TAO_90,
      weapon: HOMA_90,
      artifacts: [],
      setStats: [{ physical_dmg: 0.25, pyro_dmg: 0.15 }],
    });

    const hit = hitDamage({
      hit: skill,
      category: 'normal',
      talentLevel: 1,
      stats,
      element: null,
      enemy,
    });

    expect(hit.parts.damageBonus).toBeCloseTo(1.25, 6);
  });

  /**
   * Noblesse Oblige's 2-piece is +20% Burst DMG, which is a bonus to one kind
   * of hit rather than to everything. Applying it to a skill would overstate
   * the build by a fifth.
   */
  it('applies a hit bonus only to the hits it names', () => {
    const stats = build();
    const hitBonuses = [{ categories: ['burst' as const], amount: 0.2 }];

    const burst = hitDamage({
      hit: skill,
      category: 'burst',
      talentLevel: 1,
      stats,
      element: 'pyro',
      enemy,
      hitBonuses,
    });
    const elementalSkill = hitDamage({
      hit: skill,
      category: 'skill',
      talentLevel: 1,
      stats,
      element: 'pyro',
      enemy,
      hitBonuses,
    });

    expect(burst.parts.damageBonus).toBeCloseTo(1.2, 6);
    expect(elementalSkill.parts.damageBonus).toBeCloseTo(1, 6);
  });

  it('carries the build’s crit through to the answer', () => {
    const result = hitDamage({
      hit: skill,
      category: 'skill',
      talentLevel: 1,
      stats: build(),
      element: 'pyro',
      enemy,
    });

    // 5% rate against 154.6% damage: the expected value is 1 + 0.05 × 1.546.
    expect(result.parts.crit).toBeCloseTo(1 + 0.05 * 1.546, 6);
  });

  it('multiplies out to the same figure the formula would give', () => {
    const stats = build(ATK_SANDS, ATK_PLUME);
    const result = hitDamage({
      hit: skill,
      category: 'skill',
      talentLevel: 1,
      stats,
      element: 'pyro',
      enemy: { level: 90, resistance: 0.1, defReduction: 0.2 },
    });

    const expected =
      totalStat(stats, 'atk') *
      2 * // the talent multiplier
      1 * // no DMG bonus
      ((90 + 100) / (0.8 * (90 + 100) + (90 + 100))) *
      0.9 *
      (1 + 0.05 * 1.546);

    expect(result.damage).toBeCloseTo(expected, 4);
  });

  /** A character's own level is what the DEF term reads, not the enemy's alone. */
  it('takes the character level from the build, not the enemy', () => {
    const atLevel1 = hitDamage({
      hit: skill,
      category: 'skill',
      talentLevel: 1,
      stats: { ...build(), level: 1 },
      element: 'pyro',
      enemy,
    });
    const atLevel90 = hitDamage({
      hit: skill,
      category: 'skill',
      talentLevel: 1,
      stats: build(),
      element: 'pyro',
      enemy,
    });

    expect(atLevel90.parts.def).toBeGreaterThan(atLevel1.parts.def);
  });

  it('passes a reaction straight through', () => {
    const result = hitDamage({
      hit: skill,
      category: 'skill',
      talentLevel: 1,
      stats: build(),
      element: 'pyro',
      enemy,
      reaction: { kind: 'amplifying', coefficient: 1.5 },
    });

    // No Elemental Mastery on this build, so the bare coefficient.
    expect(result.parts.amplifying).toBeCloseTo(1.5, 6);
  });
});
