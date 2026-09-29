/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * DESIGN.md sets a 4.5:1 floor for text on `--ink` and `--well`. This is the
 * measuring tape for that rule: `/dev/tokens` annotates every colour with it,
 * and contrast.test.ts fails the build if a token drops below the floor.
 */

export type Rgb = { r: number; g: number; b: number };

/** Accepts `#rgb` and `#rrggbb`. Returns null for anything else (e.g. rgb() with alpha). */
export function parseHex(value: string): Rgb | null {
  const hex = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
    };
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!long) return null;
  return {
    r: parseInt(long[1], 16),
    g: parseInt(long[2], 16),
    b: parseInt(long[3], 16),
  };
}

function channel(value255: number): number {
  const c = value255 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Symmetric: order of the two colours does not matter. Ranges 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Convenience for two hex strings. Returns null if either is not plain hex. */
export function contrastHex(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  return contrastRatio(ca, cb);
}

/** WCAG AA: 4.5:1 for body text, 3:1 for large text (>=18.66px bold or >=24px). */
export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
/** WCAG AA for UI components and graphical objects (focus rings, chart strokes). */
export const AA_NON_TEXT = 3;
