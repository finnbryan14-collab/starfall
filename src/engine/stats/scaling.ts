import { SUBSTATS, type MainStatKey } from '../artifacts/model';

/**
 * Base stats at a level.
 *
 * A character's and a weapon's own contribution before a single artifact is
 * equipped. Every stat in the game grows the same way:
 *
 *     stat = base × curve[level] + ascensionBonus[phase]
 *
 * `base` is the level-1 value, `curve` is a shared table several characters
 * point at, and the ascension bonus is a step that only changes when you
 * ascend. Nothing here is interpolated or approximated — the curve table is
 * the game's own, so a result is exact.
 *
 *   source: https://genshin-impact.fandom.com/wiki/Character#Stats
 *   source: genshin-db 5.2.14, generated from the game's ExcelBinOutput
 *   verifiedAt: 2026-09-30
 *   see also docs/MATH.md section 7
 *
 * Pure, like everything in src/engine: the curve tables arrive as arguments
 * from src/data, so this file knows no characters and reads no files.
 *
 * ## Percentages are fractions here
 *
 * 0.884 means 88.4%. The artifact model counts percentage points instead
 * (`SUBSTATS.cd.max` is 7.77, meaning 7.77%) because that is how the game
 * prints a substat, and `fromArtifactValue` below is the single crossing
 * between the two. Mixing them silently would be the easiest way in the whole
 * app to produce a damage figure that is wrong by a factor of a hundred.
 */

export type StatMap = Partial<Record<MainStatKey, number>>;

/** Ascension phases run 0 to 6, and the game has never had another shape. */
export type Ascension = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * What one ascension phase is worth, cumulatively.
 *
 * `maxLevel` is the highest level the phase allows, which is also how the cap
 * is known: a 1 or 2 star weapon simply has fewer phases, ending at 70.
 */
export type AscensionStep = {
  maxLevel: number;
  hp: number;
  atk: number;
  def: number;
  /** The character's own bonus stat — CRIT DMG, ATK%, Elemental Mastery. */
  bonus: number;
};

export type LevelCurve = readonly number[];

export type CharacterScaling = {
  base: { hp: number; atk: number; def: number };
  curve: { hp: LevelCurve; atk: LevelCurve; def: LevelCurve };
  ascension: readonly AscensionStep[];
  bonusStat: MainStatKey;
};

export type WeaponAscensionStep = { maxLevel: number; atk: number };

export type WeaponScaling = {
  base: { atk: number; substat: number };
  curve: { atk: LevelCurve; substat: LevelCurve };
  ascension: readonly WeaponAscensionStep[];
  /** Null for the handful of low-rarity weapons that carry no second stat. */
  substatKey: MainStatKey | null;
};

/**
 * Every character starts here, before ascension or gear.
 *
 *   source: https://genshin-impact.fandom.com/wiki/CRIT_Rate
 *   verifiedAt: 2026-09-30
 *
 * Universal across all 124 characters in the game data, checked rather than
 * assumed. It matters for the optimiser because a build's crit ratio is
 * measured from this floor, not from zero.
 */
export const BASE_CRIT_RATE = 0.05;
export const BASE_CRIT_DAMAGE = 0.5;

/**
 * `base × curve[level]`.
 *
 * Throws on a level the curve does not cover and on a hole in the table. Both
 * would otherwise produce NaN, and a NaN here would travel the whole way to a
 * damage figure before anything noticed.
 */
export function scaleStat(base: number, curve: LevelCurve, level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > curve.length) {
    throw new RangeError(`level must be an integer in 1..${curve.length}, got ${level}`);
  }

  const multiplier = curve[level - 1];
  if (!Number.isFinite(multiplier)) {
    throw new RangeError(`no curve value at level ${level} — the generated table has a hole`);
  }

  return base * multiplier;
}

/**
 * The ascension phase a level actually sits in.
 *
 * The phase cannot be derived from the level alone: 20/20 and 20/40 are both
 * real, which is why GOOD carries the two separately. So the given phase is
 * honoured wherever the level permits it, and only corrected where it cannot.
 *
 * Corrected rather than rejected, deliberately. This is third-party scanner
 * data; dropping a character out of the roster over an inconsistent phase
 * would be a worse answer than showing them one phase out.
 */
export function ascensionForLevel(
  steps: readonly { maxLevel: number }[],
  level: number,
  ascension: number,
): Ascension {
  const last = steps.length - 1;
  let phase = Math.min(last, Math.max(0, Math.trunc(ascension)));

  // Up, when the level is past what this phase allows.
  while (phase < last && level > steps[phase].maxLevel) phase += 1;
  // Down, when the level is below where this phase starts.
  while (phase > 0 && level < steps[phase - 1].maxLevel) phase -= 1;

  return phase as Ascension;
}

export type BaseStats = { level: number; ascension: Ascension; stats: StatMap };

/**
 * A character's own stats, with nothing equipped.
 *
 * The bonus stat is always present, even at zero, so the shape does not change
 * with level — a caller reading `stats.er` should not have to know that
 * Bennett only starts gaining it at phase 2.
 *
 * When the bonus stat is CRIT Rate or CRIT DMG it lands on top of the
 * universal base, which is what makes Hu Tao's 38.4% read as 88.4% on her
 * character screen. The wiki's ascension tables print the 38.4%; this returns
 * the 88.4%, because that is the number the damage formula wants.
 */
export function characterBaseStats(
  scaling: CharacterScaling,
  level: number,
  ascension: number,
): BaseStats {
  const phase = ascensionForLevel(scaling.ascension, level, ascension);
  const step = scaling.ascension[phase];

  const stats: StatMap = {
    hp: scaleStat(scaling.base.hp, scaling.curve.hp, level) + step.hp,
    atk: scaleStat(scaling.base.atk, scaling.curve.atk, level) + step.atk,
    def: scaleStat(scaling.base.def, scaling.curve.def, level) + step.def,
    cr: BASE_CRIT_RATE,
    cd: BASE_CRIT_DAMAGE,
  };

  stats[scaling.bonusStat] = (stats[scaling.bonusStat] ?? 0) + step.bonus;

  return { level, ascension: phase, stats };
}

/**
 * A weapon's base ATK and its second stat.
 *
 * The second stat takes no ascension bonus at all — it is pure curve, which is
 * why Staff of Homa reads 25.4% CRIT DMG at both 20/20 and 20/40 while its
 * base ATK jumps from 122 to 153.
 */
export function weaponBaseStats(
  scaling: WeaponScaling,
  level: number,
  ascension: number,
): BaseStats {
  const cap = scaling.ascension[scaling.ascension.length - 1].maxLevel;
  if (level > cap) {
    throw new RangeError(`this weapon stops at level ${cap}, got ${level}`);
  }

  const phase = ascensionForLevel(scaling.ascension, level, ascension);
  const stats: StatMap = {
    atk: scaleStat(scaling.base.atk, scaling.curve.atk, level) + scaling.ascension[phase].atk,
  };

  if (scaling.substatKey) {
    stats[scaling.substatKey] = scaleStat(scaling.base.substat, scaling.curve.substat, level);
  }

  return { level, ascension: phase, stats };
}

/** Two stat maps summed, without touching either. */
export function addStats(a: StatMap, b: StatMap): StatMap {
  const total: StatMap = { ...a };
  for (const [key, value] of Object.entries(b) as [MainStatKey, number][]) {
    total[key] = (total[key] ?? 0) + value;
  }
  return total;
}

/**
 * An artifact's stat value in this file's units.
 *
 * The artifact model stores percentages as points because that is how the game
 * displays them. Everything downstream works in fractions. This is the only
 * place the two meet, so it is the only place that can get it wrong.
 */
export function fromArtifactValue(key: MainStatKey, value: number): number {
  const isPercent = key in SUBSTATS ? SUBSTATS[key as keyof typeof SUBSTATS].isPercent : true;
  return isPercent ? value / 100 : value;
}
