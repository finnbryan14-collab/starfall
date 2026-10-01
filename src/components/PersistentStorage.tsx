'use client';

import { useEffect } from 'react';

import { requestPersistenceQuietly } from '@/lib/persistence';

/**
 * Asks the browser to keep what Starfall stores, where asking is free.
 *
 * Everything lives in IndexedDB, and by default a browser may clear it to
 * reclaim space — WebKit will also evict an origin the player has not opened
 * for a while. Opting in to persistent mode stops that.
 *
 * Only the silent path runs here. web.dev says not to ask on page load, because
 * Firefox raises a permission popup and one appearing out of nothing is how a
 * site gets dismissed — so `requestPersistenceQuietly` checks first and leaves
 * that case to the button on the Account screen.
 *
 * What is left is the case that matters most. Safari cannot answer the
 * permission query at all and never prompts; it decides on its own heuristics,
 * one of which is whether the app was opened from the Home Screen. That is the
 * iPhone, it is silent, and there is no gesture to hang it on — so it happens
 * here or it does not happen.
 *
 * Renders nothing. A refusal costs the player nothing they had, so there is
 * nothing to interrupt them with — the Account screen says where things stand
 * for anyone who goes looking.
 */
export function PersistentStorage() {
  useEffect(() => {
    void requestPersistenceQuietly();
  }, []);

  return null;
}
