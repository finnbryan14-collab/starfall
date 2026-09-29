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

export function tweenNumber(
  element: HTMLElement,
  from: number,
  to: number,
  format: (value: number) => string,
  options: TweenNumberOptions = {},
): void {
  const { token = 'signature', durationMs, ease = 'inOut(2)', onComplete } = options;

  const ms = durationMs ?? tokenDuration(token, element);

  // Two independent reasons to skip: the user asked for less motion, or the
  // token itself is zero (which is how tokens.css expresses the same thing).
  if (prefersReducedMotion() || ms <= 0) {
    element.textContent = format(to);
    onComplete?.();
    return;
  }

  const counter = { value: from };
  animate(counter, {
    value: to,
    duration: ms,
    ease,
    onUpdate: () => {
      element.textContent = format(counter.value);
    },
    onComplete: () => {
      // Land exactly on the target rather than wherever the last frame fell.
      element.textContent = format(to);
      onComplete?.();
    },
  });
}
