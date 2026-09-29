import { describe, expect, it } from 'vitest';

import { exhaustionBound, featuredCdf, featuredCdfs } from '@/engine/wish/featured';

/**
 * SPEC.md: changing any input updates results in under 50ms.
 *
 * The worst case the Plan screen can ask for is a C6 goal from fresh pity with
 * no guarantee: every curve from C0 to C6 over the full 1,260-pull exhaustion
 * bound. featuredCdfs computes all seven in one pass, which is how the screen
 * must call it — running featuredCdf once per copy count measured 99ms, twice
 * the budget, against 26ms for the single pass.
 *
 * Every wall-clock assertion lives under `pnpm perf`, which runs this file on
 * its own. Inside `pnpm test` it competes with ten other files across worker
 * threads, and both the absolute check and a single-pass-versus-repeated ratio
 * failed on roughly half of full-suite runs. The ratio was no better: its two
 * measurements are taken at different moments, so contention skews them
 * independently. What stays in the default suite is the correctness claim that
 * makes the fast path safe — that it produces the same curves.
 */

const PERF = Boolean(process.env.PERF);

/** Median of several runs, so one unlucky GC pause is not the measurement. */
function medianMs(run: () => void, samples = 5): number {
  run(); // warm up, so the measurement is not dominated by first-call JIT
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(samples / 2)];
}

const worstCase = () => featuredCdfs({ pity: 0, guaranteed: false, maxCopies: 7 });
const repeatedCase = () => {
  for (let copies = 1; copies <= 7; copies++) {
    featuredCdf({ pity: 0, guaranteed: false, copies });
  }
};

describe('single-pass DP correctness', () => {
  it('needs 1,260 pulls for the worst case, so the budget is about that range', () => {
    expect(exhaustionBound(0, 7, false)).toBe(1260);
  });

  it('produces identical curves either way, so the fast path is not cutting corners', () => {
    const all = worstCase();
    for (let copies = 1; copies <= 7; copies++) {
      const alone = featuredCdf({ pity: 0, guaranteed: false, copies });
      // The single-pass curves run to the C6 bound; compare over the shorter one.
      for (let t = 0; t < alone.length; t++) {
        expect(all[copies - 1][t], `copies ${copies} pull ${t}`).toBeCloseTo(alone[t], 12);
      }
    }
  });

  it('gives every copy count its own curve, ordered by difficulty', () => {
    const all = featuredCdfs({ pity: 0, guaranteed: false, maxCopies: 7 });
    expect(all).toHaveLength(7);

    // Never easier for an extra copy, at every pull. Compared with a tolerance
    // rather than strictly: past its exhaustion bound a curve sits at 1, and
    // two saturated curves differ only by accumulated float error — 1 - 5e-15
    // against 1 - 2e-15. featured.test.ts asserts the strict ordering at a pull
    // count where the curves are genuinely apart.
    for (let k = 1; k < 7; k++) {
      for (let t = 0; t < all[k].length; t++) {
        expect(all[k][t], `copies ${k + 1} at pull ${t}`).toBeLessThanOrEqual(
          all[k - 1][t] + 1e-12,
        );
      }
    }
  });
});

describe.skipIf(!PERF)('performance budget (pnpm perf)', () => {
  it('computes every constellation curve for the worst case inside 50ms', () => {
    const elapsed = medianMs(worstCase);
    expect(elapsed, `worst-case C6 recompute took ${elapsed.toFixed(1)}ms`).toBeLessThan(50);
  });

  it('computes the common case (C0-C2) well inside the budget', () => {
    const elapsed = medianMs(() => featuredCdfs({ pity: 22, guaranteed: false, maxCopies: 3 }));
    expect(elapsed, `C0-C2 recompute took ${elapsed.toFixed(1)}ms`).toBeLessThan(20);
  });

  it('is at least twice as fast as one featuredCdf call per copy count', () => {
    const single = medianMs(worstCase);
    const repeated = medianMs(repeatedCase);
    const ratio = repeated / single;
    expect(
      ratio,
      `single pass ${single.toFixed(1)}ms vs repeated ${repeated.toFixed(1)}ms (${ratio.toFixed(1)}x)`,
    ).toBeGreaterThan(2);
  });
});
