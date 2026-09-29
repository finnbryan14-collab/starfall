import { Nav } from '@/components/Nav';
import { Starfield } from '@/components/Starfield';

import styles from './Shell.module.css';

/**
 * Everything that surrounds a screen: star chart, wordmark, reading column and
 * the four-destination nav. Matches design/preview.html.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Starfield />

      <div className={styles.app}>
        <header className={styles.top}>
          <span className={styles.wordmark}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 0 L9.6 6.4 L16 8 L9.6 9.6 L8 16 L6.4 9.6 L0 8 L6.4 6.4 Z"
                fill="var(--gold)"
              />
            </svg>
            Starfall
          </span>
          <span className={styles.sample}>Preview with sample data</span>
        </header>

        <main>{children}</main>

        {/*
          The fan-project notice. On every page rather than only Account:
          someone linked straight to /plan has to be able to see it too.
        */}
        <footer className={styles.footer}>
          Starfall is a fan project and is not affiliated with HoYoverse. Game content and materials
          are trademarks and copyrights of HoYoverse. Banner schedules from{' '}
          <a href="https://paimon.moe" rel="noreferrer noopener" target="_blank">
            paimon.moe
          </a>{' '}
          (MIT); character data from{' '}
          <a href="https://enka.network" rel="noreferrer noopener" target="_blank">
            Enka.Network
          </a>
          .
        </footer>
      </div>

      <Nav />
    </>
  );
}
