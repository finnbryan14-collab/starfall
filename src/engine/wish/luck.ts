import { EXPECTED_PULLS_PER_5STAR, HARD_PITY, next5Dist } from './pity';

/**
 * How lucky a player's pulls actually were.
 *
 * "Average pity 58 against an expected 62.3" tells you the sign but not the
 * size — a run of three 5★s at 58 is nothing, the same average over forty is
 * remarkable. What answers that is the exact distribution of how many pulls it
 * takes to get k 5★s, which is the k-fold convolution of the single-5★
 * distribution the planner already has (src/engine/wish/pity.ts).
 *
 * So this is not a heuristic or a simulation: it is the same model that
 * produces the planner's odds, read in the other direction.
 *
 * docs/MATH.md section 1.
 */

/** Above this, the convolution costs more than the extra exactness is worth. */
const EXACT_LIMIT = 150;

/** Mean and variance of the pulls between two 5★s, for the large-k fallback. */
function singleMoments(): { mean: number; variance: number } {
  const dist = next5Dist(0);
  let mean = 0;
  let second = 0;

  for (let k = 1; k < dist.length; k++) {
    mean += dist[k] * k;
    second += dist[k] * k * k;
  }

  return { mean, variance: second - mean * mean };
}

const SINGLE = singleMoments();

/** Standard deviation of the pulls between two 5★s. */
export const PULLS_PER_5STAR_SD = Math.sqrt(SINGLE.variance);

/**
 * Distribution of the total pulls needed for `copies` 5★s, from fresh pity.
 *
 * Indexed by pulls, so `dist[k]` is the chance the k-th pull is the one that
 * lands the last of them. Each convolution grows the support by at most
 * HARD_PITY, which bounds the whole thing at `copies * 90`.
 */
export function pullsForFiveStarsDist(copies: number): Float64Array {
  if (!Number.isInteger(copies) || copies < 1) {
    throw new RangeError(`copies must be a positive integer, got ${copies}`);
  }

  const single = next5Dist(0);
  let dist = single;

  /*
    The support grows by 90 with every copy, but the *mass* does not: by forty
    copies it occupies a band a few hundred wide inside a range of 3,600. Left
    untrimmed the cost is quadratic in that dead space — 150 copies took the
    better part of seven seconds, which is the sort of thing that only shows up
    once a machine is busy.

    Entries below this share of the peak contribute nothing a percentage
    rounded to a whole number could ever see, and dropping them keeps the total
    within float noise of 1. A test asserts that.
  */
  const NEGLIGIBLE = 1e-15;

  for (let i = 1; i < copies; i++) {
    const next = new Float64Array(dist.length + HARD_PITY);

    for (let a = 1; a < dist.length; a++) {
      const weight = dist[a];
      if (weight === 0) continue;
      for (let b = 1; b < single.length; b++) {
        next[a + b] += weight * single[b];
      }
    }

    dist = trim(next, NEGLIGIBLE);
  }

  return dist;
}

/**
 * Zeroes the negligible tails so the next convolution skips them.
 *
 * The array keeps its length and its indices — they *are* the pull count — so
 * only the values are cleared. The inner loop already skips zeroes.
 */
function trim(dist: Float64Array, relative: number): Float64Array {
  let peak = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > peak) peak = dist[i];

  const floor = peak * relative;
  for (let i = 0; i < dist.length; i++) if (dist[i] < floor) dist[i] = 0;

  return dist;
}

/** Standard normal CDF, via the error function's usual rational approximation. */
function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26, good to about 1.5e-7 — far finer than a
  // percentage shown to one decimal place.
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/**
 * The share of players who would have needed *more* pulls for the same haul.
 *
 * 0.9 means nine players in ten would still be waiting: a very lucky run. 0.1
 * means nine in ten would already have finished. Exactly 0.5 is average.
 *
 * `pulls` counts only the pulls that produced those 5★s — the pity built up
 * since the last one is an unfinished attempt and says nothing yet.
 *
 * Null when there is nothing to judge: no 5★s yet.
 */
export function luckierThan(fiveStars: number, pulls: number): number | null {
  if (fiveStars < 1 || pulls < fiveStars) return null;

  if (fiveStars <= EXACT_LIMIT) {
    const dist = pullsForFiveStarsDist(fiveStars);
    let atMost = 0;
    for (let k = 1; k <= Math.min(pulls, dist.length - 1); k++) atMost += dist[k];
    return Math.min(1, Math.max(0, 1 - atMost));
  }

  // Beyond the exact limit the central limit theorem is overwhelming: 150
  // independent draws of a distribution with no tail to speak of.
  const mean = fiveStars * SINGLE.mean;
  const sd = Math.sqrt(fiveStars * SINGLE.variance);
  return Math.min(1, Math.max(0, 1 - normalCdf((pulls - mean) / sd)));
}

/** 5★s the model expects from this many pulls. */
export function expectedFiveStars(pulls: number): number {
  return pulls / EXPECTED_PULLS_PER_5STAR;
}
