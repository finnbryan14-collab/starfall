'use client';

import { useMuted, setMutePreference } from '@/audio/settings';
import screen from '@/components/screen.module.css';

import styles from './HoyolabPanel.module.css';

/**
 * The one control sound needs.
 *
 * On by default, because every sound in the app responds to something the
 * player did — arriving at a build, a 5★ landing — and never to a page loading.
 * Browsers suspend audio until a gesture regardless, so nobody is ambushed on a
 * first visit. One tap turns it off and it stays off.
 *
 * There is no volume slider. Two short sounds do not need one, and the honest
 * choice between "on" and "off" is better than a dial nobody moves.
 */
export function SoundPanel() {
  const muted = useMuted();

  return (
    <>
      <h2 className={screen.sec}>Sound</h2>
      <p className={screen.body}>
        A chime when a 5★ lands, and an impact when a calculation does. Both are synthesised rather
        than recorded, so they cost nothing to download.
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          aria-pressed={!muted}
          onClick={() => void setMutePreference(!muted)}
        >
          {muted ? 'Turn sound on' : 'Turn sound off'}
        </button>
      </div>

      <p className={styles.hint}>
        {muted
          ? 'Sound is off. Nothing will play.'
          : 'Sound is on. It only ever plays in response to something you did.'}
      </p>
    </>
  );
}
