import { describe, expect, it } from 'vitest';

import {
  FIVE_STARS_PER_RUN,
  RESIN_PER_DAY,
  RESIN_PER_RUN,
  resinEstimate,
  runsForQuantile,
} from '@/engine/artifacts/resin';
import { DEFAULT_GOAL } from '@/engine/artifacts/score';

describe('runsForQuantile', () => {
  it('needs one run when every run succeeds', () => {
    expect(runsForQuantile(1, 0.5)).toBe(1);
    expect(runsForQuantile(1, 0.9)).toBe(1);
  });

  it('never finishes when no run can succeed', () => {
    expect(runsForQuantile(0, 0.5)).toBe(Number.POSITIVE_INFINITY);
  });

  it('matches the geometric distribution', () => {
    // At a 10% per-run chance, 0.9^n <= 0.5 first holds at n = 7.
    expect(runsForQuantile(0.1, 0.5)).toBe(7);
    // And 0.9^n <= 0.1 first holds at n = 22.
    expect(runsForQuantile(0.1, 0.9)).toBe(22);
  });

  it('asks for more runs at higher confidence', () => {
    const p = 0.03;
    expect(runsForQuantile(p, 0.9)).toBeGreaterThan(runsForQuantile(p, 0.5));
  });

  it('rejects a quantile it cannot reach', () => {
    expect(() => runsForQuantile(0.1, 0)).toThrow();
    expect(() => runsForQuantile(0.1, 1)).toThrow();
  });
});

describe('resinEstimate', () => {
  const sands = { slot: 'sands' as const, mainStat: 'atk_' as const, goal: DEFAULT_GOAL };

  /** ROADMAP: the sands example lands near 15,000 resin at the median. */
  it('puts an on-set ATK% sands at 30+ crit value near 15,000 resin', () => {
    const estimate = resinEstimate(sands);
    expect(estimate.median.resin).toBeGreaterThan(13_000);
    expect(estimate.median.resin).toBeLessThan(17_000);
  });

  it('puts the same piece near 50,000 resin at nine times in ten', () => {
    const estimate = resinEstimate(sands);
    expect(estimate.p90.resin).toBeGreaterThan(45_000);
    expect(estimate.p90.resin).toBeLessThan(56_000);
  });

  it('converts resin to days at 180 a day', () => {
    const estimate = resinEstimate(sands);
    expect(estimate.median.days).toBeCloseTo(estimate.median.resin / RESIN_PER_DAY, 9);
    expect(RESIN_PER_DAY).toBe((24 * 60) / 8);
  });

  it('prices every run at 20 resin', () => {
    const estimate = resinEstimate(sands);
    expect(estimate.median.resin).toBe(estimate.median.runs * RESIN_PER_RUN);
    expect(RESIN_PER_RUN).toBe(20);
  });

  it('chains set, slot, main stat and substats into the piece chance', () => {
    const estimate = resinEstimate(sands);
    // 0.5 set x 0.2 slot x 0.2666 main stat x substats.
    expect(estimate.pieceChance).toBeCloseTo(0.5 * 0.2 * 0.2666 * estimate.substatChance, 12);
  });

  it('treats drops per run as a rate, not a certainty', () => {
    const estimate = resinEstimate(sands);
    expect(estimate.perRunChance).toBeCloseTo(
      1 - Math.exp(-FIVE_STARS_PER_RUN * estimate.pieceChance),
      12,
    );
    // Slightly below the naive rate x chance, which is the point.
    expect(estimate.perRunChance).toBeLessThan(FIVE_STARS_PER_RUN * estimate.pieceChance);
  });

  it('costs more for a harder goal', () => {
    const easy = resinEstimate({ ...sands, goal: { kind: 'critValue', threshold: 15 } });
    const hard = resinEstimate({ ...sands, goal: { kind: 'critValue', threshold: 40 } });
    expect(hard.median.resin).toBeGreaterThan(easy.median.resin);
  });

  it('costs more for a rarer main stat', () => {
    // Energy Recharge sands is 10%, against 26.66% for ATK%.
    const common = resinEstimate(sands);
    const rare = resinEstimate({ ...sands, mainStat: 'er' });
    expect(rare.median.resin).toBeGreaterThan(common.median.resin);
  });

  it('is deterministic for a given seed', () => {
    expect(resinEstimate(sands)).toEqual(resinEstimate(sands));
  });

  it('never finishes when the slot cannot roll that main stat at all', () => {
    // A flower is always flat HP, so an ATK% flower does not exist.
    const impossible = resinEstimate({ slot: 'flower', mainStat: 'atk_', goal: DEFAULT_GOAL });
    expect(impossible.pieceChance).toBe(0);
    expect(impossible.median.runs).toBe(Number.POSITIVE_INFINITY);
  });

  it('is cheaper from a source with better four-line odds', () => {
    const domain = resinEstimate(sands);
    const boss = resinEstimate({ ...sands, fourLineChance: 0.34 });
    expect(boss.substatChance).toBeGreaterThan(domain.substatChance);
  });
});
