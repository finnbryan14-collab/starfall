import { describe, expect, it } from 'vitest';

import { SUBSTATS, critValue } from '@/engine/artifacts/model';
import {
  DEFAULT_GOAL,
  VERDICT_THRESHOLDS,
  histogram,
  keepOrTrash,
  scoreOf,
  verdictFor,
  weightedRollValue,
  type Goal,
} from '@/engine/artifacts/score';
import { WEIGHT_PRESETS, presetById } from '@/engine/artifacts/weights';

/** The worked example in MATH.md section 4. */
const EXAMPLE = {
  subs: { cr: 3.11, cd: 6.99, er: 5.18, def: 18.52 },
  level: 0,
  mainStat: 'atk_' as const,
};

describe('keepOrTrash', () => {
  /** ROADMAP: the MATH.md example returns about 50%. */
  it('gives the MATH.md example about even odds of 30+ crit value', () => {
    const result = keepOrTrash(EXAMPLE);
    expect(result.probability).toBeGreaterThan(0.45);
    expect(result.probability).toBeLessThan(0.55);
    expect(result.verdict).toBe('keep');
  });

  it('is deterministic, so a verdict never jitters between runs', () => {
    const a = keepOrTrash(EXAMPLE);
    const b = keepOrTrash(EXAMPLE);
    expect(a.probability).toBe(b.probability);
    expect(Array.from(a.scores.slice(0, 50))).toEqual(Array.from(b.scores.slice(0, 50)));
  });

  it('gives a different answer for a different seed, but a close one', () => {
    const a = keepOrTrash({ ...EXAMPLE, seed: 1 });
    const b = keepOrTrash({ ...EXAMPLE, seed: 2 });
    expect(a.probability).not.toBe(b.probability);
    // 20,000 trials puts the standard error near 0.35pp; 2pp is ample room.
    expect(Math.abs(a.probability - b.probability)).toBeLessThan(0.02);
  });

  it('is certain when the piece already clears the goal', () => {
    const result = keepOrTrash({
      subs: { cr: 20, cd: 40 },
      level: 20,
      mainStat: 'atk_',
      goal: { kind: 'critValue', threshold: 30 },
    });
    expect(result.probability).toBe(1);
    expect(result.verdict).toBe('keep');
  });

  it('is hopeless when a maxed piece falls short', () => {
    const result = keepOrTrash({
      subs: { atk: 19, def: 23 },
      level: 20,
      mainStat: 'atk_',
      goal: { kind: 'critValue', threshold: 30 },
    });
    expect(result.probability).toBe(0);
    expect(result.verdict).toBe('feed');
  });

  it('gets harder as the threshold rises', () => {
    let previous = 1;
    for (const threshold of [10, 20, 30, 40, 50]) {
      const { probability } = keepOrTrash({
        ...EXAMPLE,
        goal: { kind: 'critValue', threshold },
      });
      expect(probability, `threshold ${threshold}`).toBeLessThanOrEqual(previous);
      previous = probability;
    }
  });

  it('gets harder as the piece is already levelled with nothing to show', () => {
    // Fewer upgrades left means fewer chances to reach the goal.
    const fresh = keepOrTrash({ ...EXAMPLE, level: 0 }).probability;
    const partway = keepOrTrash({ ...EXAMPLE, level: 12 }).probability;
    expect(partway).toBeLessThan(fresh);
  });

  it('reports quantiles in order', () => {
    const { p10, median, p90 } = keepOrTrash(EXAMPLE);
    expect(p10).toBeLessThanOrEqual(median);
    expect(median).toBeLessThanOrEqual(p90);
  });

  it('returns one score per trial', () => {
    const result = keepOrTrash({ ...EXAMPLE, trials: 500 });
    expect(result.scores).toHaveLength(500);
    expect(result.trials).toBe(500);
  });

  it('agrees with its own scores about the probability', () => {
    const result = keepOrTrash(EXAMPLE);
    const met = Array.from(result.scores).filter((s) => s >= result.goal.threshold).length;
    expect(met / result.trials).toBeCloseTo(result.probability, 12);
  });

  it('rejects a trial count it cannot run', () => {
    expect(() => keepOrTrash({ ...EXAMPLE, trials: 0 })).toThrow();
    expect(() => keepOrTrash({ ...EXAMPLE, trials: 1.5 })).toThrow();
  });
});

describe('verdicts', () => {
  it('follows the thresholds in MATH.md', () => {
    expect(verdictFor(0.35)).toBe('keep');
    expect(verdictFor(0.34)).toBe('maybe');
    expect(verdictFor(0.15)).toBe('maybe');
    expect(verdictFor(0.14)).toBe('feed');
    expect(verdictFor(0)).toBe('feed');
    expect(verdictFor(1)).toBe('keep');
  });

  it('keeps its boundaries in one config object', () => {
    expect(VERDICT_THRESHOLDS.keep).toBe(0.35);
    expect(VERDICT_THRESHOLDS.maybe).toBe(0.15);
    expect(VERDICT_THRESHOLDS.keep).toBeGreaterThan(VERDICT_THRESHOLDS.maybe);
  });
});

describe('weightedRollValue', () => {
  it('counts one maximum roll as one', () => {
    expect(weightedRollValue({ cd: SUBSTATS.cd.max }, { cd: 1 })).toBeCloseTo(1, 12);
    expect(weightedRollValue({ cd: SUBSTATS.cd.max * 3 }, { cd: 1 })).toBeCloseTo(3, 12);
  });

  it('scales by the weight', () => {
    expect(weightedRollValue({ er: SUBSTATS.er.max }, { er: 0.5 })).toBeCloseTo(0.5, 12);
  });

  it('ignores stats the role does not care about', () => {
    expect(weightedRollValue({ def: 100, cd: SUBSTATS.cd.max }, { cd: 1 })).toBeCloseTo(1, 12);
  });

  it('is zero for a piece with nothing the role wants', () => {
    expect(weightedRollValue({ def: 100, hp: 400 }, { cr: 1, cd: 1 })).toBe(0);
  });
});

describe('scoreOf', () => {
  it('uses crit value for a crit goal', () => {
    const subs = { cr: 3.11, cd: 6.99 };
    expect(scoreOf(subs, DEFAULT_GOAL)).toBe(critValue(subs));
  });

  it('uses weighted roll value for a weighted goal', () => {
    const goal: Goal = { kind: 'weighted', weights: { er: 1 }, threshold: 2 };
    expect(scoreOf({ er: SUBSTATS.er.max * 2 }, goal)).toBeCloseTo(2, 12);
  });
});

describe('weight presets', () => {
  it('offers the roles MATH.md names', () => {
    const ids = WEIGHT_PRESETS.map((p) => p.id);
    expect(ids).toContain('crit-atk');
    expect(ids).toContain('crit-hp');
    expect(ids).toContain('crit-def');
    expect(ids).toContain('crit-em');
    expect(ids).toContain('er-support');
    expect(ids).toContain('em-reaction');
  });

  it('gives every preset a label, a note and weights in range', () => {
    for (const preset of WEIGHT_PRESETS) {
      expect(preset.label, preset.id).toBeTruthy();
      expect(preset.note, preset.id).toBeTruthy();
      expect(Object.keys(preset.weights).length, preset.id).toBeGreaterThan(0);
      for (const [key, weight] of Object.entries(preset.weights)) {
        expect(weight, `${preset.id} ${key}`).toBeGreaterThan(0);
        expect(weight, `${preset.id} ${key}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives the reaction preset no crit weight at all', () => {
    const preset = presetById('em-reaction')!;
    expect(preset.weights.cr).toBeUndefined();
    expect(preset.weights.cd).toBeUndefined();
  });

  it('ranks pieces differently depending on the role', () => {
    const critPiece = { cr: 7, cd: 14 };
    const erPiece = { er: 19 };

    const crit = presetById('crit-atk')!.weights;
    const support = presetById('er-support')!.weights;

    expect(weightedRollValue(critPiece, crit)).toBeGreaterThan(weightedRollValue(erPiece, crit));
    expect(weightedRollValue(erPiece, support)).toBeGreaterThan(weightedRollValue(erPiece, crit));
  });

  it('returns undefined for an unknown preset', () => {
    expect(presetById('nope')).toBeUndefined();
  });
});

describe('histogram', () => {
  it('bins every score exactly once', () => {
    const { scores } = keepOrTrash(EXAMPLE);
    const h = histogram(scores, DEFAULT_GOAL);
    const total = h.bins.reduce((sum, bin) => sum + bin.count, 0);
    expect(total).toBe(scores.length);
  });

  it('marks the bins that clear the goal', () => {
    const h = histogram(new Float64Array([12, 33, 41]), { kind: 'critValue', threshold: 30 });
    for (const bin of h.bins) {
      expect(bin.meetsGoal, `${bin.from}-${bin.to}`).toBe(bin.from >= 30);
    }
  });

  it('clamps scores outside the range into the end bins', () => {
    const h = histogram(new Float64Array([-100, 9999]), DEFAULT_GOAL);
    expect(h.bins[0].count).toBe(1);
    expect(h.bins[h.bins.length - 1].count).toBe(1);
  });

  it('reports the tallest bin, for scaling the chart', () => {
    const h = histogram(new Float64Array([31, 32, 33, 12]), DEFAULT_GOAL);
    expect(h.max).toBe(Math.max(...h.bins.map((b) => b.count)));
  });
});
