import { describe, expect, it } from 'vitest';

import { mulberry32 } from '@/engine/rng';
import {
  CONSOLIDATED_5STAR_RATE,
  EXPECTED_PULLS_PER_5STAR,
  HARD_PITY,
  SOFT_PITY_START,
  expectedPullsPer5Star,
  next5Dist,
  p5Char,
} from '@/engine/wish/pity';

/**
 * The tests docs/MATH.md §1 asks for, plus the properties that have to hold for
 * any rate curve — so a future change to the model is caught by more than one
 * fixture agreeing with itself.
 */

describe('p5Char: per-pull 5★ chance', () => {
  it('is the flat base rate before soft pity', () => {
    for (const n of [1, 2, 50, 72, 73]) {
      expect(p5Char(n), `pull ${n}`).toBe(0.006);
    }
  });

  it('climbs by 6 points a pull once soft pity starts at 74', () => {
    expect(p5Char(74)).toBeCloseTo(0.066, 12);
    expect(p5Char(75)).toBeCloseTo(0.126, 12);
    expect(p5Char(89)).toBeCloseTo(0.966, 12);
  });

  it('is a certainty at hard pity', () => {
    expect(p5Char(90)).toBe(1);
  });

  it('never exceeds 1, even past hard pity', () => {
    // Callers should not ask, but a rate above 1 would silently corrupt any DP
    // that multiplies by it.
    for (const n of [90, 91, 120, 1000]) {
      expect(p5Char(n)).toBe(1);
    }
  });

  it('is a probability at every pull', () => {
    for (let n = 1; n <= HARD_PITY; n++) {
      const p = p5Char(n);
      expect(p, `pull ${n}`).toBeGreaterThanOrEqual(0);
      expect(p, `pull ${n}`).toBeLessThanOrEqual(1);
    }
  });

  it('never decreases', () => {
    for (let n = 2; n <= HARD_PITY; n++) {
      expect(p5Char(n), `pull ${n}`).toBeGreaterThanOrEqual(p5Char(n - 1));
    }
  });

  it('agrees with the named boundaries', () => {
    expect(p5Char(SOFT_PITY_START - 1)).toBe(0.006);
    expect(p5Char(SOFT_PITY_START)).toBeGreaterThan(0.006);
    expect(p5Char(HARD_PITY)).toBe(1);
  });
});

describe('next5Dist: pulls until the next 5★', () => {
  it('is a proper distribution from any pity', () => {
    for (const pity of [0, 1, 22, 73, 74, 89]) {
      const dist = next5Dist(pity);
      const total = dist.reduce((sum, p) => sum + p, 0);
      expect(total, `pity ${pity}`).toBeCloseTo(1, 12);
      for (const p of dist) expect(p).toBeGreaterThanOrEqual(0);
    }
  });

  it('is indexed by pulls, with nothing at index 0', () => {
    const dist = next5Dist(0);
    expect(dist[0]).toBe(0);
    expect(dist.length).toBe(HARD_PITY + 1);
  });

  it('cannot run past hard pity', () => {
    const dist = next5Dist(0);
    expect(dist[HARD_PITY]).toBeGreaterThan(0);
    // 90 pulls from pity 0 is a certainty, so the mass is fully spent by then.
    const total = dist.reduce((sum, p) => sum + p, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('shortens as pity builds', () => {
    // From pity 89 the very next pull is guaranteed.
    const atHardPity = next5Dist(HARD_PITY - 1);
    expect(atHardPity[1]).toBe(1);
    expect(atHardPity.slice(2).reduce((s, p) => s + p, 0)).toBe(0);
  });

  it('starts at the base rate on the first pull', () => {
    expect(next5Dist(0)[1]).toBe(0.006);
    // From pity 73 the next pull is the first soft-pity pull.
    expect(next5Dist(73)[1]).toBeCloseTo(0.066, 12);
  });

  it('rejects a pity outside the range the game can produce', () => {
    expect(() => next5Dist(-1)).toThrow();
    expect(() => next5Dist(HARD_PITY)).toThrow();
    expect(() => next5Dist(1.5)).toThrow();
  });
});

describe('expected pulls per 5★', () => {
  /**
   * The check MATH.md §1 names: this model has to reproduce HoYoverse's
   * published 1.6% consolidated rate, or the rate curve is wrong.
   */
  it('is 62.30, matching the published 1.6% consolidated rate', () => {
    expect(expectedPullsPer5Star()).toBeCloseTo(62.2973, 4);
    expect(expectedPullsPer5Star()).toBeCloseTo(EXPECTED_PULLS_PER_5STAR, 10);

    const consolidated = 1 / expectedPullsPer5Star();
    expect(consolidated).toBeCloseTo(0.016052, 6);
    // Rounds to the official 1.6%.
    expect(Number((consolidated * 100).toFixed(1))).toBe(1.6);
    expect(consolidated).toBeCloseTo(CONSOLIDATED_5STAR_RATE, 10);
  });

  it('derives from next5Dist rather than a separate formula', () => {
    // Guards against the two drifting apart.
    const dist = next5Dist(0);
    const mean = dist.reduce((sum, p, pulls) => sum + p * pulls, 0);
    expect(mean).toBeCloseTo(expectedPullsPer5Star(), 12);
  });

  it('agrees with a seeded simulation', () => {
    const rng = mulberry32(2026);
    const runs = 200_000;
    let totalPulls = 0;

    for (let run = 0; run < runs; run++) {
      let pity = 0;
      for (;;) {
        pity++;
        if (rng() < p5Char(pity)) break;
      }
      totalPulls += pity;
    }

    // Standard error is roughly 0.05 pulls at this sample size, so 0.1 is a
    // comfortable band that still fails if the model is meaningfully off.
    expect(totalPulls / runs).toBeCloseTo(expectedPullsPer5Star(), 1);
  });
});
