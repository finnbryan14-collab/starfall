import type { Metadata } from 'next';

import styles from '@/components/screen.module.css';

export const metadata: Metadata = { title: 'Account — Starfall' };

/** Phase 0: static. The imports connect in Phase 4. */
export default function AccountPage() {
  return (
    <section className={styles.panel} aria-labelledby="acc-title">
      <div>
        <h1 className={styles.title} id="acc-title">
          Account
        </h1>
        <p className={styles.body}>
          Bring in your characters and wish history so the planner fills itself in. Everything stays
          on this device.
        </p>

        <h2 className={styles.sec}>Characters</h2>
        <label className="sr-only" htmlFor="uid">
          UID
        </label>
        <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-3)' }}>
          <input
            id="uid"
            inputMode="numeric"
            placeholder="Your 9- or 10-digit UID"
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 48,
              background: 'var(--well)',
              border: '1px solid transparent',
              borderRadius: 'var(--r-input)',
              padding: '0 14px',
              color: 'inherit',
              font: 'inherit',
            }}
          />
        </div>
        <p className={styles.body}>
          Only characters in your in-game showcase come through. Turn the showcase on in your
          profile first.
        </p>
      </div>

      <div className={styles.colSide}>
        <h2 className={styles.sec}>Wish history</h2>
        <p className={styles.body}>
          Paste the history link from the game. Starfall reads it once to fill in your pity and
          50/50 status, then forgets the link.
        </p>

        <h2 className={styles.sec}>Backups</h2>
        <p className={styles.body}>
          Export everything as one JSON file, or bring a backup back in.
        </p>

        <p className={styles.notice}>
          Starfall is a fan project and is not affiliated with HoYoverse. Game content and materials
          are trademarks and copyrights of HoYoverse.
        </p>
      </div>
    </section>
  );
}
