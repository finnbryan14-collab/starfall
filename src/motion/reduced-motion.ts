/**
 * `prefers-reduced-motion` support.
 *
 * Read live rather than snapshotted at module load: design/preview.html captures
 * `matchMedia(...).matches` once into a `const`, so toggling the OS setting mid
 * session has no effect until reload. Subscribing costs nothing and is correct.
 */

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    // No window: server render. Assume motion is fine; the client corrects it.
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Subscribes to changes. Returns an unsubscribe function. */
export function onReducedMotionChange(listener: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  const handler = (event: MediaQueryListEvent) => listener(event.matches);

  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}
