import type { MainStatKey, Substats } from '../artifacts/model';
import { addStats, fromArtifactValue, type StatMap } from '../stats/scaling';
import { outgoingDamage, type CritMode, type DamageResult, type Reaction } from './formula';

/**
 * A build, assembled: character plus weapon plus five artifacts plus whatever
 * the player says their team is doing, turned into one damage number.
 *
 * This is the layer between `src/engine/stats/` (what a character and a weapon
 * are worth at a level) and `src/engine/damage/formula.ts` (what a hit does).
 * It owns one formula of its own, and it is the one everybody gets wrong:
 *
 *     ATK = [(ATK_character + ATK_weapon) × (1 + ATK%)] + flat ATK
 *
 * The percentage multiplies the *base* only. A flat ATK plume added before the
 * multiplication rather than after is worth about 165 extra ATK on a real build
 * — a plausible-looking number that is simply not the one in the game.
 *
 *   source: https://genshin-impact.fandom.com/wiki/ATK
 *   verifiedAt: 2026-09-30
 *   see also docs/MATH.md section 8
 *
 * Pure, like everything in src/engine. Set bonuses arrive already looked up, so
 * this file knows no artifact sets — src/data/build.ts does that part.
 */

/** Which hits a bonus applies to. */
export type HitCategory = 'normal' | 'charged' | 'plunge' | 'skill' | 'burst';

/** What a talent term scales off. */
export type ScalingStat = 'atk' | 'hp' | 'def' | 'em';

export type TalentPart = {
  /**
   * What joins this term to the one before.
   *
   * `+` sums two scalings of one hit — Nahida's Tri-Karma is ATK plus Elemental
   * Mastery. `/` separates alternatives: a low and a high plunge are different
   * hits that happen to share a label.
   */
  join: '' | '+' | '/';
  stat: ScalingStat;
  /** One multiplier per talent level. */
  values: readonly number[];
};

export type TalentHit = { label: string; parts: readonly TalentPart[] };

/** An equipped artifact, in the artifact model's units — 46.6 meaning 46.6%. */
export type EquippedArtifact = {
  setKey: string;
  mainStat: MainStatKey;
  mainValue: number;
  substats: Substats;
};

export type BuildStats = {
  /** The character's level, which the DEF term reads. */
  level: number;
  /** What the percentage bonuses multiply. */
  base: { hp: number; atk: number; def: number };
  /** Everything else: percentages as fractions, flats as flats. */
  bonus: StatMap;
};

/** Which stats a percentage can multiply, as opposed to simply adding to. */
const BASE_STATS = ['hp', 'atk', 'def'] as const;

/**
 * Splits a stat map into the part percentages multiply and the part they do not.
 *
 * The key says which side a value belongs on: `atk` is base, `atk_` is a bonus.
 * A character's ATK% ascension bonus arrives under `atk_` and so lands, quite
 * correctly, on the multiplying side.
 */
export function splitBaseStats(stats: StatMap): Omit<BuildStats, 'level'> {
  const base = { hp: 0, atk: 0, def: 0 };
  const bonus: StatMap = {};

  for (const [key, value] of Object.entries(stats) as [MainStatKey, number][]) {
    if ((BASE_STATS as readonly string[]).includes(key)) base[key as 'hp'] = value;
    else bonus[key] = value;
  }

  return { base, bonus };
}

export type BuildInput = {
  /** The character's own stats, from `characterBaseStats`. */
  character: StatMap;
  /** The weapon's, from `weaponBaseStats`. Its ATK is base; everything else is a bonus. */
  weapon?: StatMap;
  artifacts?: readonly EquippedArtifact[];
  /** Set bonuses, already looked up and already in engine units. */
  setStats?: readonly StatMap[];
  /**
   * What the player says the rest of the team is doing, in engine units.
   *
   * Explicit rather than inferred: no dataset encodes "Bennett's burst gives
   * +X ATK" as something executable, so this is typed in or comes from a
   * hand-written preset. docs/MATH.md section 6.
   */
  buffs?: StatMap;
  /** Defaults to 90, which is where an optimiser's answers live. */
  level?: number;
};

/**
 * Everything a build contributes, in one place.
 *
 * The weapon's base ATK joins the character's, because that is what the game's
 * formula multiplies. Nothing else about a weapon is base: no weapon in the
 * game has base HP or base DEF, so an HP-scaling character gains nothing there.
 */
export function assembleBuild({
  character,
  weapon = {},
  artifacts = [],
  setStats = [],
  buffs = {},
  level = 90,
}: BuildInput): BuildStats {
  const characterSide = splitBaseStats(character);
  const weaponSide = splitBaseStats(weapon);

  let bonus = addStats(characterSide.bonus, weaponSide.bonus);

  for (const artifact of artifacts) {
    bonus = addStats(bonus, {
      [artifact.mainStat]: fromArtifactValue(artifact.mainStat, artifact.mainValue),
    });
    for (const [key, value] of Object.entries(artifact.substats) as [MainStatKey, number][]) {
      bonus = addStats(bonus, { [key]: fromArtifactValue(key, value) });
    }
  }

  for (const set of setStats) bonus = addStats(bonus, set);

  return {
    level,
    base: {
      hp: characterSide.base.hp,
      atk: characterSide.base.atk + weaponSide.base.atk,
      def: characterSide.base.def,
    },
    bonus: addStats(bonus, buffs),
  };
}

/** `base × (1 + percent) + flat`, for HP, ATK or DEF. */
export function totalStat(stats: BuildStats, stat: 'hp' | 'atk' | 'def'): number {
  const percent = stats.bonus[`${stat}_` as MainStatKey] ?? 0;
  const flat = stats.bonus[stat] ?? 0;
  return stats.base[stat] * (1 + percent) + flat;
}

/**
 * Whatever a talent scales off, read correctly.
 *
 * Elemental Mastery is the odd one: it has no base and no percentage, only ever
 * a flat bonus, so running it through the base formula would return zero.
 */
export function statValue(stats: BuildStats, stat: ScalingStat): number {
  if (stat === 'em') return stats.bonus.em ?? 0;
  return totalStat(stats, stat);
}

/** A hit's alternatives, split on the slashes. */
function alternatives(hit: TalentHit): TalentPart[][] {
  const groups: TalentPart[][] = [];
  for (const part of hit.parts) {
    if (groups.length === 0 || part.join === '/') groups.push([part]);
    else groups[groups.length - 1].push(part);
  }
  return groups;
}

/**
 * Talent multiplier × the stat it scales with, which is `Base DMG` in the
 * damage formula.
 *
 * `variant` picks between a label's alternatives, so `Low/High Plunge DMG` is
 * 0 for the low one and 1 for the high one.
 */
export function talentBaseDamage(
  hit: TalentHit,
  talentLevel: number,
  stats: BuildStats,
  variant = 0,
): number {
  const groups = alternatives(hit);
  const group = groups[variant];
  if (!group) {
    throw new RangeError(
      `${hit.label} has ${groups.length} alternative(s), asked for number ${variant + 1}`,
    );
  }

  let total = 0;
  for (const part of group) {
    if (!Number.isInteger(talentLevel) || talentLevel < 1 || talentLevel > part.values.length) {
      throw new RangeError(
        `talent level must be an integer in 1..${part.values.length}, got ${talentLevel}`,
      );
    }
    total += part.values[talentLevel - 1] * statValue(stats, part.stat);
  }

  return total;
}

export type HitBonus = { categories: readonly HitCategory[]; amount: number };

export type HitInput = {
  hit: TalentHit;
  category: HitCategory;
  talentLevel: number;
  stats: BuildStats;
  /** The element the hit deals, or null for a physical one. */
  element: string | null;
  enemy: {
    level: number;
    resistance: number;
    defReduction?: number;
    defIgnored?: number;
  };
  /** DMG bonuses that apply to some hits only, from set bonuses and passives. */
  hitBonuses?: readonly HitBonus[];
  reaction?: Reaction;
  critMode?: CritMode;
  /** Which of a label's alternatives to use. */
  variant?: number;
};

/**
 * One hit's damage, with every term shown.
 *
 * The DMG bonus is the sum of two different things: the build's bonus for this
 * hit's element (or Physical), and any bonus that applies only to this kind of
 * hit. Noblesse Oblige's +20% is Burst DMG, not damage — applying it to a skill
 * would overstate the build by a fifth.
 */
export function hitDamage({
  hit,
  category,
  talentLevel,
  stats,
  element,
  enemy,
  hitBonuses = [],
  reaction,
  critMode = 'average',
  variant = 0,
}: HitInput): DamageResult {
  const elementKey = (element ? `${element}_dmg` : 'physical_dmg') as MainStatKey;
  const conditional = hitBonuses
    .filter((bonus) => bonus.categories.includes(category))
    .reduce((total, bonus) => total + bonus.amount, 0);

  return outgoingDamage({
    baseDamage: talentBaseDamage(hit, talentLevel, stats, variant),
    damageBonus: (stats.bonus[elementKey] ?? 0) + conditional,
    critRate: stats.bonus.cr ?? 0,
    critDamage: stats.bonus.cd ?? 0,
    critMode,
    characterLevel: stats.level,
    enemyLevel: enemy.level,
    defReduction: enemy.defReduction,
    defIgnored: enemy.defIgnored,
    resistance: enemy.resistance,
    elementalMastery: stats.bonus.em ?? 0,
    reaction,
  });
}
