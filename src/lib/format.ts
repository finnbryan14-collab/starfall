/**
 * Number formatting shared by every screen.
 *
 * The UI font carries tabular figures (DESIGN.md), so columns of numbers line
 * up as long as we format them consistently. Ported from the `fmt` helper in
 * design/preview.html.
 */

/** 11200 -> "11,200". Rounds first, so callers can pass fractional values. */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 0.7288 -> "72.9". The hero numeral renders the unit in a separate element. */
export function formatPercent(fraction: number, digits = 1): string {
  return (fraction * 100).toFixed(digits);
}

/**
 * Reads a number back out of a formatted input ("11,200" -> 11200).
 * Steppers show separators, so input has to be parsed rather than coerced.
 */
export function parseNumber(value: string): number {
  return Number(String(value).replace(/[^0-9]/g, '')) || 0;
}
