/**
 * How a screen asks the sky for a meteor.
 *
 * An event rather than a context, because the sky lives in the shell and the
 * moments that deserve one are scattered across routes that have no reason to
 * know a renderer exists. A screen says "a 5★ just landed"; whether anything is
 * listening — reduced motion, no WebGL, data saver — is not its problem.
 *
 * The one loud thing the sky does, so it is deliberately hard to fire by
 * accident: nothing calls this on a render, a load or an input change.
 *
 * See docs/DESIGN.md.
 */

export const METEOR_EVENT = 'starfall:meteor';

/**
 * Fires a meteor across the sky, if there is a sky to fire it across.
 *
 * Safe to call from anywhere, including the server, where it does nothing.
 */
export function fireMeteor(): void {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent(METEOR_EVENT));
}

/** Listens for the above. Returns the unsubscribe. */
export function onMeteor(listener: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener(METEOR_EVENT, listener);
  return () => document.removeEventListener(METEOR_EVENT, listener);
}
