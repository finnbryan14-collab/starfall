import { animate } from 'animejs';

import { duration as tokenDuration, type DurationToken } from './durations';
import { prefersReducedMotion } from './reduced-motion';

/**
 * Counts an element's text from one number to another.
 *
 * anime.js cannot tween text content directly, so this animates a plain object
 * and writes the formatted value on each frame — the approach the preview uses
 * for the hero numeral.
 *
 * Under reduced motion it writes the final value once and returns.
 */
export type TweenNumberOptions = {
  /** Which motion token sets the length. Default: 'signature'. */
  token?: DurationToken;
  /** Explicit milliseconds, overriding the token. */
  durationMs?: number;
  ease?: string;
  onComplete?: () => void;
};

/**
 * While a numeral is counting, it carries `data-counting="true"`.
 *
 * A counting numeral is showing a value it does not mean yet, and anything
 * reading it has to know the difference. Two reads agreeing is the obvious
 * test and it is not a sound one: the tween runs on requestAnimationFrame, so
 * on a loaded machine the frames spread out and two samples taken a second
 * apart legitimately disagree for as long as you care to keep sampling. The
 * attribute says it outright instead of inferring it from timing.
 */
export const COUNTING_ATTRIBUTE = 'data-counting';

/**
 * The newest tween per element.
 *
 * Two tweens can overlap on one numeral — a second input change before the
 * first finished — and they animate separate counter objects, so the older
 * one's completion must not clear a flag the newer one still owns.
 */
const runs = new WeakMap<HTMLElement, number>();

export function tweenNumber(
  element: HTMLElement,
  from: number,
  to: number,
  format: (value: number) => string,
  options: TweenNumberOptions = {},
): void {
  const { token = 'signature', durationMs, ease = 'inOut(2)', onComplete } = options;

  const ms = durationMs ?? tokenDuration(token, element);

  const run = (runs.get(element) ?? 0) + 1;
  runs.set(element, run);

  const land = () => {
    // Land exactly on the target rather than wherever the last frame fell.
    element.textContent = format(to);
    if (runs.get(element) === run) element.removeAttribute(COUNTING_ATTRIBUTE);
    onComplete?.();
  };

  // Two independent reasons to skip: the user asked for less motion, or the
  // token itself is zero (which is how tokens.css expresses the same thing).
  if (prefersReducedMotion() || ms <= 0) {
    land();
    return;
  }

  element.setAttribute(COUNTING_ATTRIBUTE, 'true');

  const counter = { value: from };
  animate(counter, {
    value: to,
    duration: ms,
    ease,
    onUpdate: () => {
      element.textContent = format(counter.value);
    },
    onComplete: land,
  });
}
