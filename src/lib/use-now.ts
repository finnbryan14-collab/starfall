import { useSyncExternalStore } from 'react';

/**
 * The wall clock, read once per mount — null until hydration has committed.
 *
 * Anything derived from `new Date()` in a render body disagrees between the
 * prerendered HTML, which carries the build clock, and the hydration pass,
 * which carries the visitor's. React reports that as a mismatch and the text
 * can flicker. useSyncExternalStore is the sanctioned way around it: the
 * server snapshot is used for both the HTML and the hydration render, and
 * React re-renders with the client snapshot once hydration is done.
 *
 * The snapshot has to be stable between calls or React re-renders forever, so
 * the reading is taken once and cached. A tab left open overnight therefore
 * keeps yesterday's reading; for "how old is this data, in days" that is
 * immaterial, and anything needing a live clock should subscribe to a timer
 * instead of reaching for this.
 */

/** Never fires: the reading is fixed for the life of the page. */
const subscribe = () => () => {};

let reading: number | null = null;
const getSnapshot = () => (reading ??= Date.now());
const getServerSnapshot = () => null;

export function useMountedNow(): Date | null {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return ms === null ? null : new Date(ms);
}

/** Forgets the cached reading. Tests only. */
export function resetClockReading(): void {
  reading = null;
}
