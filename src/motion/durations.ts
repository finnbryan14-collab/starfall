/**
 * Durations, read from the design tokens at runtime.
 *
 * DESIGN.md used to claim the CSS tokens "already zero the durations" for
 * reduced motion. They zero the CSS ones only — anime.js never reads CSS custom
 * properties, so a hardcoded JS duration would sail straight past the media
 * query in tokens.css.
 *
 * Reading the computed value fixes both halves of that problem at once: there
 * is one definition of every duration, and when `prefers-reduced-motion` zeroes
 * it in CSS, JS sees 0 too.
 */

export type DurationToken = 'quick' | 'move' | 'signature';

const CSS_VARIABLE: Record<DurationToken, string> = {
  quick: '--d-quick',
  move: '--d-move',
  signature: '--d-signature',
};

/** Fallbacks for SSR and for tests, matching tokens.css. */
const FALLBACK_MS: Record<DurationToken, number> = {
  quick: 160,
  move: 420,
  signature: 1100,
};

/** `"160ms"` -> 160, `"0.42s"` -> 420. Returns null for anything unparseable. */
export function parseCssDuration(value: string): number | null {
  const text = value.trim();
  if (text === '') return null;

  const match = /^(-?[\d.]+)(ms|s)?$/.exec(text);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  return match[2] === 's' ? amount * 1000 : amount;
}

/**
 * Milliseconds for a motion token. Falls back to the tokens.css value when
 * there is no document to read from (server render, unit test).
 */
export function duration(token: DurationToken, element?: Element): number {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return FALLBACK_MS[token];
  }

  const target = element ?? document.documentElement;
  const raw = getComputedStyle(target).getPropertyValue(CSS_VARIABLE[token]);
  const parsed = parseCssDuration(raw);
  return parsed ?? FALLBACK_MS[token];
}

export { FALLBACK_MS as DURATION_FALLBACK_MS };
