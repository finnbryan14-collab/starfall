import { useSyncExternalStore } from 'react';

/**
 * False on the server and through the hydration pass, true afterwards.
 *
 * For anything that depends on the browser's capabilities rather than on data:
 * `showDirectoryPicker` does not exist on the server, so a component that
 * branches on it during render produces one tree in the prerendered HTML and a
 * different one when React hydrates — a mismatch React resolves by throwing
 * the server markup away and re-rendering the whole subtree.
 *
 * `useSyncExternalStore` is the sanctioned way to say "this differs between
 * the two passes": the server snapshot is used for both, and React re-renders
 * once hydration has committed. See also useMountedNow, which does the same
 * for the clock.
 */

/** Never fires: hydration happens once. */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
