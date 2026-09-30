'use client';

import { useStorageHealthy } from '@/lib/storage';

import styles from './Shell.module.css';

/**
 * Says so when the browser will not let Starfall store anything.
 *
 * Safari's private browsing, "block all cookies" and some managed devices all
 * switch site storage off. Starfall keeps everything there, so on those devices
 * it becomes a calculator that forgets — which is usable, and much better than
 * the blank screen the unhandled rejections used to produce, but only if the
 * player is told rather than left to discover it when their plan vanishes.
 *
 * Renders nothing at all in the normal case, so it costs nobody anything.
 */
export function StorageNotice() {
  if (useStorageHealthy()) return null;

  return (
    <p className={styles.blocked} role="status">
      This browser is blocking site storage, so nothing you enter will be here when you come back.
      Everything still works — the answers are all worked out on this device. Turning off private
      browsing, or allowing site data for this page, is what fixes it.
    </p>
  );
}
