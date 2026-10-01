import { describe, expect, it } from 'vitest';

import { DEFAULT_ASSUMPTIONS } from '@/engine/income';
import { computePlan, copiesFor, QUANTILES } from '@/engine/wish/plan';

const from = new Date('2026-09-28T10:00:00Z');
const to = new Date('2026-10-13T10:00:00Z'); // 15 daily resets

/** The preview's example, with income supplied rather than projected. */
const previewInput = {
  primogems: 11_200 + 3_850,
  fates: 14,
  pity: 22,
  guaranteed: false,
  constellation: 0,
  from,
  to,
  assumptions: DEFAULT_ASSUMPTIONS,
  enabled: {},
};

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

describe('computePlan', () => {
  it('reproduces the headline answer from the preview', () => {
    const result = computePlan(previewInput);
    expect(result.pulls).toBe(108);
    expect((result.chance * 100).toFixed(1)).toBe('72.9');
  });

  it('gives the constellation row the preview shows', () => {
    const result = computePlan({ ...previewInput, constellation: 2 });
    const rounded = result.constellations.map((c) => Math.round(c.chance * 100));
    expect(rounded).toEqual([73, 16, 2]);
    expect(result.constellations.map((c) => c.label)).toEqual(['C0', 'C1', 'C2']);
  });

  it('answers for the chosen constellation, not always C0', () => {
    const c0 = computePlan({ ...previewInput, constellation: 0 });
    const c2 = computePlan({ ...previewInput, constellation: 2 });
    expect(c2.chance).toBeLessThan(c0.chance);
    expect(c2.chance).toBeCloseTo(c2.constellations[2].chance, 12);
  });

  it('reproduces the hint the preview prints', () => {
    const result = computePlan(previewInput);
    const ninety = result.targets.find((t) => t.quantile === 0.9)!;
    expect(ninety.pulls).toBe(134);
    expect(ninety.morePulls).toBe(26);
    expect(ninety.morePrimogems).toBe(4_160);
    expect(ninety.reached).toBe(false);
  });

  it('reports odds already reached as needing nothing more', () => {
    const result = computePlan({ ...previewInput, primogems: 999_999 });
    for (const target of result.targets) {
      expect(target.reached, `q=${target.quantile}`).toBe(true);
      expect(target.morePulls).toBe(0);
      expect(target.morePrimogems).toBe(0);
    }
  });

  it('offers the three quantiles SPEC names', () => {
    const result = computePlan(previewInput);
    expect(result.targets.map((t) => t.quantile)).toEqual([...QUANTILES]);
  });

  it('projects income when sources are switched on', () => {
    const withIncome = computePlan({
      ...previewInput,
      primogems: 11_200,
      enabled: { dailyCommissions: true, welkin: true },
      welkinDaysRemaining: 30,
    });
    // 15 days of 60 + 90 is the 2,250 the preview's income note states.
    expect(withIncome.income.primogems).toBe(2_250);
    expect(withIncome.pulls).toBe(14 + Math.floor((11_200 + 2_250) / 160));
  });

  it('never reports a chance outside [0, 1]', SLOW, () => {
    for (const constellation of [0, 1, 2, 3, 4, 5, 6]) {
      for (const pity of [0, 45, 89]) {
        for (const guaranteed of [false, true]) {
          const result = computePlan({ ...previewInput, constellation, pity, guaranteed });
          expect(result.chance).toBeGreaterThanOrEqual(0);
          expect(result.chance).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('is monotonic in every input that should help', () => {
    const base = computePlan(previewInput);
    expect(
      computePlan({ ...previewInput, primogems: previewInput.primogems + 1600 }).chance,
    ).toBeGreaterThanOrEqual(base.chance);
    expect(computePlan({ ...previewInput, fates: 24 }).chance).toBeGreaterThanOrEqual(base.chance);
    expect(computePlan({ ...previewInput, guaranteed: true }).chance).toBeGreaterThan(base.chance);
    expect(computePlan({ ...previewInput, pity: 80 }).chance).toBeGreaterThan(base.chance);
  });

  it('gives a curve long enough to index the player pull count', () => {
    const result = computePlan({ ...previewInput, primogems: 10_000_000 });
    // Clamped at the exhaustion bound, where the chance is already 1.
    expect(result.chance).toBeCloseTo(1, 9);
  });

  it('returns one curve per constellation up to the goal', () => {
    const result = computePlan({ ...previewInput, constellation: 4 });
    expect(result.curves).toHaveLength(5);
    expect(result.curve).toBe(result.curves[4]);
  });

  it('rejects a constellation the game does not have', () => {
    expect(() => computePlan({ ...previewInput, constellation: -1 })).toThrow();
    expect(() => computePlan({ ...previewInput, constellation: 7 })).toThrow();
  });

  it('meets the SPEC acceptance case: 90 pulls, pity 0, guaranteed, C0 is certain', () => {
    const result = computePlan({
      ...previewInput,
      primogems: 0,
      fates: 90,
      pity: 0,
      guaranteed: true,
      constellation: 0,
      enabled: {},
    });
    expect(result.pulls).toBe(90);
    expect(result.chance).toBeCloseTo(1, 9);
    expect((result.chance * 100).toFixed(1)).toBe('100.0');
  });
});

describe('copiesFor', () => {
  it('maps C0 to one copy', () => {
    expect(copiesFor(0)).toBe(1);
    expect(copiesFor(6)).toBe(7);
  });
});

describe('income override', () => {
  it('uses the typed figure instead of the projection', () => {
    const projected = computePlan({
      ...previewInput,
      primogems: 11_200,
      enabled: { dailyCommissions: true, welkin: true },
      welkinDaysRemaining: 30,
    });
    expect(projected.projectedPrimogems).toBe(2_250);
    expect(projected.incomeIsOverridden).toBe(false);

    const overridden = computePlan({
      ...previewInput,
      primogems: 11_200,
      enabled: { dailyCommissions: true, welkin: true },
      welkinDaysRemaining: 30,
      incomeOverride: 3_850,
    });
    expect(overridden.projectedPrimogems).toBe(3_850);
    expect(overridden.incomeIsOverridden).toBe(true);
    // The preview's headline case, reached through the override.
    expect(overridden.pulls).toBe(108);
    expect((overridden.chance * 100).toFixed(1)).toBe('72.9');
  });

  it('treats zero as a real override, not as absent', () => {
    const result = computePlan({
      ...previewInput,
      primogems: 11_200,
      enabled: { dailyCommissions: true },
      incomeOverride: 0,
    });
    expect(result.projectedPrimogems).toBe(0);
    expect(result.incomeIsOverridden).toBe(true);
  });

  it('rejects a negative override', () => {
    expect(() => computePlan({ ...previewInput, incomeOverride: -1 })).toThrow();
  });
});
