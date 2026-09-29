import { describe, expect, it } from 'vitest';

import { mulberry32 } from '@/engine/rng';
import {
  MAIN_STAT_ODDS,
  ROLL_TIERS,
  SUBSTATS,
  SUBSTAT_KEYS,
  critValue,
  freshDrop,
  isSubstatKey,
  rollMainStat,
  rollSubstats,
  simulateToMax,
  upgradesRemaining,
  type Slot,
} from '@/engine/artifacts/model';

const SAMPLES = 200_000;
/** The tolerance ROADMAP names for the main-stat distribution. */
const TOLERANCE_PP = 0.3;

describe('main stat odds', () => {
  it('sums to 100% for every slot', () => {
    for (const [slot, odds] of Object.entries(MAIN_STAT_ODDS)) {
      const total = Object.values(odds).reduce((sum, p) => sum + p, 0);
      expect(total, slot).toBeCloseTo(1, 9);
    }
  });

  it('fixes the flower to flat HP and the plume to flat ATK', () => {
    expect(MAIN_STAT_ODDS.flower).toEqual({ hp: 1 });
    expect(MAIN_STAT_ODDS.plume).toEqual({ atk: 1 });
  });

  it('gives the goblet eight damage bonuses at 5% each', () => {
    const damage = Object.entries(MAIN_STAT_ODDS.goblet).filter(([key]) => key.endsWith('_dmg'));
    expect(damage).toHaveLength(8);
    for (const [key, p] of damage) expect(p, key).toBeCloseTo(0.05, 9);
  });

  /** ROADMAP: sampled odds match the published table within 0.3pp over 200k. */
  it.each(['sands', 'goblet', 'circlet'] as const)(
    'samples %s within 0.3 percentage points of the published table',
    (slot: Slot) => {
      const rng = mulberry32(2026);
      const counts = new Map<string, number>();
      for (let i = 0; i < SAMPLES; i++) {
        const key = rollMainStat(slot, rng);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const expectedOdds = MAIN_STAT_ODDS[slot];
      // Nothing outside the table may ever be rolled.
      for (const key of counts.keys()) {
        expect(Object.keys(expectedOdds), `${slot} rolled unexpected ${key}`).toContain(key);
      }

      for (const [key, expectedP] of Object.entries(expectedOdds)) {
        const observed = (counts.get(key) ?? 0) / SAMPLES;
        const deltaPp = Math.abs(observed - expectedP) * 100;
        expect(
          deltaPp,
          `${slot} ${key}: expected ${expectedP}, saw ${observed.toFixed(5)}`,
        ).toBeLessThan(TOLERANCE_PP);
      }
    },
  );

  it('always returns the fixed stat for flower and plume', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      expect(rollMainStat('flower', rng)).toBe('hp');
      expect(rollMainStat('plume', rng)).toBe('atk');
    }
  });
});

describe('substat table', () => {
  it('matches the weights and maxima in MATH.md', () => {
    expect(SUBSTATS.hp).toMatchObject({ weight: 6, max: 298.75 });
    expect(SUBSTATS.atk).toMatchObject({ weight: 6, max: 19.45 });
    expect(SUBSTATS.def).toMatchObject({ weight: 6, max: 23.15 });
    expect(SUBSTATS.hp_).toMatchObject({ weight: 4, max: 5.83 });
    expect(SUBSTATS.atk_).toMatchObject({ weight: 4, max: 5.83 });
    expect(SUBSTATS.def_).toMatchObject({ weight: 4, max: 7.29 });
    expect(SUBSTATS.er).toMatchObject({ weight: 4, max: 6.48 });
    expect(SUBSTATS.em).toMatchObject({ weight: 4, max: 23.31 });
    expect(SUBSTATS.cr).toMatchObject({ weight: 3, max: 3.89 });
    expect(SUBSTATS.cd).toMatchObject({ weight: 3, max: 7.77 });
  });

  it('has exactly ten substats', () => {
    expect(SUBSTAT_KEYS).toHaveLength(10);
  });

  it('rolls at 70, 80, 90 or 100 percent of the maximum', () => {
    expect(ROLL_TIERS).toEqual([0.7, 0.8, 0.9, 1]);
  });

  it('recognises its own keys', () => {
    expect(isSubstatKey('cr')).toBe(true);
    expect(isSubstatKey('pyro_dmg')).toBe(false);
  });
});

describe('rollSubstats', () => {
  it('never rolls the main stat as a substat', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 5_000; i++) {
      const subs = rollSubstats('atk_', 4, rng);
      expect(Object.keys(subs)).not.toContain('atk_');
    }
  });

  it('never repeats a line', () => {
    const rng = mulberry32(12);
    for (let i = 0; i < 5_000; i++) {
      const keys = Object.keys(rollSubstats('cr', 4, rng));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('rolls the number of lines asked for', () => {
    const rng = mulberry32(13);
    expect(Object.keys(rollSubstats('hp', 3, rng))).toHaveLength(3);
    expect(Object.keys(rollSubstats('hp', 4, rng))).toHaveLength(4);
  });

  it('picks lines in proportion to their weights', () => {
    // A goblet main stat excludes nothing from the substat pool, so the
    // observed share of first lines should track the published weights.
    const rng = mulberry32(2026);
    const counts = new Map<string, number>();
    const draws = 200_000;
    for (let i = 0; i < draws; i++) {
      const [first] = Object.keys(rollSubstats('pyro_dmg', 1, rng));
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }

    const totalWeight = SUBSTAT_KEYS.reduce((sum, key) => sum + SUBSTATS[key].weight, 0);
    for (const key of SUBSTAT_KEYS) {
      const expected = SUBSTATS[key].weight / totalWeight;
      const observed = (counts.get(key) ?? 0) / draws;
      expect(Math.abs(observed - expected) * 100, key).toBeLessThan(TOLERANCE_PP);
    }
  });

  it('rejects asking for more lines than the pool allows', () => {
    const rng = mulberry32(1);
    expect(() => rollSubstats('hp', 0, rng)).toThrow();
    expect(() => rollSubstats('hp', 11, rng)).toThrow();
  });
});

describe('upgradesRemaining', () => {
  it('counts the upgrades at +4, +8, +12, +16 and +20', () => {
    expect(upgradesRemaining(0)).toBe(5);
    expect(upgradesRemaining(4)).toBe(4);
    expect(upgradesRemaining(8)).toBe(3);
    expect(upgradesRemaining(12)).toBe(2);
    expect(upgradesRemaining(16)).toBe(1);
    expect(upgradesRemaining(20)).toBe(0);
  });

  it('rejects a level the game cannot produce', () => {
    expect(() => upgradesRemaining(-1)).toThrow();
    expect(() => upgradesRemaining(21)).toThrow();
  });
});

describe('simulateToMax', () => {
  const piece = { cr: 3.11, cd: 6.99, er: 5.18, def: 18.52 };

  it('leaves a maxed piece untouched', () => {
    const rng = mulberry32(5);
    expect(simulateToMax(piece, 20, 'atk_', rng)).toEqual(piece);
  });

  it('never mutates the input', () => {
    const rng = mulberry32(5);
    const before = { ...piece };
    simulateToMax(piece, 0, 'atk_', rng);
    expect(piece).toEqual(before);
  });

  it('gives a three-line piece its fourth line at the first upgrade', () => {
    const rng = mulberry32(6);
    for (let i = 0; i < 1_000; i++) {
      const result = simulateToMax({ cr: 3.11, cd: 6.99, er: 5.18 }, 0, 'atk_', rng);
      expect(Object.keys(result)).toHaveLength(4);
    }
  });

  it('adds exactly five rolls to a four-line piece from +0', () => {
    const rng = mulberry32(8);
    const before = Object.values(piece).reduce((a, b) => a + b, 0);
    let totalAdded = 0;
    // The four lines here span maxima from 3.89 to 23.15, so which line an
    // upgrade lands on dominates the variance: one run's standard deviation is
    // about 14. At 2,000 runs the standard error is ~0.32 and a 0.5 tolerance
    // fails on ordinary noise; 20,000 brings it to ~0.10.
    const runs = 20_000;
    for (let i = 0; i < runs; i++) {
      const after = simulateToMax(piece, 0, 'atk_', rng);
      totalAdded += Object.values(after).reduce((a, b) => a + b, 0) - before;
    }

    // Five rolls at the average tier (0.85) of the average max across the four
    // lines present. A missing or extra roll would be about 8.8 out, so this
    // stays a real check on the upgrade count.
    const meanTier = ROLL_TIERS.reduce((a, b) => a + b, 0) / ROLL_TIERS.length;
    const meanMax =
      (['cr', 'cd', 'er', 'def'] as const).reduce((sum, k) => sum + SUBSTATS[k].max, 0) / 4;
    expect(totalAdded / runs).toBeCloseTo(5 * meanTier * meanMax, 0);
  });

  it('adds one fewer roll from +4 than from +0', () => {
    const meanTier = ROLL_TIERS.reduce((a, b) => a + b, 0) / ROLL_TIERS.length;
    const meanMax =
      (['cr', 'cd', 'er', 'def'] as const).reduce((sum, k) => sum + SUBSTATS[k].max, 0) / 4;
    const before = Object.values(piece).reduce((a, b) => a + b, 0);

    const meanAdded = (level: number) => {
      const rng = mulberry32(8);
      let total = 0;
      const runs = 20_000;
      for (let i = 0; i < runs; i++) {
        total +=
          Object.values(simulateToMax(piece, level, 'atk_', rng)).reduce((a, b) => a + b, 0) -
          before;
      }
      return total / runs;
    };

    expect(meanAdded(0) - meanAdded(4)).toBeCloseTo(meanTier * meanMax, 0);
  });

  it('is deterministic for a given seed', () => {
    expect(simulateToMax(piece, 0, 'atk_', mulberry32(99))).toEqual(
      simulateToMax(piece, 0, 'atk_', mulberry32(99)),
    );
  });

  it('only ever increases a substat', () => {
    const rng = mulberry32(21);
    for (let i = 0; i < 2_000; i++) {
      const after = simulateToMax(piece, 0, 'atk_', rng);
      for (const [key, value] of Object.entries(piece)) {
        expect(after[key as keyof typeof after]).toBeGreaterThanOrEqual(value);
      }
    }
  });
});

describe('critValue', () => {
  it('is twice crit rate plus crit damage', () => {
    expect(critValue({ cr: 3.11, cd: 6.99 })).toBeCloseTo(13.21, 10);
  });

  it('treats absent crit stats as zero', () => {
    expect(critValue({ atk: 19 })).toBe(0);
    expect(critValue({})).toBe(0);
  });
});

describe('freshDrop', () => {
  it('rolls four lines about a fifth of the time from a domain', () => {
    const rng = mulberry32(2026);
    let four = 0;
    const runs = 200_000;
    for (let i = 0; i < runs; i++) {
      if (Object.keys(freshDrop('atk_', rng)).length === 4) four++;
    }
    expect(Math.abs(four / runs - 0.2) * 100).toBeLessThan(TOLERANCE_PP);
  });

  it('takes the four-line chance as an argument, since bosses differ', () => {
    const rng = mulberry32(3);
    let four = 0;
    const runs = 50_000;
    for (let i = 0; i < runs; i++) {
      if (Object.keys(freshDrop('atk_', rng, 0.34)).length === 4) four++;
    }
    expect(Math.abs(four / runs - 0.34) * 100).toBeLessThan(1);
  });

  it('never includes the main stat', () => {
    const rng = mulberry32(4);
    for (let i = 0; i < 5_000; i++) {
      expect(Object.keys(freshDrop('er', rng))).not.toContain('er');
    }
  });
});
