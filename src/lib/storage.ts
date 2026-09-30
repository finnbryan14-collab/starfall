import { useSyncExternalStore } from 'react';

/**
 * Noticing when the device will not let us store anything.
 *
 * Starfall keeps everything in IndexedDB, so a browser that blocks it takes the
 * whole app with it — and browsers do: Safari's private browsing has thrown on
 * `open()`, "block all cookies" covers site storage too, and some managed
 * devices switch it off outright. Left unhandled, the reads reject, the screens
 * that wait on them never finish loading, and the player gets a blank page with
 * nothing to read and nothing to try.
 *
 * Without storage Starfall is still a calculator: the engine is pure and every
 * screen computes from its own inputs. What is lost is remembering. So a failed
 * read is a *state*, not a crash — the screen renders empty and the shell says
 * plainly that nothing will be saved.
 */

let healthy = true;
const listeners = new Set<() => void>();

/**
 * Records that a read could not reach storage.
 *
 * Deliberately one-way. A browser that refused once will refuse again, and a
 * banner that flickers as reads succeed and fail would be worse than one that
 * stays put.
 */
export function reportStorageFailure(): void {
  if (!healthy) return;
  healthy = false;
  for (const listener of listeners) listener();
}

/** Test seam: forget that storage ever failed. */
export function resetStorageHealth(): void {
  healthy = true;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => healthy;
// Storage is assumed fine on the server, where there is none to speak of, so
// the prerendered HTML and the hydration pass agree.
const getServerSnapshot = () => true;

export function useStorageHealthy(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Runs a read, and answers with `fallback` if storage is unavailable.
 *
 * The fallback is passed in rather than inferred so each caller states what an
 * empty device looks like to it — which is the part a reader needs to see.
 */
export async function readOr<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    reportStorageFailure();
    return fallback;
  }
}
