import { randomInt, type Rng } from '../rng';

/**
 * The 5-star artifact model: what drops, and what happens when you level it.
 *
 * Main-stat odds, substat weights and roll values are community-documented
 * rather than published by HoYoverse, but they are stable and heavily sampled.
 *   source: https://genshin-impact.fandom.com/wiki/Artifact/Distribution
 *   source: https://genshin-impact.fandom.com/wiki/Artifact/Stats
 *   source: https://keqingmains.com/misc/artifacts/
 *   verifiedAt: 2026-09-29
 *   see also docs/MATH.md section 4
 *
 * Pure and deterministic: every random choice takes an Rng argument, so a
 * result can be reproduced exactly (CLAUDE.md).
 */

export type Slot = 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet';

/** Stats that can appear as a substat. */
export type SubstatKey = 'hp' | 'atk' | 'def' | 'hp_' | 'atk_' | 'def_' | 'er' | 'em' | 'cr' | 'cd';

/** Damage bonuses only ever appear as a goblet main stat, never as substats. */
export type DamageBonusKey =
  | 'pyro_dmg'
  | 'hydro_dmg'
  | 'electro_dmg'
  | 'cryo_dmg'
  | 'anemo_dmg'
  | 'geo_dmg'
  | 'dendro_dmg'
  | 'physical_dmg';

export type MainStatKey = SubstatKey | DamageBonusKey | 'heal';

export type Substats = Partial<Record<SubstatKey, number>>;

export type SubstatSpec = {
  /** Relative chance of being picked for a new line. */
  weight: number;
  /** Value of a single 100% roll at 5 star. */
  max: number;
  name: string;
  /** Whether the value is a percentage. Flat HP/ATK/DEF and EM are not. */
  isPercent: boolean;
};

export const SUBSTATS: Record<SubstatKey, SubstatSpec> = {
  hp: { weight: 6, max: 298.75, name: 'HP', isPercent: false },
  atk: { weight: 6, max: 19.45, name: 'ATK', isPercent: false },
  def: { weight: 6, max: 23.15, name: 'DEF', isPercent: false },
  hp_: { weight: 4, max: 5.83, name: 'HP%', isPercent: true },
  atk_: { weight: 4, max: 5.83, name: 'ATK%', isPercent: true },
  def_: { weight: 4, max: 7.29, name: 'DEF%', isPercent: true },
  er: { weight: 4, max: 6.48, name: 'Energy Recharge', isPercent: true },
  em: { weight: 4, max: 23.31, name: 'Elemental Mastery', isPercent: false },
  cr: { weight: 3, max: 3.89, name: 'CRIT Rate', isPercent: true },
  cd: { weight: 3, max: 7.77, name: 'CRIT DMG', isPercent: true },
};

export const SUBSTAT_KEYS = Object.keys(SUBSTATS) as SubstatKey[];

export function isSubstatKey(key: string): key is SubstatKey {
  return key in SUBSTATS;
}

/** Every roll lands on one of four tiers, uniformly. */
export const ROLL_TIERS = [0.7, 0.8, 0.9, 1] as const;

/**
 * Main-stat odds per slot.
 *
 * Flower and plume are fixed — flat HP and flat ATK — and cannot roll anything
 * else, so they are a single certainty rather than a distribution.
 */
export const MAIN_STAT_ODDS: Record<Slot, Partial<Record<MainStatKey, number>>> = {
  flower: { hp: 1 },
  plume: { atk: 1 },
  sands: {
    hp_: 0.2668,
    atk_: 0.2666,
    def_: 0.2666,
    er: 0.1,
    em: 0.1,
  },
  goblet: {
    hp_: 0.1925,
    atk_: 0.1925,
    def_: 0.19,
    pyro_dmg: 0.05,
    hydro_dmg: 0.05,
    electro_dmg: 0.05,
    cryo_dmg: 0.05,
    anemo_dmg: 0.05,
    geo_dmg: 0.05,
    dendro_dmg: 0.05,
    physical_dmg: 0.05,
    em: 0.025,
  },
  circlet: {
    hp_: 0.22,
    atk_: 0.22,
    def_: 0.22,
    cr: 0.1,
    cd: 0.1,
    heal: 0.1,
    em: 0.04,
  },
};

/** Picks a main stat for a slot, weighted by the published odds. */
export function rollMainStat(slot: Slot, rng: Rng): MainStatKey {
  const odds = Object.entries(MAIN_STAT_ODDS[slot]) as [MainStatKey, number][];
  let r = rng();
  for (const [key, p] of odds) {
    r -= p;
    if (r <= 0) return key;
  }
  // Float error at the very top of the range: fall back to the last entry
  // rather than returning undefined.
  return odds[odds.length - 1][0];
}

/**
 * Picks one substat by weight from the keys still available.
 *
 * A line cannot repeat, and cannot match the main stat — which is why the
 * candidate list shrinks as lines are added.
 */
function pickWeighted(candidates: SubstatKey[], rng: Rng): SubstatKey {
  let total = 0;
  for (const key of candidates) total += SUBSTATS[key].weight;

  let r = rng() * total;
  for (const key of candidates) {
    r -= SUBSTATS[key].weight;
    if (r <= 0) return key;
  }
  return candidates[candidates.length - 1];
}

/** One roll's value for a stat: a tier of its maximum. */
function rollValue(key: SubstatKey, rng: Rng): number {
  return SUBSTATS[key].max * ROLL_TIERS[randomInt(rng, ROLL_TIERS.length)];
}

/** Substat keys a piece with this main stat could still roll. */
export function candidateSubstats(
  mainStat: MainStatKey,
  taken: Iterable<string> = [],
): SubstatKey[] {
  const used = new Set(taken);
  return SUBSTAT_KEYS.filter((key) => key !== mainStat && !used.has(key));
}

/** Rolls `lines` distinct substats for a piece with the given main stat. */
export function rollSubstats(mainStat: MainStatKey, lines: number, rng: Rng): Substats {
  const pool = candidateSubstats(mainStat);
  if (!Number.isInteger(lines) || lines < 1 || lines > pool.length) {
    throw new RangeError(`lines must be an integer in [1, ${pool.length}], got ${lines}`);
  }

  const subs: Substats = {};
  for (let i = 0; i < lines; i++) {
    const key = pickWeighted(candidateSubstats(mainStat, Object.keys(subs)), rng);
    subs[key] = rollValue(key, rng);
  }
  return subs;
}

/** Levels at which a piece gains a roll. */
export const UPGRADE_LEVELS = [4, 8, 12, 16, 20] as const;
export const MAX_LEVEL = 20;

/** How many upgrades a piece at this level has left. */
export function upgradesRemaining(level: number): number {
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) {
    throw new RangeError(`level must be an integer in [0, ${MAX_LEVEL}], got ${level}`);
  }
  return UPGRADE_LEVELS.filter((upgradeLevel) => upgradeLevel > level).length;
}

/**
 * Levels a piece to +20 and returns its finished substats.
 *
 * A three-line piece spends its first upgrade gaining a fourth line; every
 * upgrade after that adds a roll to one of the four lines, chosen uniformly.
 * The input is never mutated.
 */
export function simulateToMax(
  subs: Substats,
  level: number,
  mainStat: MainStatKey,
  rng: Rng,
): Substats {
  const result: Substats = { ...subs };
  const upgrades = upgradesRemaining(level);

  for (let i = 0; i < upgrades; i++) {
    const keys = Object.keys(result) as SubstatKey[];

    if (keys.length < 4) {
      const key = pickWeighted(candidateSubstats(mainStat, keys), rng);
      result[key] = rollValue(key, rng);
    } else {
      const key = keys[randomInt(rng, keys.length)];
      result[key] = (result[key] ?? 0) + rollValue(key, rng);
    }
  }

  return result;
}

/** Crit value: 2 x CRIT Rate + CRIT DMG, the usual shorthand for a piece. */
export function critValue(subs: Substats): number {
  return 2 * (subs.cr ?? 0) + (subs.cd ?? 0);
}

/** Chance a fresh domain drop starts with four substats rather than three. */
export const DOMAIN_FOUR_LINE_CHANCE = 0.2;
/** Bosses and the strongbox are more generous. */
export const BOSS_FOUR_LINE_CHANCE = 0.34;

/** A brand new +0 piece with the given main stat. */
export function freshDrop(
  mainStat: MainStatKey,
  rng: Rng,
  fourLineChance = DOMAIN_FOUR_LINE_CHANCE,
): Substats {
  const lines = rng() < fourLineChance ? 4 : 3;
  return rollSubstats(mainStat, lines, rng);
}
