/**
 * Outgoing damage.
 *
 * The number every other damage feature is built on, and the objective the
 * build optimiser searches against — a search is only as good as the function
 * it maximises, so this one is written against the published formula and
 * checked against the wiki's own worked example rather than anybody's memory.
 *
 *     DMG = (Base DMG + Additive Base Bonus)
 *           × DMG Bonus × DEF × RES × CRIT
 *           [× Amplifying, when the hit triggers Vaporize or Melt]
 *
 *   source: https://genshin-impact.fandom.com/wiki/Damage
 *   verifiedAt: 2026-09-30
 *   see also docs/MATH.md section 6
 *
 * Pure and deterministic, like everything in src/engine — no data files, no
 * character knowledge. What a talent multiplies by and what a team buffs is
 * the caller's problem; this turns those numbers into a damage figure.
 */

export type CritMode = 'average' | 'crit' | 'nonCrit';

export type DefInput = {
  characterLevel: number;
  enemyLevel: number;
  /** Shred from effects like Klee C2 or Zhongli's shield, 0 to 1. */
  defReduction?: number;
  /** Defence bypassed outright, which is a separate term. */
  defIgnored?: number;
};

/**
 * How much of the enemy's defence gets through.
 *
 * Depends on the *character's* level, not the weapon's or the artifacts' — one
 * of the few places where levelling the character is itself a damage increase,
 * and an easy term to write backwards.
 */
export function defMultiplier({
  characterLevel,
  enemyLevel,
  defReduction = 0,
  defIgnored = 0,
}: DefInput): number {
  const character = characterLevel + 100;
  const k = (1 - defReduction) * (1 - defIgnored);
  const denominator = k * (enemyLevel + 100) + character;

  // Defence stripped entirely leaves the character term alone; guarded because
  // a zero denominator would otherwise be reachable from ordinary inputs.
  return denominator <= 0 ? 1 : character / denominator;
}

/**
 * How much of the damage the enemy's resistance lets through.
 *
 * Piecewise, and the negative branch is the interesting one: shred past zero
 * keeps paying, but at half rate. That is why the first 40% of RES reduction
 * is worth so much more than the second.
 */
export function resistanceMultiplier(resistance: number): number {
  if (resistance < 0) return 1 - resistance / 2;
  if (resistance < 0.75) return 1 - resistance;
  return 1 / (4 * resistance + 1);
}

export type CritInput = { critRate: number; critDamage: number; mode?: CritMode };

/**
 * The crit term.
 *
 * `average` is Starfall's, not the game's: the game either crits or does not.
 * A build is played hundreds of times though, so the expected value is the
 * honest objective for an optimiser. Crit rate is clamped to [0, 1] in that
 * average because overcapped rate is genuinely wasted — without the clamp the
 * search would happily hunt for rate the character can never use.
 */
export function critMultiplier({ critRate, critDamage, mode = 'average' }: CritInput): number {
  if (mode === 'nonCrit') return 1;
  if (mode === 'crit') return 1 + critDamage;
  return 1 + Math.min(1, Math.max(0, critRate)) * critDamage;
}

/**
 * Which element triggers a reaction decides how much it is worth.
 *
 * Pyro onto Cryo melts for double; Cryo onto Pyro only for one and a half. The
 * same asymmetry holds for Vaporize, and getting it backwards is a 33% error.
 */
export const AMPLIFYING_COEFFICIENTS = {
  meltPyro: 2,
  meltCryo: 1.5,
  vaporizeHydro: 2,
  vaporizePyro: 1.5,
} as const;

/** `2.78 × EM / (EM + 1400)` — sharply diminishing, which is why EM stacking stops. */
export function amplifyingEmBonus(elementalMastery: number): number {
  const em = Math.max(0, elementalMastery);
  return (2.78 * em) / (em + 1400);
}

export type AmplifyingInput = {
  coefficient: number;
  elementalMastery?: number;
  /** Flat additions, e.g. Crimson Witch 4pc. */
  reactionBonus?: number;
};

export function amplifyingMultiplier({
  coefficient,
  elementalMastery = 0,
  reactionBonus = 0,
}: AmplifyingInput): number {
  return coefficient * (1 + amplifyingEmBonus(elementalMastery) + reactionBonus);
}

export type Reaction =
  { kind: 'none' } | { kind: 'amplifying'; coefficient: number; reactionBonus?: number };

export type DamageInput = {
  /** Talent multiplier × the stat it scales with, already multiplied out. */
  baseDamage: number;
  /** Flat additions to base damage, before anything multiplies. */
  additiveBaseBonus?: number;
  /** Every DMG% bonus summed, as a fraction: 40% + 52% is 0.92. */
  damageBonus?: number;
  critRate: number;
  critDamage: number;
  critMode?: CritMode;
  elementalMastery?: number;
  reaction?: Reaction;
  resistance: number;
} & DefInput;

export type DamageParts = {
  base: number;
  damageBonus: number;
  def: number;
  res: number;
  crit: number;
  amplifying: number;
};

export type DamageResult = {
  damage: number;
  /** Every term, so a screen can show its working without recomputing it. */
  parts: DamageParts;
};

export function outgoingDamage(input: DamageInput): DamageResult {
  const {
    baseDamage,
    additiveBaseBonus = 0,
    damageBonus = 0,
    critRate,
    critDamage,
    critMode = 'average',
    elementalMastery = 0,
    reaction = { kind: 'none' },
    resistance,
  } = input;

  if (baseDamage < 0) throw new RangeError(`baseDamage must be >= 0, got ${baseDamage}`);

  const parts: DamageParts = {
    base: baseDamage + additiveBaseBonus,
    damageBonus: 1 + damageBonus,
    def: defMultiplier(input),
    res: resistanceMultiplier(resistance),
    crit: critMultiplier({ critRate, critDamage, mode: critMode }),
    amplifying:
      reaction.kind === 'amplifying'
        ? amplifyingMultiplier({
            coefficient: reaction.coefficient,
            elementalMastery,
            reactionBonus: reaction.reactionBonus,
          })
        : 1,
  };

  return {
    damage: parts.base * parts.damageBonus * parts.def * parts.res * parts.crit * parts.amplifying,
    parts,
  };
}
