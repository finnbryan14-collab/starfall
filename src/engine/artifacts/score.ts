import { mulberry32 } from '../rng';
import { SUBSTATS, critValue, simulateToMax, type MainStatKey, type Substats } from './model';
import type { StatWeights } from './weights';

/**
 * Keep or trash: the chance a piece reaches your goal once it is fully levelled.
 *
 * Monte Carlo rather than a closed form. The upgrade process — which line each
 * roll lands on, and at which of four tiers — has no tidy distribution, and a
 * simulation is both obviously correct and easy to explain to the player.
 *
 * Seeded, so the same piece always gives the same number. SPEC.md requires
 * that: a verdict that jitters between runs is not trustworthy.
 *
 * See docs/MATH.md section 4.
 */

export type Goal =
  | { kind: 'critValue'; threshold: number }
  | { kind: 'weighted'; weights: StatWeights; threshold: number };

/** The default goal: 30 crit value at +20, per MATH.md. */
export const DEFAULT_GOAL: Goal = { kind: 'critValue', threshold: 30 };

/**
 * Weighted roll value, in whole rolls.
 *
 * Each line contributes its value as a share of one maximum roll, scaled by the
 * stat's weight. A piece with three max CRIT DMG rolls and a weight of 1 scores
 * 3. That makes the threshold readable: "four good rolls" rather than an
 * abstract index.
 */
export function weightedRollValue(subs: Substats, weights: StatWeights): number {
  let total = 0;
  for (const [key, value] of Object.entries(subs)) {
    const weight = weights[key as keyof StatWeights];
    if (!weight) continue;
    total += (value / SUBSTATS[key as keyof typeof SUBSTATS].max) * weight;
  }
  return total;
}

/** The number a goal is judged on. */
export function scoreOf(subs: Substats, goal: Goal): number {
  return goal.kind === 'critValue' ? critValue(subs) : weightedRollValue(subs, goal.weights);
}

export type Verdict = 'keep' | 'maybe' | 'feed';

/**
 * Where the verdict boundaries sit, in one place so they can be tuned
 * (MATH.md asks for exactly that).
 */
export const VERDICT_THRESHOLDS = {
  /** At or above this, level it. */
  keep: 0.35,
  /** At or above this, level to +8 and decide again. */
  maybe: 0.15,
} as const;

export const VERDICT_COPY: Record<Verdict, string> = {
  keep: 'Level it.',
  maybe: 'Level to +8, then decide.',
  feed: 'Feed it.',
};

export function verdictFor(probability: number): Verdict {
  if (probability >= VERDICT_THRESHOLDS.keep) return 'keep';
  if (probability >= VERDICT_THRESHOLDS.maybe) return 'maybe';
  return 'feed';
}

export type KeepOrTrashInput = {
  subs: Substats;
  level: number;
  mainStat: MainStatKey;
  goal?: Goal;
  trials?: number;
  seed?: number;
};

export type KeepOrTrashResult = {
  /** Chance the piece meets the goal at +20. */
  probability: number;
  verdict: Verdict;
  /** Every simulated final score, for the histogram. */
  scores: Float64Array;
  median: number;
  p10: number;
  p90: number;
  trials: number;
  goal: Goal;
};

/** MATH.md specifies 20,000 trials. */
export const DEFAULT_TRIALS = 20_000;
export const DEFAULT_SEED = 7;

export function keepOrTrash({
  subs,
  level,
  mainStat,
  goal = DEFAULT_GOAL,
  trials = DEFAULT_TRIALS,
  seed = DEFAULT_SEED,
}: KeepOrTrashInput): KeepOrTrashResult {
  if (!Number.isInteger(trials) || trials < 1) {
    throw new RangeError(`trials must be a positive integer, got ${trials}`);
  }

  const rng = mulberry32(seed);
  const scores = new Float64Array(trials);
  let met = 0;

  for (let i = 0; i < trials; i++) {
    const score = scoreOf(simulateToMax(subs, level, mainStat, rng), goal);
    scores[i] = score;
    if (score >= goal.threshold) met++;
  }

  const probability = met / trials;
  const sorted = Float64Array.from(scores).sort();
  const at = (q: number) => sorted[Math.min(trials - 1, Math.floor(q * trials))];

  return {
    probability,
    verdict: verdictFor(probability),
    scores,
    median: at(0.5),
    p10: at(0.1),
    p90: at(0.9),
    trials,
    goal,
  };
}

export type Histogram = {
  bins: { from: number; to: number; count: number; meetsGoal: boolean }[];
  max: number;
};

/** Bins the simulated scores for the chart. */
export function histogram(
  scores: Float64Array,
  goal: Goal,
  binCount = 9,
  from = 10,
  width = 5,
): Histogram {
  const counts = new Array<number>(binCount).fill(0);
  for (const score of scores) {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((score - from) / width)));
    counts[index]++;
  }

  return {
    bins: counts.map((count, i) => ({
      from: from + i * width,
      to: from + (i + 1) * width,
      count,
      // A bin counts toward the goal when its whole range clears the threshold.
      meetsGoal: from + i * width >= goal.threshold,
    })),
    max: Math.max(...counts),
  };
}
