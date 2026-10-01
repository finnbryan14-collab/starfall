import { describe, expect, it } from 'vitest';

import { starCountFor, starLayout } from './sky';

/**
 * The parts of the sky that can be checked without a GPU.
 *
 * Which is the point of keeping the arrangement separate from the renderer:
 * whether a star is inside the frame, whether the seed reproduces, and whether
 * the size distribution still leans small are all answerable here, and none of
 * them need WebGL.
 *
 * docs/DESIGN.md: the canvas has to be the same sky as the SVG behind it, not a
 * different arrangement of stars fading in over the first.
 */

describe('starLayout', () => {
  it('puts every star inside the frame', () => {
    const { positions } = starLayout(200, 2026);

    for (let index = 0; index < 200; index++) {
      expect(Math.abs(positions[index * 3]), `star ${index} x`).toBeLessThanOrEqual(1);
      expect(Math.abs(positions[index * 3 + 1]), `star ${index} y`).toBeLessThanOrEqual(1);
      // Depth is behind the focal plane, never in front of the camera.
      expect(positions[index * 3 + 2], `star ${index} z`).toBeLessThanOrEqual(0);
      expect(positions[index * 3 + 2], `star ${index} z`).toBeGreaterThanOrEqual(-2);
    }
  });

  /** Scenery, not noise: the sky is the same every reload, like the SVG's. */
  it('reproduces exactly from the same seed', () => {
    expect(starLayout(50, 2026).positions).toEqual(starLayout(50, 2026).positions);
    expect(starLayout(50, 2026).sizes).toEqual(starLayout(50, 2026).sizes);
  });

  it('is a different sky under a different seed', () => {
    expect(starLayout(50, 2026).positions).not.toEqual(starLayout(50, 7).positions);
  });

  /**
   * The SVG squares its random term so most stars are small and a few stand
   * out. Lose that and the sky turns into evenly-spaced dots, which reads as a
   * texture rather than as a sky.
   */
  it('keeps most stars small and a few bright', () => {
    const { sizes } = starLayout(400, 2026);
    const sorted = [...sizes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const brightest = sorted[sorted.length - 1];

    expect(median).toBeLessThan(1.2);
    expect(brightest).toBeGreaterThan(2);
    // Every star is within the range the SVG uses.
    expect(sorted[0]).toBeGreaterThanOrEqual(0.6);
    expect(brightest).toBeLessThanOrEqual(2.8);
  });

  it('matches the SVG starfield on opacity, so the canvas can fade in over it', () => {
    const { opacities } = starLayout(400, 2026);

    for (const opacity of opacities) {
      expect(opacity).toBeGreaterThanOrEqual(0.1);
      expect(opacity).toBeLessThanOrEqual(0.45);
    }
  });

  it('fills every array it says it fills', () => {
    const layout = starLayout(37, 1);

    expect(layout.positions).toHaveLength(37 * 3);
    expect(layout.sizes).toHaveLength(37);
    expect(layout.opacities).toHaveLength(37);
    expect([...layout.positions].every(Number.isFinite)).toBe(true);
  });
});

describe('starCountFor', () => {
  /** A phone should not be asked to render a laptop's sky. */
  it('thins the sky on a small screen', () => {
    expect(starCountFor(390)).toBeLessThan(starCountFor(768));
    expect(starCountFor(768)).toBeLessThan(starCountFor(1280));
  });

  it('never asks for nothing, and never more than the full sky', () => {
    for (const width of [1, 320, 390, 768, 1280, 3840]) {
      expect(starCountFor(width), String(width)).toBeGreaterThan(0);
      expect(starCountFor(width), String(width)).toBeLessThanOrEqual(90);
    }
  });
});
