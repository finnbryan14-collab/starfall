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
export const BURST_EVENT = 'starfall:burst';

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

export type BurstDetail = { element: string | null; damage: number };

/**
 * Erupts in a character's element.
 *
 * Fired when a calculation finishes, which is the moment the app has something
 * to say. The element decides how it moves and the damage decides how hard.
 */
export function fireBurst(element: string | null, damage: number): void {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(
    new CustomEvent<BurstDetail>(BURST_EVENT, { detail: { element, damage } }),
  );
}

/** Listens for the above. Returns the unsubscribe. */
export function onBurst(listener: (detail: BurstDetail) => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const handler = (event: Event) => listener((event as CustomEvent<BurstDetail>).detail);
  document.addEventListener(BURST_EVENT, handler);
  return () => document.removeEventListener(BURST_EVENT, handler);
}
