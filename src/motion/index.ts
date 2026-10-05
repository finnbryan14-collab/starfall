/**
 * All motion goes through here (CLAUDE.md).
 *
 * Four anime.js 4.5 gotchas found while building design/preview.html, carried
 * forward so they are not rediscovered:
 *
 * 1. `scrambleText` must target `innerHTML`, and a trailing `%` is treated as a
 *    unit and doubled. Keep units in a sibling element and scramble the number.
 * 2. Timeline children do not apply their `from` values until they start.
 *    Anything that should appear later needs `opacity: 0` set before the
 *    timeline begins, or it flashes in at full opacity first.
 * 3. `svg.createMotionPath(path)` works on a `<g>` in the same SVG with no
 *    extra scaling maths, as long as the group's children sit at the origin.
 * 4. Recreate `svg.createDrawable(path)` whenever the path's `d` changes, so
 *    the dash length matches the new geometry.
 */

export { duration, parseCssDuration, DURATION_FALLBACK_MS, type DurationToken } from './durations';
export {
  prefersReducedMotion,
  onReducedMotionChange,
  REDUCED_MOTION_QUERY,
} from './reduced-motion';
export { useReducedMotion } from './useReducedMotion';
export { useAnimeScope } from './useAnimeScope';
export { tweenNumber, COUNTING_ATTRIBUTE, type TweenNumberOptions } from './tweenNumber';
export { useTweenedNumeral } from './useTweenedNumeral';
