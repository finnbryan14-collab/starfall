'use client';

import { useSyncExternalStore } from 'react';

import { onReducedMotionChange, prefersReducedMotion } from './reduced-motion';

function subscribe(onStoreChange: () => void) {
  return onReducedMotionChange(onStoreChange);
}

/**
 * Live `prefers-reduced-motion`. Returns false during server render so markup
 * matches, then corrects on the client without a hydration mismatch.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
