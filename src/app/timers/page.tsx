import type { Metadata } from 'next';

import styles from '@/components/screen.module.css';

export const metadata: Metadata = { title: 'Timers — Starfall' };

/**
 * Phase 0: static at the preview's sample state (143 of 200 resin).
 *
 * The countdowns that depend on "now" — the clock time resin fills, and the
 * daily and weekly reset — are shown as their rule rather than a live figure.
 * A server-rendered countdown would mismatch on hydration and would make the
 * comparison screenshots irreproducible. The timer engine is Phase 3.
 */
const RESIN = { now: 143, cap: 200 };
const RADIUS = 96;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TIMERS = [
  { name: 'Parametric Transformer', state: 'Ready in 2 days 4 h', fraction: 1 - 52 / 166 },
  { name: 'Expeditions', state: '3 of 5 back, next in 1 h 12 min', fraction: 0.6 },
  { name: 'Realm currency', state: '1,840 of 2,400', fraction: 1840 / 2400 },
  { name: 'Daily reset', state: '04:00 server time', fraction: null },
  { name: 'Weekly reset', state: 'Monday, 04:00 server time', fraction: null },
];

export default function TimersPage() {
  const filled = RESIN.now / RESIN.cap;

  return (
    <section className={styles.panel} aria-labelledby="tim-title">
      <div>
        <h1 className={styles.title} id="tim-title">
          Original Resin
        </h1>

        <div style={{ position: 'relative', width: 220, height: 220, margin: 'var(--s-5) 0 0' }}>
          <svg
            width="220"
            height="220"
            viewBox="0 0 220 220"
            style={{ transform: 'rotate(-90deg)' }}
            aria-hidden="true"
          >
            <circle cx="110" cy="110" r={RADIUS} fill="none" stroke="var(--rule)" strokeWidth="6" />
            <circle
              cx="110"
              cy="110"
              r={RADIUS}
              fill="none"
              stroke="var(--starlight)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(CIRCUMFERENCE * filled).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <p className={styles.answer} style={{ margin: 0, fontSize: '4rem' }}>
              {RESIN.now}
            </p>
            <span style={{ color: 'var(--dim)', fontSize: 'var(--t-sm)' }}>of {RESIN.cap}</span>
          </div>
        </div>

        <p className={styles.lede}>
          Full in <strong>7 h 36 min</strong>. One resin every 8 minutes.
        </p>
      </div>

      <div className={styles.colSide}>
        <h2 className={styles.sec}>Everything else</h2>
        <div style={{ borderTop: '1px solid var(--rule)' }}>
          {TIMERS.map((timer) => (
            <div
              key={timer.name}
              style={{ padding: 'var(--s-3) 0', borderBottom: '1px solid var(--rule)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--s-3)' }}>
                <span>{timer.name}</span>
                <span style={{ color: 'var(--dim)', textAlign: 'right' }}>{timer.state}</span>
              </div>
              {timer.fraction !== null ? (
                <div
                  style={{
                    height: 2,
                    background: 'var(--rule)',
                    borderRadius: 2,
                    marginTop: 'var(--s-2)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(timer.fraction * 100).toFixed(1)}%`,
                      background: 'var(--starlight)',
                    }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
