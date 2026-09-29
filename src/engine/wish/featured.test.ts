import { describe, expect, it } from 'vitest';

import { mulberry32, type Rng } from '@/engine/rng';
import { HARD_PITY, p5Char } from '@/engine/wish/pity';
import {
  consolidated55,
  exhaustionBound,
  featuredCdf,
  pullsForQuantile,
  type FiftyFiftyModel,
} from '@/engine/wish/featured';

/** Straight simulation of the same process the DP folds up. */
function simulateFeatured(
  rng: Rng,
  { pity, guaranteed, copies }: { pity: number; guaranteed: boolean; copies: number },
  model: FiftyFiftyModel = consolidated55,
): number {
  let state = model.initial(guaranteed);
  let currentPity = pity;
  let got = 0;
  let pulls = 0;

  while (got < copies) {
    pulls++;
    currentPity++;
    if (rng() < p5Char(currentPity)) {
      currentPity = 0;
      if (rng() < model.featuredChance(state)) {
        got++;
        state = model.next(state, 'featured');
      } else {
        state = model.next(state, 'lost');
      }
    }
  }
  return pulls;
}

describe('consolidated55', () => {
  it('is the official 55% consolidated featured rate', () => {
    expect(consolidated55.featuredChance(consolidated55.initial(false))).toBe(0.55);
  });

  it('is a certainty when guaranteed', () => {
    expect(consolidated55.featuredChance(consolidated55.initial(true))).toBe(1);
  });

  it('sets the guarantee after a loss and clears it after a featured pull', () => {
    const fresh = consolidated55.initial(false);
    const afterLoss = consolidated55.next(fresh, 'lost');
    expect(consolidated55.featuredChance(afterLoss)).toBe(1);

    // A featured 5-star always leaves you back on the 50/50, guaranteed or not.
    expect(consolidated55.featuredChance(consolidated55.next(afterLoss, 'featured'))).toBe(0.55);
    expect(consolidated55.featuredChance(consolidated55.next(fresh, 'featured'))).toBe(0.55);
  });

  it('is stateless beyond the guarantee flag, so it has exactly two states', () => {
    expect(consolidated55.states).toHaveLength(2);
  });
});

describe('exhaustionBound', () => {
  /**
   * docs/MATH.md originally gave (90 - pity) + 90 * copies. That assumes a
   * single lost 50/50 across the whole run, but the guarantee clears after
   * every featured copy, so you can lose one before each. It is right for one
   * copy by coincidence and wrong from two up.
   */
  it('allows a lost 50/50 before every copy', () => {
    expect(exhaustionBound(0, 1, false)).toBe(180);
    expect(exhaustionBound(0, 2, false)).toBe(360);
    expect(exhaustionBound(0, 7, false)).toBe(1260);
  });

  it('drops one 5-star when already guaranteed', () => {
    expect(exhaustionBound(0, 1, true)).toBe(90);
    expect(exhaustionBound(0, 2, true)).toBe(270);
    expect(exhaustionBound(0, 7, true)).toBe(1170);
  });

  it('is shortened by existing pity', () => {
    expect(exhaustionBound(22, 1, false)).toBe(158);
    expect(exhaustionBound(89, 1, true)).toBe(1);
  });

  it('is where the CDF actually reaches certainty', () => {
    for (const guaranteed of [false, true]) {
      for (const [pity, copies] of [
        [0, 1],
        [22, 1],
        [89, 1],
        [0, 2],
        [45, 3],
        [10, 4],
        [0, 7],
      ] as const) {
        const bound = exhaustionBound(pity, copies, guaranteed);
        const cdf = featuredCdf({ pity, guaranteed, copies });
        const label = `pity ${pity} copies ${copies} guaranteed ${guaranteed}`;
        expect(cdf[bound], label).toBeCloseTo(1, 9);
      }
    }
  });

  it('is not met early - the old MATH.md bound falls short from two copies up', () => {
    const oldBound = (pity: number, copies: number) => 90 - pity + 90 * copies;
    const cdf = featuredCdf({ pity: 0, guaranteed: false, copies: 2 });
    expect(cdf[oldBound(0, 2)]).toBeLessThan(0.93);
    expect(cdf[exhaustionBound(0, 2, false)]).toBeCloseTo(1, 9);
  });
});

describe('featuredCdf', () => {
  it('matches the fixtures in MATH.md section 1', () => {
    // Guaranteed, pity 0, one copy -> certain by hard pity.
    expect(featuredCdf({ pity: 0, guaranteed: true, copies: 1 })[HARD_PITY]).toBeCloseTo(1, 12);

    // Not guaranteed, pity 0, one copy.
    const notGuaranteed = featuredCdf({ pity: 0, guaranteed: false, copies: 1 });
    expect(notGuaranteed[90]).toBeCloseTo(0.6345, 4);
    expect(notGuaranteed[180]).toBeCloseTo(1, 9);
  });

  it('reproduces the headline example from the preview', () => {
    // 11,200 primogems + 3,850 income + 14 fates = 108 pulls, pity 22, 50/50.
    const at = (copies: number) =>
      featuredCdf({ pity: 22, guaranteed: false, copies, maxPulls: 400 })[108];

    expect(at(1)).toBeCloseTo(0.7287877714682606, 12);
    expect(at(2)).toBeCloseTo(0.1565303080626389, 12);
    expect(at(3)).toBeCloseTo(0.015302976149471289, 12);

    // What the UI renders.
    expect((at(1) * 100).toFixed(1)).toBe('72.9');
  });

  it('is non-decreasing and bounded by 1', () => {
    // Scanned in a loop and asserted once per curve: an expect() per pull is
    // tens of thousands of matcher calls across seven curves, which is slow
    // enough to time out under a loaded suite.
    for (const copies of [1, 2, 3, 4, 5, 6, 7]) {
      const cdf = featuredCdf({ pity: 13, guaranteed: false, copies });
      expect(cdf[0]).toBe(0);

      let firstDecrease = -1;
      let firstOverOne = -1;
      for (let t = 1; t < cdf.length; t++) {
        if (firstDecrease < 0 && cdf[t] < cdf[t - 1]) firstDecrease = t;
        if (firstOverOne < 0 && cdf[t] > 1 + 1e-9) firstOverOne = t;
      }

      expect(firstDecrease, `copies ${copies} went down at pull ${firstDecrease}`).toBe(-1);
      expect(firstOverOne, `copies ${copies} exceeded 1 at pull ${firstOverOne}`).toBe(-1);
    }
  });

  it('is strictly harder for each additional copy', () => {
    // Explicit maxPulls: the default is the per-copy exhaustion bound, so
    // without it the shorter curves would not reach index 300 at all.
    const at = (copies: number) =>
      featuredCdf({ pity: 0, guaranteed: false, copies, maxPulls: 400 })[300];
    for (let copies = 2; copies <= 7; copies++) {
      expect(at(copies), `copies ${copies}`).toBeLessThan(at(copies - 1));
    }
  });

  it('is never worse for a player with more pity', () => {
    for (let pity = 1; pity < HARD_PITY; pity++) {
      const less = featuredCdf({ pity: pity - 1, guaranteed: false, copies: 1, maxPulls: 200 });
      const more = featuredCdf({ pity, guaranteed: false, copies: 1, maxPulls: 200 });
      expect(more[100], `pity ${pity}`).toBeGreaterThanOrEqual(less[100] - 1e-12);
    }
  });

  it('is never worse when guaranteed', () => {
    for (const copies of [1, 2, 3]) {
      const fifty = featuredCdf({ pity: 30, guaranteed: false, copies, maxPulls: 400 });
      const sure = featuredCdf({ pity: 30, guaranteed: true, copies, maxPulls: 400 });
      for (let t = 0; t <= 400; t++) {
        expect(sure[t], `copies ${copies} pull ${t}`).toBeGreaterThanOrEqual(fifty[t] - 1e-12);
      }
    }
  });

  it('defaults maxPulls to the exhaustion bound, so it is never silently truncated', () => {
    const cdf = featuredCdf({ pity: 0, guaranteed: false, copies: 7 });
    expect(cdf.length - 1).toBe(exhaustionBound(0, 7, false));
    expect(cdf[cdf.length - 1]).toBeCloseTo(1, 9);
  });

  it('rejects inputs it cannot model', () => {
    expect(() => featuredCdf({ copies: 0 })).toThrow();
    expect(() => featuredCdf({ copies: 8 })).toThrow();
    expect(() => featuredCdf({ pity: -1 })).toThrow();
    expect(() => featuredCdf({ pity: HARD_PITY })).toThrow();
    expect(() => featuredCdf({ maxPulls: -1 })).toThrow();
  });
});

/** The condition ROADMAP names for this task: the DP and a simulation agree. */
describe('DP agrees with Monte Carlo', () => {
  it('matches a 100k seeded simulation within 0.5pp at ten checkpoints', () => {
    const cases = [
      { pity: 0, guaranteed: false, copies: 1 },
      { pity: 22, guaranteed: false, copies: 1 },
      { pity: 60, guaranteed: true, copies: 1 },
      { pity: 0, guaranteed: false, copies: 2 },
      { pity: 30, guaranteed: true, copies: 3 },
    ];

    for (const config of cases) {
      const runs = 100_000;
      const rng = mulberry32(2026);
      const samples = new Int32Array(runs);
      for (let i = 0; i < runs; i++) samples[i] = simulateFeatured(rng, config);

      const cdf = featuredCdf(config);
      const maxPulls = cdf.length - 1;

      for (let i = 1; i <= 10; i++) {
        const checkpoint = Math.round((maxPulls * i) / 10);
        let hits = 0;
        for (const sample of samples) if (sample <= checkpoint) hits++;
        const empirical = hits / runs;
        const label = `${JSON.stringify(config)} at ${checkpoint}: DP ${cdf[checkpoint].toFixed(4)}, sim ${empirical.toFixed(4)}`;

        expect(Math.abs(empirical - cdf[checkpoint]), label).toBeLessThan(0.005);
      }
    }
  });
});

describe('pullsForQuantile', () => {
  const cdf = featuredCdf({ pity: 22, guaranteed: false, copies: 1, maxPulls: 400 });

  it('finds the first pull that reaches the odds', () => {
    // Verified against the model: 50% at 58, 75% at 116, 90% at 134.
    expect(pullsForQuantile(cdf, 0.5)).toBe(58);
    expect(pullsForQuantile(cdf, 0.75)).toBe(116);
    expect(pullsForQuantile(cdf, 0.9)).toBe(134);
  });

  it('actually reaches the quantile at the pull it names, and not before', () => {
    for (const q of [0.25, 0.5, 0.75, 0.9, 0.99]) {
      const pulls = pullsForQuantile(cdf, q)!;
      expect(cdf[pulls], `q=${q}`).toBeGreaterThanOrEqual(q);
      expect(cdf[pulls - 1], `q=${q}`).toBeLessThan(q);
    }
  });

  it('never goes down as the odds asked for go up', () => {
    let previous = 0;
    for (const q of [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]) {
      const pulls = pullsForQuantile(cdf, q)!;
      expect(pulls).toBeGreaterThanOrEqual(previous);
      previous = pulls;
    }
  });

  /**
   * The latent bug in the preview: it uses findIndex, which returns -1 when the
   * quantile is never reached, and -1 then flows into the UI as a pull count.
   */
  it('returns null rather than -1 when the odds are out of reach', () => {
    const truncated = featuredCdf({ pity: 0, guaranteed: false, copies: 7, maxPulls: 200 });
    expect(pullsForQuantile(truncated, 0.9)).toBeNull();
  });

  it('rejects a quantile outside (0, 1]', () => {
    expect(() => pullsForQuantile(cdf, 0)).toThrow();
    expect(() => pullsForQuantile(cdf, 1.5)).toThrow();
    expect(() => pullsForQuantile(cdf, -0.1)).toThrow();
  });
});
