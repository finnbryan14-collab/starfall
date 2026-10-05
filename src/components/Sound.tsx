'use client';

import { useEffect } from 'react';

import { audio } from '@/audio/context';
import { loadMutePreference } from '@/audio/settings';
import { playBurst, playMeteor } from '@/audio/sounds';
import { intensityFor } from '@/three/elements';
import { onBurst, onMeteor } from '@/lib/moments';

/**
 * Sound, wired to the same moments the sky is.
 *
 * One event, two things listening: the eruption is seen and heard off a single
 * `fireBurst`. That is the whole reason the moment bus is an event rather than
 * a prop — a screen says what happened, and whether anything renders or sounds
 * is not its concern.
 *
 * Renders nothing, and is silent by default on first load: browsers suspend an
 * AudioContext built without a user gesture, so the context is created on the
 * first interaction rather than on mount. A player who never clicks anything
 * never hears anything, which is the correct outcome.
 */
export function Sound() {
  useEffect(() => {
    void loadMutePreference();

    /*
      The unlock. Creating the context inside a real gesture is what stops the
      browser suspending it, and `once` means this costs one listener for the
      lifetime of the page rather than a handler on every click.

      `audio()` returns null while muted, which is fine — the next unmute is
      itself a click, and so is its own gesture.
    */
    const unlock = () => {
      audio();
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });

    const stopMeteor = onMeteor(() => playMeteor());
    const stopBurst = onBurst(({ damage }) => playBurst(intensityFor(damage)));

    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      stopMeteor();
      stopBurst();
    };
  }, []);

  return null;
}
