'use client';

import { animate, svg } from 'animejs';
import { useEffect, useMemo, useRef, useState } from 'react';

import screen from '@/components/screen.module.css';
import { StepperRow, TimerRow } from '@/components/ui';
import { listTimers, setTimer, TIMER_IDS } from '@/db/timers';
import type { TimerRow as TimerRecord } from '@/db/schema';
import { nextDailyReset, nextWeeklyReset } from '@/engine/time';
import {
  RESIN_CAP,
  realmCurrencyAt,
  resinAt,
  transformerAt,
  TRANSFORMER_COOLDOWN_HOURS,
} from '@/engine/timers/model';
import { formatNumber } from '@/lib/format';
import { useAccountServer } from '@/lib/use-account-server';
import { readOr } from '@/lib/storage';
import { duration, useAnimeScope, useReducedMotion } from '@/motion';

import styles from './TimersScreen.module.css';

/**
 * Every timer in one place.
 *
 * Nothing here counts down on its own. Each timer is derived from the value you
 * last confirmed and when you confirmed it, so closing the app for ten hours
 * leaves it correct rather than stale. The clock below only re-renders the
 * derived text — DESIGN.md allows countdown text to move, and nothing else.
 */

const TICK_MS = 30_000;
const RING_RADIUS = 96;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** "7 h 36 min", "2 days 4 h". Rounds to the minute, like the game. */
function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;

  if (days) return `${days} ${days === 1 ? 'day' : 'days'} ${hours} h`;
  if (hours) return `${hours} h ${rest} min`;
  return `${rest} min`;
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TimersScreen() {
  const now = useNow();
  // Resin and realm currency accrue at a fixed rate wherever you are; only the
  // resets are on server time.
  const { utcOffset } = useAccountServer();
  const [rows, setRows] = useState<TimerRecord[] | null>(null);
  const ringRoot = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    // An empty list, not a hang: without storage the screen is still a resin
    // calculator, and a device that cannot save should say so rather than
    // render nothing at all.
    void readOr(listTimers, []).then((loaded) => {
      if (!cancelled) setRows(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, TimerRecord>();
    for (const row of rows ?? []) map.set(row.id, row);
    return map;
  }, [rows]);

  const save = async (id: string, value: number, config?: Record<string, number>) => {
    const row = await setTimer(id, value, config);
    setRows((previous) => [...(previous ?? []).filter((r) => r.id !== id), row]);
  };

  const resinRow = byId.get(TIMER_IDS.resin);
  const resin = resinAt(
    { setAt: resinRow?.setAt ?? now.getTime(), value: resinRow?.value ?? 0 },
    now,
  );

  const transformerRow = byId.get(TIMER_IDS.transformer);
  const transformer = transformerRow ? transformerAt({ usedAt: transformerRow.setAt }, now) : null;

  const realmRow = byId.get(TIMER_IDS.realmCurrency);
  const realm = realmRow
    ? realmCurrencyAt(
        {
          setAt: realmRow.setAt,
          value: realmRow.value,
          ratePerHour: realmRow.config?.ratePerHour ?? 0,
          cap: realmRow.config?.cap ?? 2_400,
        },
        now,
      )
    : null;

  const filled = resin.value / RESIN_CAP;

  // The ring draws itself once when the screen opens (DESIGN.md).
  useAnimeScope(
    ringRoot,
    (scope) => {
      scope.add(() => {
        const ring = ringRoot.current?.querySelector<SVGCircleElement>('[data-ring]');
        if (!ring) return;

        const move = duration('move');
        if (reduced || move <= 0) {
          ring.style.strokeDasharray = `${RING_CIRCUMFERENCE * filled} ${RING_CIRCUMFERENCE}`;
          return;
        }
        // Rebuilt each run, because the dash length belongs to this fill level
        // (see src/motion/index.ts).
        animate(svg.createDrawable(ring), {
          draw: ['0 0', `0 ${filled}`],
          duration: 700,
          ease: 'out(3)',
        });
      });
    },
    [filled, reduced, rows !== null],
  );

  if (rows === null) {
    return <section className={screen.panel} aria-busy="true" />;
  }

  return (
    <section className={screen.panel} aria-labelledby="tim-title">
      <div>
        <h1 className={screen.title} id="tim-title">
          Original Resin
        </h1>

        <div className={styles.ringWrap} ref={ringRoot}>
          <svg
            className={styles.ring}
            width="220"
            height="220"
            viewBox="0 0 220 220"
            aria-hidden="true"
          >
            <circle
              className={styles.ringTrack}
              cx="110"
              cy="110"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="6"
            />
            <circle
              data-ring
              className={resin.full ? styles.ringFullFill : styles.ringFill}
              cx="110"
              cy="110"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>
          <div className={styles.ringCentre}>
            <p className={styles.ringValue}>{resin.value}</p>
            <span>of {RESIN_CAP}</span>
          </div>
        </div>

        <p className={screen.lede} aria-live="polite">
          {resin.full ? (
            <>
              <strong>Full.</strong> Anything you earn from here is wasted.
            </>
          ) : (
            <>
              Full in <strong>{formatDuration(resin.untilFullMs)}</strong>. One resin every 8
              minutes.
            </>
          )}
        </p>

        <div className={screen.ledger} style={{ marginTop: 'var(--s-5)' }}>
          <StepperRow
            label="Resin now"
            note="Tap the value and type what the game says"
            value={resin.value}
            onChange={(value) => void save(TIMER_IDS.resin, value)}
            max={RESIN_CAP}
            step={10}
            valueText={(v) => `${v} of ${RESIN_CAP} resin`}
          />
        </div>
      </div>

      <div className={screen.colSide}>
        <h2 className={screen.sec}>Everything else</h2>
        <div className={styles.list}>
          <TimerRow
            name="Parametric Transformer"
            state={
              transformer
                ? transformer.ready
                  ? 'Ready'
                  : `Ready in ${formatDuration(transformer.untilReadyMs)}`
                : 'Not tracked yet'
            }
            fraction={transformer ? transformer.progress : null}
            ready={transformer?.ready}
          />
          <div className={styles.action}>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => void save(TIMER_IDS.transformer, 0)}
            >
              I just used it
            </button>
            <span className={styles.hint}>
              Cooldown is {TRANSFORMER_COOLDOWN_HOURS} hours — 6 days 22, not the 7 the gadget says.
            </span>
          </div>

          <TimerRow
            name="Realm currency"
            state={
              realm
                ? `${formatNumber(realm.value)} of ${formatNumber(realmRow?.config?.cap ?? 2_400)}`
                : 'Not tracked yet'
            }
            fraction={realm ? realm.value / (realmRow?.config?.cap ?? 2_400) : null}
            ready={realm?.full}
          />

          {/* Reset is 4:00 *server* time; which server comes from the UID. */}
          <TimerRow
            name="Daily reset"
            state={`In ${formatDuration(+nextDailyReset(now, utcOffset) - +now)}`}
          />
          <TimerRow
            name="Weekly reset"
            state={`Monday, in ${formatDuration(+nextWeeklyReset(now, utcOffset) - +now)}`}
          />
        </div>

        <h2 className={screen.sec}>Your teapot</h2>
        <div className={screen.ledger}>
          <StepperRow
            label="Realm currency now"
            value={realmRow?.value ?? 0}
            onChange={(value) =>
              void save(TIMER_IDS.realmCurrency, value, {
                ratePerHour: realmRow?.config?.ratePerHour ?? 20,
                cap: realmRow?.config?.cap ?? 2_400,
              })
            }
            max={2_400}
            step={100}
          />
          <StepperRow
            label="Rate an hour"
            note="Read it off your Serenitea Pot"
            value={realmRow?.config?.ratePerHour ?? 20}
            onChange={(ratePerHour) =>
              void save(TIMER_IDS.realmCurrency, realmRow?.value ?? 0, {
                ratePerHour,
                cap: realmRow?.config?.cap ?? 2_400,
              })
            }
            max={100}
          />
        </div>

        <p className={screen.notice}>
          Values are worked out from when you last set them, so they stay right while the app is
          closed. Nothing here talks to your account.
        </p>
      </div>
    </section>
  );
}
