import { describe, expect, it } from 'vitest';

import { expectedFiveStars, luckierThan, PULLS_PER_5STAR_SD, pullsForFiveStarsDist } from './luck';
import { EXPECTED_PULLS_PER_5STAR, HARD_PITY, next5Dist } from './pity';

/**
 * Vitest's default is five seconds per test, and these are the handful that
 * genuinely need longer: full DP sweeps and hundred-thousand-trial simulations.
 * They pass in well under this on a quiet machine — the allowance is for a busy
 * one, where forty test files share the cores and a correct test that happens
 * to be slow starts failing for reasons that have nothing to do with it.
 *
 * Raised here rather than globally, so five seconds stays a real signal
 * everywhere else.
 */
const SLOW = { timeout: 30_000 };

describe('pullsForFiveStarsDist', () => {
  it('is the single-5★ distribution for one copy', () => {
    const single = next5Dist(0);
    const dist = pullsForFiveStarsDist(1);
    expect(Array.from(dist)).toEqual(Array.from(single));
  });

  it('sums to one, because hard pity makes every copy certain', () => {
    for (const copies of [1, 2, 5, 12]) {
      const total = pullsForFiveStarsDist(copies).reduce((sum, p) => sum + p, 0);
      expect(total, `${copies} copies`).toBeCloseTo(1, 10);
    }
  });

  it('cannot finish before one pull per copy, or after ninety each', () => {
    const dist = pullsForFiveStarsDist(3);

    for (let k = 0; k < 3; k++) expect(dist[k], `pulls=${k}`).toBe(0);
    expect(dist[3]).toBeGreaterThan(0);
    for (let k = 3 * HARD_PITY + 1; k < dist.length; k++) {
      expect(dist[k], `pulls=${k}`).toBe(0);
    }
  });

  it('has a mean of k times the single-copy mean', () => {
    const dist = pullsForFiveStarsDist(4);
    let mean = 0;
    for (let k = 1; k < dist.length; k++) mean += dist[k] * k;

    expect(mean).toBeCloseTo(4 * EXPECTED_PULLS_PER_5STAR, 8);
  });

  it('refuses a nonsense count rather than returning an empty curve', () => {
    expect(() => pullsForFiveStarsDist(0)).toThrow(RangeError);
    expect(() => pullsForFiveStarsDist(2.5)).toThrow(RangeError);
  });
});

describe('luckierThan', () => {
  it('has nothing to say before the first 5★', () => {
    expect(luckierThan(0, 40)).toBeNull();
    // Fewer pulls than 5★s is not a run, it is bad data.
    expect(luckierThan(3, 2)).toBeNull();
  });

  it('is about even at the expected pace', () => {
    const copies = 10;
    const atAverage = Math.round(copies * EXPECTED_PULLS_PER_5STAR);
    // The distribution is discrete and slightly skewed, so "about" is the
    // strongest honest claim here.
    expect(luckierThan(copies, atAverage)).toBeGreaterThan(0.4);
    expect(luckierThan(copies, atAverage)).toBeLessThan(0.6);
  });

  it('rates a fast run high and a slow one low', () => {
    expect(luckierThan(10, 400)!).toBeGreaterThan(0.95);
    expect(luckierThan(10, 800)!).toBeLessThan(0.05);
  });

  it('falls as the same haul takes longer', () => {
    let previous = 1;
    for (const pulls of [400, 500, 600, 700, 800]) {
      const luck = luckierThan(10, pulls)!;
      expect(luck, `${pulls} pulls`).toBeLessThanOrEqual(previous);
      previous = luck;
    }
  });

  it('knows a lucky streak of three is weaker evidence than one of forty', () => {
    // Both are 10% under the expected pace. The longer run is far less likely
    // to be chance, which is the whole reason for doing this exactly.
    const short = luckierThan(3, Math.round(3 * EXPECTED_PULLS_PER_5STAR * 0.9))!;
    const long = luckierThan(40, Math.round(40 * EXPECTED_PULLS_PER_5STAR * 0.9))!;

    expect(long).toBeGreaterThan(short);
  });

  it('is certain at the extremes', () => {
    // Every 5★ on the first pull: nobody does better.
    expect(luckierThan(5, 5)).toBeCloseTo(1, 6);
    // Every one at hard pity: nobody does worse.
    expect(luckierThan(5, 5 * HARD_PITY)).toBeCloseTo(0, 6);
  });

  /**
   * Past 150 copies the exact convolution gives way to a normal
   * approximation. The two have to agree either side of that line, or the
   * number a player sees would jump.
   */
  it('hands over to the approximation without a jump', SLOW, () => {
    const exact = luckierThan(150, Math.round(150 * EXPECTED_PULLS_PER_5STAR * 0.98))!;
    const approx = luckierThan(151, Math.round(151 * EXPECTED_PULLS_PER_5STAR * 0.98))!;

    expect(Math.abs(exact - approx)).toBeLessThan(0.02);
  });

  it('stays in bounds for an absurd run', () => {
    expect(luckierThan(500, 500)).toBeLessThanOrEqual(1);
    expect(luckierThan(500, 500 * HARD_PITY)).toBeGreaterThanOrEqual(0);
  });
});

describe('summary figures', () => {
  it('expects one 5★ per 62.3 pulls', () => {
    expect(expectedFiveStars(623)).toBeCloseTo(10, 1);
    expect(expectedFiveStars(0)).toBe(0);
  });

  it('knows how wide a single interval is', () => {
    // Around 20 pulls: wide enough that one 5★ says nothing on its own, which
    // is exactly why the percentile is computed over the whole run.
    expect(PULLS_PER_5STAR_SD).toBeGreaterThan(15);
    expect(PULLS_PER_5STAR_SD).toBeLessThan(25);
  });
});
