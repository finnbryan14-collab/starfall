'use client';

import { useEffect, useRef } from 'react';

import { tweenNumber } from './tweenNumber';

/**
 * Counts an AnswerBlock's numeral to its new value.
 *
 * `/plan` has done this since the beginning, through the Fate Dial's timeline.
 * The other three answers — the artifact verdict, the luck percentile, the
 * damage figure — snapped, which made them read as less important than the one
 * that counts. They are the same kind of answer and should arrive the same way.
 *
 * Pass the returned ref as AnswerBlock's `valueRef`. That freezes React out of
 * the numeral, which is the point: if React keeps writing it, a changed input
 * paints the final value before the tween starts, the tween reads its own
 * target as its origin, and nothing counts.
 *
 * `null` means there is no answer yet — the first real value counts up from
 * zero rather than appearing, since arriving at a number is the moment worth
 * animating.
 */
export function useTweenedNumeral(
  value: number | null,
  format: (value: number) => string,
): React.RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement | null>(null);
  const previous = useRef<number | null>(null);

  /*
    Held in a ref so an inline formatter — which every caller writes — does not
    re-run the tween on every render.

    Synced in its own effect rather than during render, because mutating a ref
    while rendering is a React rule violation and the lint rule is right about
    it. Declared first, so it has already run by the time the tween below reads
    it on the same commit.
  */
  const formatter = useRef(format);
  useEffect(() => {
    formatter.current = format;
  });

  useEffect(() => {
    const element = ref.current;
    if (element === null || value === null) return;

    const from = previous.current;
    previous.current = value;

    // Nothing to count: this is the value already painted on the server.
    if (from === value) return;

    tweenNumber(element, from ?? 0, value, (current) => formatter.current(current));
  }, [value]);

  return ref;
}
