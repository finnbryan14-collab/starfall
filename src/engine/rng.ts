/**
 * Seeded pseudo-random number generator.
 *
 * `src/engine/` is deterministic: nothing in here calls Math.random. Anything
 * that needs randomness takes an `Rng` as an argument, so every result is
 * reproducible and a test can pin an exact sequence (CLAUDE.md).
 *
 * mulberry32 is a small, fast 32-bit generator. It is not cryptographic and is
 * not meant to be — it drives Monte Carlo sampling and the starfield layout.
 *
 * Ported from design/preview.html; rng.test.ts pins it to that implementation.
 */

/** Returns a float in [0, 1). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, max). */
export function randomInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}

/** Uniform pick from a non-empty array. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randomInt(rng, items.length)];
}
