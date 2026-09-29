import type { Metadata } from 'next';

import styles from '@/components/screen.module.css';

export const metadata: Metadata = { title: 'Plan — Starfall' };

/**
 * Phase 0: static at the preview's sample values (11,200 primogems, 14 fates,
 * pity 22, 50/50, 3,850 income -> 108 pulls). Every figure here is the verified
 * output of the model in docs/MATH.md §1, not a placeholder. The engine, the
 * Fate Dial and the live inputs arrive in Phase 1.
 */
/** Verified against the model: 72.88%, 15.65%, 1.53% at 108 pulls, pity 22, 50/50. */
const CONSTELLATIONS = [
  { label: 'C0', chance: '73%', starOpacity: 0.8 },
  { label: 'C1', chance: '16%', starOpacity: 0.37 },
  { label: 'C2', chance: '2%', starOpacity: 0.26 },
];

export default function PlanPage() {
  return (
    <section className={styles.panel} aria-labelledby="plan-title">
      <div>
        <h1 className={styles.title} id="plan-title">
          Skirk returns Oct 13
        </h1>
        <p className={styles.answer}>
          72.9<span className={styles.unit}>%</span>
        </p>
        <p className={styles.lede}>
          chance you get her by then, with the <strong>108</strong> pulls you&rsquo;ll have.
        </p>

        <figure style={{ margin: 0 }}>
          <div className={styles.pending} style={{ aspectRatio: '358 / 214' }}>
            Fate Dial — Phase 1
          </div>
          <figcaption className={styles.caption}>
            Chance of getting her by each pull. Gold is what your stash covers.
          </figcaption>
        </figure>

        <ul className={styles.cons} aria-label="Chance by constellation">
          {CONSTELLATIONS.map((c) => (
            <li key={c.label}>
              {/* The preview fades each star in proportion to its chance. */}
              <span className={styles.star} aria-hidden="true" style={{ opacity: c.starOpacity }}>
                ★
              </span>
              {c.label} <b>{c.chance}</b>
            </li>
          ))}
        </ul>

        <p className={styles.hint}>26 more pulls (4,160 primogems) gets you to 90% odds.</p>
      </div>

      <div className={styles.colSide}>
        <h2 className={styles.sec}>Your stash</h2>
        <div className={styles.ledger}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Primogems</span>
            <span className={styles.rowValue}>11,200</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Intertwined Fates</span>
            <span className={styles.rowValue}>14</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>
              Pity
              <span className={styles.rowNote}>Pulls since your last 5★</span>
            </span>
            <span className={styles.rowValue}>22</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Next 5★</span>
            <span className={styles.rowValue}>50/50</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>
              Income by Oct 13
              <span className={styles.rowNote}>
                2,250 from dailies and Welkin, plus your estimate for events
              </span>
            </span>
            <span className={styles.rowValue}>3,850</span>
          </div>
        </div>
      </div>
    </section>
  );
}
