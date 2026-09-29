import { mulberry32 } from '../rng';
import {
  DOMAIN_FOUR_LINE_CHANCE,
  MAIN_STAT_ODDS,
  freshDrop,
  simulateToMax,
  type MainStatKey,
  type Slot,
} from './model';
import { scoreOf, type Goal } from './score';

/**
 * How much resin a replacement piece costs.
 *
 * Chains four independent filters — the domain gives the right set half the
 * time, the right slot a fifth of the time, the right main stat at its
 * published odds, and then the substats have to land — and turns the result
 * into runs, resin and days.
 *
 * See docs/MATH.md section 4.
 */

/** A domain run costs this much resin. */
export const RESIN_PER_RUN = 20;

/**
 * Average 5-star pieces per run: one guaranteed, plus roughly a 7% chance of a
 * second.
 *   source: https://news.bittopup.com/news/genshin-impact-loot-scaling-guide-ar45-drop-rates
 *   verifiedAt: 2026-09-29
 */
export const FIVE_STARS_PER_RUN = 1.07;

/** A domain holds two sets, so the piece you want is a coin flip. */
export const SET_CHANCE = 0.5;

/** Five slots, evenly. */
export const SLOT_CHANCE = 0.2;

/**
 * Natural resin regenerates one per 8 minutes, so 180 a day.
 *   source: https://genshin-impact.fandom.com/wiki/Original_Resin
 *   verifiedAt: 2026-09-29
 */
export const RESIN_PER_DAY = 180;

export type ResinEstimateInput = {
  slot: Slot;
  mainStat: MainStatKey;
  goal: Goal;
  /** Trials for the substat half of the estimate. */
  trials?: number;
  seed?: number;
  fourLineChance?: number;
};

export type ResinEstimate = {
  /** Chance one 5-star drop from this domain is the piece you want. */
  pieceChance: number;
  /** Chance a single run produces at least one such piece. */
  perRunChance: number;
  /** Chance a fresh drop with the right main stat finishes at the goal. */
  substatChance: number;
  median: { runs: number; resin: number; days: number };
  p90: { runs: number; resin: number; days: number };
};

/** Runs needed to have reached `quantile` odds of at least one success. */
export function runsForQuantile(perRunChance: number, quantile: number): number {
  if (!(quantile > 0) || quantile >= 1) {
    throw new RangeError(`quantile must be in (0, 1), got ${quantile}`);
  }
  if (perRunChance <= 0) return Number.POSITIVE_INFINITY;
  if (perRunChance >= 1) return 1;
  return Math.ceil(Math.log(1 - quantile) / Math.log(1 - perRunChance));
}

export function resinEstimate({
  slot,
  mainStat,
  goal,
  trials = 40_000,
  seed = 11,
  fourLineChance = DOMAIN_FOUR_LINE_CHANCE,
}: ResinEstimateInput): ResinEstimate {
  const mainChance = MAIN_STAT_ODDS[slot][mainStat] ?? 0;

  // How often a brand new piece with this main stat finishes at the goal.
  const rng = mulberry32(seed);
  let met = 0;
  for (let i = 0; i < trials; i++) {
    const drop = freshDrop(mainStat, rng, fourLineChance);
    if (scoreOf(simulateToMax(drop, 0, mainStat, rng), goal) >= goal.threshold) met++;
  }
  const substatChance = met / trials;

  const pieceChance = SET_CHANCE * SLOT_CHANCE * mainChance * substatChance;

  // Drops per run are Poisson-ish around 1.07, so the chance a run yields at
  // least one keeper is 1 - e^(-rate x p) rather than simply rate x p.
  const perRunChance = 1 - Math.exp(-FIVE_STARS_PER_RUN * pieceChance);

  const toCost = (quantile: number) => {
    const runs = runsForQuantile(perRunChance, quantile);
    const resin = runs * RESIN_PER_RUN;
    return { runs, resin, days: resin / RESIN_PER_DAY };
  };

  return {
    pieceChance,
    perRunChance,
    substatChance,
    median: toCost(0.5),
    p90: toCost(0.9),
  };
}
