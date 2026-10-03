import { describe, expect, it } from 'vitest';

import { colorFor, ELEMENT_COLORS, elementId, intensityFor, PHYSICAL_COLOR } from './elements';

/**
 * The parts of the burst that decide what it looks like, checked without a GPU.
 *
 * Which colour an element gets and how hard a damage figure hits are both
 * things that would be wrong in a way nobody notices — an eruption still
 * happens, it is just the wrong one.
 */

const ELEMENTS = ['anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'];

describe('colorFor', () => {
  it('has a colour for every element in the game', () => {
    for (const element of ELEMENTS) {
      expect(ELEMENT_COLORS[element], element).toBeDefined();
    }
  });

  it('gives each element its own colour', () => {
    expect(new Set(Object.values(ELEMENT_COLORS)).size).toBe(ELEMENTS.length);
  });

  /** A physical hit has no element, and gold is what the app already means by it. */
  it('falls back to gold for a physical hit', () => {
    expect(colorFor(null)).toBe(PHYSICAL_COLOR);
  });

  /** Two 6.1 characters carry no element, and a new one could arrive any patch. */
  it('falls back rather than throwing on an element it has never heard of', () => {
    expect(colorFor('quantum')).toBe(PHYSICAL_COLOR);
  });

  it('matches the tokens the rest of the app uses', () => {
    // src/styles/tokens.css, verified 2026-10-01.
    expect(colorFor('pyro')).toBe(0xef7a35);
    expect(colorFor('cryo')).toBe(0x9fd6e3);
    expect(colorFor('geo')).toBe(0xfab632);
  });
});

describe('elementId', () => {
  /** The shader branches on this, so every element needs its own branch. */
  it('gives each element its own branch', () => {
    const ids = ELEMENTS.map((element) => elementId(element));
    expect(new Set(ids).size).toBe(ELEMENTS.length);
  });

  it('stays inside the range the shader handles', () => {
    for (const element of [...ELEMENTS, null, 'quantum']) {
      const id = elementId(element);
      expect(id, String(element)).toBeGreaterThanOrEqual(0);
      expect(id, String(element)).toBeLessThanOrEqual(6);
    }
  });
});

describe('intensityFor', () => {
  /**
   * Logarithmic, because damage spans two orders of magnitude across a roster.
   * A linear map would leave every early-game burst invisible and every
   * late-game one pinned at maximum.
   */
  it('separates figures a linear scale would not', () => {
    const small = intensityFor(2_000);
    const middle = intensityFor(20_000);
    const large = intensityFor(150_000);

    expect(small).toBeLessThan(middle);
    expect(middle).toBeLessThan(large);
    // And the gaps are comparable, which is the point of the log.
    expect(middle - small).toBeGreaterThan(0.1);
    expect(large - middle).toBeGreaterThan(0.1);
  });

  it('always erupts, however small the number', () => {
    for (const damage of [1, 10, 500]) {
      expect(intensityFor(damage), String(damage)).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('never exceeds full force, however large', () => {
    for (const damage of [200_000, 5_000_000, Number.MAX_SAFE_INTEGER]) {
      expect(intensityFor(damage), String(damage)).toBeLessThanOrEqual(1);
    }
  });

  /** Nothing to celebrate, so nothing happens. */
  it('is nothing at all for a figure that is not one', () => {
    expect(intensityFor(0)).toBe(0);
    expect(intensityFor(-5)).toBe(0);
    expect(intensityFor(Number.NaN)).toBe(0);
    expect(intensityFor(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('only ever grows with the damage', () => {
    let previous = 0;
    for (const damage of [100, 1_000, 5_000, 20_000, 80_000, 200_000, 1_000_000]) {
      const intensity = intensityFor(damage);
      expect(intensity, String(damage)).toBeGreaterThanOrEqual(previous);
      previous = intensity;
    }
  });
});
