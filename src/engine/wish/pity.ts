/**
 * Character event banner: the per-pull 5★ rate curve, and the distribution of
 * pulls until the next 5★.
 *
 * HoYoverse publishes three numbers — a 0.6% base rate, a 1.6% consolidated
 * rate, and a guarantee within 90 pulls — but not the shape of the curve in
 * between. The piecewise model below is the widely used community
 * reconstruction, and it is kept honest by the fact that it has to reproduce
 * the published 1.6%: see `expectedPullsPer5Star`, which lands on 62.30 pulls
 * and therefore 1.605%. If the curve were wrong, that check would fail.
 *
 * Model and published rates:
 *   source: https://news.bittopup.com/news/genshin-impact-pity-system-guide-90-pull-guarantee-50-50
 *   verifiedAt: 2026-09-28
 *   see also docs/MATH.md §1
 *
 * Community-derived. Treat the shape as replaceable; the published endpoints
 * are not.
 */

/** Base per-pull chance before soft pity. Published by HoYoverse. */
export const BASE_5STAR_RATE = 0.006;

/** First pull on which the rate starts climbing. Community-derived. */
export const SOFT_PITY_START = 74;

/** The rate climbs by this much per pull through soft pity. Community-derived. */
export const SOFT_PITY_INCREMENT = 0.06;

/** A 5★ is guaranteed by this pull. Published by HoYoverse. */
export const HARD_PITY = 90;

/**
 * Chance that the `n`-th pull since the last 5★ is a 5★.
 *
 * `n` counts from 1, so a player at pity 22 is asking about `p5Char(23)` for
 * their next pull.
 */
export function p5Char(n: number): number {
  if (n >= HARD_PITY) return 1;
  if (n >= SOFT_PITY_START) {
    return Math.min(1, BASE_5STAR_RATE + SOFT_PITY_INCREMENT * (n - (SOFT_PITY_START - 1)));
  }
  return BASE_5STAR_RATE;
}

/**
 * Distribution of how many further pulls it takes to hit the next 5★.
 *
 * Indexed by pulls: `dist[k]` is the chance the next 5★ arrives on the k-th
 * pull from now. `dist[0]` is always 0 — a 5★ cannot arrive before you pull.
 * The array sums to 1, because hard pity makes a 5★ certain within
 * `HARD_PITY - pity` pulls.
 *
 * @param pity pulls already taken since the last 5★, 0 to HARD_PITY - 1.
 */
export function next5Dist(pity: number): Float64Array {
  if (!Number.isInteger(pity) || pity < 0 || pity >= HARD_PITY) {
    throw new RangeError(`pity must be an integer in [0, ${HARD_PITY - 1}], got ${pity}`);
  }

  const dist = new Float64Array(HARD_PITY + 1);
  let survives = 1;

  for (let k = 1; k <= HARD_PITY - pity; k++) {
    const p = p5Char(pity + k);
    dist[k] = survives * p;
    survives *= 1 - p;
    if (survives <= 0) break;
  }

  return dist;
}

/**
 * Mean pulls between 5★s, starting from fresh pity.
 *
 * This is the check MATH.md §1 names: its reciprocal is the consolidated rate,
 * which has to match HoYoverse's published 1.6%.
 */
export function expectedPullsPer5Star(): number {
  const dist = next5Dist(0);
  let mean = 0;
  for (let k = 1; k < dist.length; k++) mean += dist[k] * k;
  return mean;
}

/** 62.2973 — the model's mean, precomputed for tests and display. */
export const EXPECTED_PULLS_PER_5STAR = expectedPullsPer5Star();

/**
 * 0.016052 — the consolidated 5★ rate this model implies.
 * Rounds to the published 1.6%.
 */
export const CONSOLIDATED_5STAR_RATE = 1 / EXPECTED_PULLS_PER_5STAR;
