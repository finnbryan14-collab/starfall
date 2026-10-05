'use client';

import { useSyncExternalStore } from 'react';

import { db } from '@/db/schema';
import { readOr } from '@/lib/storage';

import { isMuted, isMutedOnServer, setMuted, subscribeToMute } from './context';

/**
 * Whether sound is on, remembered across sessions.
 *
 * Kept apart from src/audio/context.ts so the sounds can read a synchronous
 * value without any of them knowing that IndexedDB exists — and so a device
 * that blocks storage still gets working audio for the session, it just forgets
 * the choice.
 */

const KEY = 'audio-muted';

/**
 * Sound is on by default.
 *
 * It only ever plays in response to something the player did — arriving at a
 * build, a 5★ landing — never on a page load, and browsers suspend audio until
 * a gesture regardless. Defaulting off would mean almost nobody ever hears it,
 * which is a strange way to ship a feature. One tap turns it off for good.
 */
const DEFAULT_MUTED = false;

/** Reads the stored preference and applies it. Call once, on mount. */
export async function loadMutePreference(): Promise<void> {
  const row = await readOr(() => db.settings.get(KEY), undefined);
  setMuted(typeof row?.value === 'boolean' ? row.value : DEFAULT_MUTED);
}

/** Flips sound on or off, and remembers it. */
export async function setMutePreference(next: boolean): Promise<void> {
  setMuted(next);
  await readOr(() => db.settings.put({ key: KEY, value: next, updatedAt: Date.now() }), undefined);
}

/**
 * The live mute state, for a control to render.
 *
 * Muted on the server, so the prerendered HTML and the hydration pass agree —
 * the stored preference is not readable until the client has mounted.
 */
export function useMuted(): boolean {
  return useSyncExternalStore(subscribeToMute, isMuted, isMutedOnServer);
}
