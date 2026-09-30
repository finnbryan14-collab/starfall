import { describe, expect, it } from 'vitest';

import {
  AMPLIFYING_COEFFICIENTS,
  amplifyingEmBonus,
  amplifyingMultiplier,
  critMultiplier,
  defMultiplier,
  outgoingDamage,
  resistanceMultiplier,
} from './formula';

/**
 * docs/MATH.md section 6. Every constant here comes from the wiki's own
 * statement of the formula, and the end-to-end case is their worked example
 * reproduced exactly.
 *
 *   https://genshin-impact.fandom.com/wiki/Damage
 */

describe('defMultiplier', () => {
  it('matches the worked example', () => {
    // Level 70 character, level 75 enemy, 23% DEF reduction from Klee C2.
    expect(defMultiplier({ characterLevel: 70, enemyLevel: 75, defReduction: 0.23 })).toBeCloseTo(
      0.55783,
      5,
    );
  });

  /** It depends on *character* level, which is easy to get backwards. */
  it('rewards levelling the character, not just the gear', () => {
    const at70 = defMultiplier({ characterLevel: 70, enemyLevel: 90 });
    const at90 = defMultiplier({ characterLevel: 90, enemyLevel: 90 });

    expect(at90).toBeGreaterThan(at70);
    // Equal levels put it at exactly half, which is the sanity check.
    expect(at90).toBeCloseTo(0.5, 10);
  });

  it('treats reduction and ignore as separate multiplicative terms', () => {
    const both = defMultiplier({
      characterLevel: 90,
      enemyLevel: 90,
      defReduction: 0.5,
      defIgnored: 0.5,
    });
    // k = 0.5 * 0.5 = 0.25, so 190 / (0.25*190 + 190).
    expect(both).toBeCloseTo(190 / (0.25 * 190 + 190), 10);
  });

  it('never divides by zero when defence is stripped entirely', () => {
    const stripped = defMultiplier({ characterLevel: 90, enemyLevel: 90, defReduction: 1 });
    expect(stripped).toBe(1);
  });
});

describe('resistanceMultiplier', () => {
  /**
   * The negative branch halves the shred, which is exactly why stacking RES
   * reduction past zero keeps paying but at half rate.
   */
  it('halves resistance below zero', () => {
    expect(resistanceMultiplier(-0.3)).toBeCloseTo(1.15, 10);
    expect(resistanceMultiplier(-1)).toBeCloseTo(1.5, 10);
  });

  it('subtracts resistance in the ordinary range', () => {
    expect(resistanceMultiplier(0)).toBe(1);
    expect(resistanceMultiplier(0.1)).toBeCloseTo(0.9, 10);
    expect(resistanceMultiplier(0.5)).toBeCloseTo(0.5, 10);
  });

  it('flattens out above 75%', () => {
    expect(resistanceMultiplier(0.75)).toBeCloseTo(1 / 4, 10);
    expect(resistanceMultiplier(0.9)).toBeCloseTo(1 / 4.6, 10);
  });

  it('is continuous across both boundaries', () => {
    const epsilon = 1e-9;
    expect(resistanceMultiplier(-epsilon)).toBeCloseTo(resistanceMultiplier(0), 6);
    expect(resistanceMultiplier(0.75 - epsilon)).toBeCloseTo(resistanceMultiplier(0.75), 6);
  });
});

describe('critMultiplier', () => {
  it('is the crit bonus on a crit and nothing otherwise', () => {
    expect(critMultiplier({ critRate: 0.5, critDamage: 1.5, mode: 'crit' })).toBeCloseTo(2.5, 10);
    expect(critMultiplier({ critRate: 0.5, critDamage: 1.5, mode: 'nonCrit' })).toBe(1);
  });

  it('averages by crit rate, which is what an optimiser should maximise', () => {
    expect(critMultiplier({ critRate: 0.5, critDamage: 1.5, mode: 'average' })).toBeCloseTo(
      1.75,
      10,
    );
  });

  /**
   * Overcapped crit rate is genuinely wasted, and a number that kept rewarding
   * it would send the optimiser hunting for rate it cannot use.
   */
  it('caps crit rate at 100% in the average', () => {
    expect(critMultiplier({ critRate: 1.4, critDamage: 1, mode: 'average' })).toBeCloseTo(2, 10);
    expect(critMultiplier({ critRate: 1, critDamage: 1, mode: 'average' })).toBeCloseTo(2, 10);
  });

  it('treats negative crit rate as zero', () => {
    expect(critMultiplier({ critRate: -0.2, critDamage: 1, mode: 'average' })).toBe(1);
  });
});

describe('amplifying reactions', () => {
  it('matches the worked example’s EM bonus', () => {
    expect(amplifyingEmBonus(150)).toBeCloseTo(0.26903, 5);
  });

  it('has the coefficient depend on which element triggers', () => {
    // Melt: Pyro onto Cryo is the strong direction.
    expect(AMPLIFYING_COEFFICIENTS.meltPyro).toBe(2);
    expect(AMPLIFYING_COEFFICIENTS.meltCryo).toBe(1.5);
    // Vaporize: Hydro onto Pyro is the strong direction.
    expect(AMPLIFYING_COEFFICIENTS.vaporizeHydro).toBe(2);
    expect(AMPLIFYING_COEFFICIENTS.vaporizePyro).toBe(1.5);
  });

  it('multiplies the coefficient by the EM and reaction bonuses', () => {
    expect(amplifyingMultiplier({ coefficient: 2, elementalMastery: 150 })).toBeCloseTo(2.53806, 5);
    // Crimson Witch 4pc adds a flat reaction bonus on top.
    expect(
      amplifyingMultiplier({ coefficient: 2, elementalMastery: 150, reactionBonus: 0.15 }),
    ).toBeCloseTo(2 * (1 + 0.26903 + 0.15), 4);
  });

  it('is the bare coefficient with no mastery at all', () => {
    expect(amplifyingMultiplier({ coefficient: 1.5, elementalMastery: 0 })).toBe(1.5);
  });

  it('has diminishing returns, which is why EM stacking stops paying', () => {
    const first = amplifyingEmBonus(200) - amplifyingEmBonus(100);
    const later = amplifyingEmBonus(1000) - amplifyingEmBonus(900);
    expect(later).toBeLessThan(first);
  });
});

describe('outgoingDamage', () => {
  /**
   * The wiki's worked example, end to end. If this number moves, something in
   * the chain is wrong — this is the test the whole optimiser rests on.
   *
   * The wiki prints 52,246.50, which is what you get by multiplying the
   * *rounded* intermediates it displays (0.55783, 1.15, 2.53806). Carrying full
   * precision through the same formula gives 52,246.9986. Every intermediate
   * below agrees with theirs to every digit they printed, so the half-point is
   * their display rounding rather than a difference in the maths — worth
   * knowing before anyone compares Starfall against a hand calculation.
   */
  it('reproduces the worked example, carrying full precision', () => {
    const result = outgoingDamage({
      baseDamage: 1500 * 6.19,
      damageBonus: 0.4 + 0.52,
      critRate: 1,
      critDamage: 0.8,
      critMode: 'crit',
      characterLevel: 70,
      enemyLevel: 75,
      defReduction: 0.23,
      resistance: 0.1 - 0.4,
      elementalMastery: 150,
      reaction: { kind: 'amplifying', coefficient: AMPLIFYING_COEFFICIENTS.vaporizeHydro },
    });

    expect(result.damage).toBeCloseTo(52_246.9986, 3);

    // And the wiki's printed figure is reachable from the same parts, once
    // they are rounded the way the wiki rounds them for display.
    const { base, damageBonus } = result.parts;
    const rounded = base * damageBonus * 0.55783 * 1.15 * 2.53806 * 1.8;
    expect(rounded).toBeCloseTo(52_246.5, 1);
  });

  it('shows its working, so a screen never has to recompute a part', () => {
    const result = outgoingDamage({
      baseDamage: 1500 * 6.19,
      damageBonus: 0.92,
      critRate: 1,
      critDamage: 0.8,
      critMode: 'crit',
      characterLevel: 70,
      enemyLevel: 75,
      defReduction: 0.23,
      resistance: -0.3,
      elementalMastery: 150,
      reaction: { kind: 'amplifying', coefficient: 2 },
    });

    expect(result.parts.def).toBeCloseTo(0.55783, 5);
    expect(result.parts.res).toBeCloseTo(1.15, 10);
    expect(result.parts.crit).toBeCloseTo(1.8, 10);
    expect(result.parts.amplifying).toBeCloseTo(2.53806, 5);

    // And the parts really do multiply out to the whole.
    const { base, damageBonus, def, res, crit, amplifying } = result.parts;
    expect(base * damageBonus * def * res * crit * amplifying).toBeCloseTo(result.damage, 6);
  });

  it('needs no reaction to produce a number', () => {
    const plain = outgoingDamage({
      baseDamage: 1000,
      critRate: 0,
      critDamage: 0.5,
      characterLevel: 90,
      enemyLevel: 90,
      resistance: 0.1,
    });

    // 1000 x 1 x 0.5 x 0.9 x 1
    expect(plain.damage).toBeCloseTo(450, 10);
    expect(plain.parts.amplifying).toBe(1);
  });

  it('adds the additive base bonus before anything multiplies', () => {
    const withBonus = outgoingDamage({
      baseDamage: 1000,
      additiveBaseBonus: 500,
      damageBonus: 1,
      critRate: 0,
      critDamage: 0,
      characterLevel: 90,
      enemyLevel: 90,
      resistance: 0,
    });

    // (1000 + 500) x 2 x 0.5 x 1 x 1
    expect(withBonus.damage).toBeCloseTo(1500, 10);
  });

  it('refuses a negative base rather than returning a negative number', () => {
    expect(() =>
      outgoingDamage({
        baseDamage: -1,
        critRate: 0,
        critDamage: 0,
        characterLevel: 90,
        enemyLevel: 90,
        resistance: 0,
      }),
    ).toThrow(RangeError);
  });

  it('is monotonic in every stat an optimiser can push', () => {
    const base = {
      baseDamage: 1000,
      critRate: 0.5,
      critDamage: 1,
      characterLevel: 90,
      enemyLevel: 90,
      resistance: 0.1,
      critMode: 'average' as const,
    };
    const plain = outgoingDamage(base).damage;

    // Every one of these must strictly increase the answer, or the search
    // would have reason to avoid a stat that actually helps.
    expect(outgoingDamage({ ...base, baseDamage: 1100 }).damage).toBeGreaterThan(plain);
    expect(outgoingDamage({ ...base, damageBonus: 0.1 }).damage).toBeGreaterThan(plain);
    expect(outgoingDamage({ ...base, critRate: 0.6 }).damage).toBeGreaterThan(plain);
    expect(outgoingDamage({ ...base, critDamage: 1.1 }).damage).toBeGreaterThan(plain);
    expect(outgoingDamage({ ...base, resistance: 0 }).damage).toBeGreaterThan(plain);
    expect(outgoingDamage({ ...base, defReduction: 0.2 }).damage).toBeGreaterThan(plain);
  });
});
