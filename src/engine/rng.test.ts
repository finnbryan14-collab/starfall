import { describe, expect, it } from 'vitest';

import { mulberry32, type Rng } from '@/engine/rng';

/**
 * Reference sequences captured from the mulberry32 in design/preview.html.
 *
 * These pin the port to the prototype. The starfield, the artifact simulator
 * and the resin estimator all draw from this generator with fixed seeds, so if
 * these values ever move, every seeded result in the app moves with them.
 */
const REFERENCE: Record<number, number[]> = {
  2026: [
    0.45540769933722913, 0.30849614599719644, 0.6611574492417276, 0.6184752183035016,
    0.15228010178543627,
  ],
  7: [
    0.011704753153026104, 0.06195825757458806, 0.97690763277933, 0.6990287057124078,
    0.5214452685322613,
  ],
  11: [
    0.5115870486479253, 0.5299464082345366, 0.6081185641232878, 0.5901576359756291,
    0.8507766961120069,
  ],
  0: [
    0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111,
    0.46732782293111086,
  ],
};

describe('mulberry32', () => {
  it('reproduces the prototype byte for byte', () => {
    for (const [seed, expected] of Object.entries(REFERENCE)) {
      const rng = mulberry32(Number(seed));
      const actual = Array.from({ length: expected.length }, () => rng());
      expect(actual, `seed ${seed}`).toEqual(expected);
    }
  });

  it('is deterministic: the same seed replays the same sequence', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds give different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(Array.from({ length: 20 }, () => a())).not.toEqual(
      Array.from({ length: 20 }, () => b()),
    );
  });

  it('stays in [0, 1)', () => {
    // Range is checked in a tight loop and asserted once. Calling expect()
    // 200,000 times costs seconds of matcher overhead, which made this test
    // time out under a loaded parallel suite while passing on its own — a
    // flake created entirely by how it was written.
    const rng = mulberry32(2026);
    let min = Infinity;
    let max = -Infinity;
    let outOfRange = 0;

    for (let i = 0; i < 100_000; i++) {
      const value = rng();
      if (value < min) min = value;
      if (value > max) max = value;
      if (!(value >= 0 && value < 1)) outOfRange++;
    }

    expect(outOfRange, `values outside [0, 1): min ${min}, max ${max}`).toBe(0);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
  });

  it('is roughly uniform', () => {
    const rng = mulberry32(2026);
    const buckets = new Array(10).fill(0);
    const n = 200_000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const value = rng();
      sum += value;
      buckets[Math.floor(value * 10)]++;
    }
    expect(sum / n).toBeCloseTo(0.5, 2);
    // Each decile should hold about a tenth; allow a generous 10% relative slack.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 10 - n / 100);
      expect(count).toBeLessThan(n / 10 + n / 100);
    }
  });

  it('is usable wherever an Rng is expected', () => {
    const take = (rng: Rng, n: number) => Array.from({ length: n }, () => rng());
    expect(take(mulberry32(7), 3)).toEqual(REFERENCE[7].slice(0, 3));
  });
});
