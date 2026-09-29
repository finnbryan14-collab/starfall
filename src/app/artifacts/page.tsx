import type { Metadata } from 'next';

import styles from '@/components/screen.module.css';

export const metadata: Metadata = { title: 'Artifacts — Starfall' };

/**
 * Phase 0: static at the preview's sample piece (ATK% sands at +0 with CRIT
 * Rate 3.11, CRIT DMG 6.99, ER 5.18, DEF 18.52). 49.5% and the resin figures
 * are the verified output of docs/MATH.md §4. The simulator, histogram and
 * "Roll to +20" arrive in Phase 2.
 */
const SUBSTATS = [
  { name: 'CRIT Rate', value: '3.1%', goal: true },
  { name: 'CRIT DMG', value: '7.0%', goal: true },
  { name: 'Energy Recharge', value: '5.2%', goal: false },
  { name: 'DEF', value: '19', goal: false },
];

export default function ArtifactsPage() {
  return (
    <section className={styles.panel} aria-labelledby="art-title">
      <div>
        <h1 className={styles.title} id="art-title">
          Worth leveling this sands?
        </h1>
        <p className={styles.answer}>
          49.5<span className={styles.unit}>%</span>
        </p>
        <p className={styles.lede}>
          <strong className={styles.verdictKeep}>Level it.</strong> About even odds it finishes at
          30+ crit value.
        </p>

        <div style={{ marginTop: 'var(--s-5)', borderTop: '1px solid var(--rule)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s-3)',
              padding: 'var(--s-3) 0',
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              aria-hidden="true"
              style={{ flex: 'none' }}
            >
              <rect
                x="0.5"
                y="0.5"
                width="39"
                height="39"
                rx="10"
                fill="var(--well)"
                stroke="var(--rule)"
              />
              <path
                d="M13 9 H27 M13 31 H27 M14 9 C14 16 20 17 20 20 C20 23 14 24 14 31 M26 9 C26 16 20 17 20 20 C20 23 26 24 26 31"
                fill="none"
                stroke="var(--gold)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>Sands of Eon, ATK%</p>
              <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--dim)' }}>
                <span style={{ color: 'var(--gold)', letterSpacing: 1 }} aria-label="5 stars">
                  ★★★★★
                </span>{' '}
                +0, four substats
              </p>
            </div>
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {SUBSTATS.map((sub) => (
              <li
                key={sub.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  padding: '10px 0 12px',
                  borderTop: '1px solid var(--rule)',
                }}
              >
                <span>{sub.name}</span>
                <span>{sub.value}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.ledger} style={{ marginTop: 'var(--s-5)' }}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>
              Goal: crit value
              <span className={styles.rowNote}>2 × CRIT Rate + CRIT DMG at +20</span>
            </span>
            <span className={styles.rowValue}>30</span>
          </div>
        </div>

        <figure style={{ margin: 0 }}>
          <div className={styles.pending} style={{ aspectRatio: '358 / 150' }}>
            Score histogram — Phase 2
          </div>
          <figcaption className={styles.caption}>
            Where it lands at +20, across 20,000 simulated upgrade paths.
          </figcaption>
        </figure>
      </div>

      <div className={styles.colSide}>
        <h2 className={styles.sec}>Farming a replacement</h2>
        <p className={styles.body}>
          An on-set ATK% sands that finishes at 30+ crit value, from its domain at 20 resin a run.
        </p>
        <div className={styles.ledger} style={{ marginTop: 'var(--s-3)' }}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Half the time</span>
            <span className={styles.rowValue}>
              15,260 resin<small>85 days of natural resin</small>
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>9 times in 10</span>
            <span className={styles.rowValue}>
              50,700 resin<small>282 days of natural resin</small>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
