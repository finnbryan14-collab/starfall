'use client';

import { useState } from 'react';

import { formatNumber } from '@/lib/format';

import styles from './HoyolabPanel.module.css';
import { useHoyolab } from './useHoyolab';

/**
 * The HoYoLAB opt-in.
 *
 * Deliberately not a one-tap toggle. A player is about to hand over the
 * credential that reads their whole account, so the panel says what it unlocks,
 * what it costs, and what happens to the cookie, before it asks for anything.
 * The default is off and everything else on this screen works without it.
 */

type Props = { uid: string | null };

export function HoyolabPanel({ uid }: Props) {
  const hoyolab = useHoyolab(uid);
  const [draft, setDraft] = useState('');

  const busy = hoyolab.status.kind === 'working';

  return (
    <>
      <h2 className={styles.heading}>HoYoLAB (optional)</h2>
      <p className={styles.body}>
        Starfall works without this. With it, it stops asking you for things: live resin, your real
        primogem income, and wish history that refreshes with no link to paste.
      </p>

      <details className={styles.disclosure}>
        <summary>What it does, and what it costs</summary>

        <ul className={styles.list}>
          <li>
            <strong>Wish history with no pasting.</strong> A wish link lasts about a day. With your
            cookie, Starfall fetches a fresh one itself, so pity is never stale.
          </li>
          <li>
            <strong>Live resin and timers.</strong> Read from the game rather than typed in, so the
            resin ring is right even after a week away.
          </li>
          <li>
            <strong>Real primogem income.</strong> The Traveler&rsquo;s Diary reports what you
            actually earned last month, by source — not an estimate.
          </li>
        </ul>

        <p className={styles.warning}>
          A HoYoLAB cookie reads your whole account. Starfall keeps only the handful of values these
          three requests need and drops the rest of what you paste. It is stored on this device.
          Each request passes through Starfall&rsquo;s own proxy, which is what lets a browser talk
          to HoYoLAB at all — nothing is stored or logged there, but it is not true to say it never
          leaves your device, so we don&rsquo;t say it.
        </p>

        <p className={styles.hint}>
          To get it: sign in at hoyolab.com, open your browser&rsquo;s developer tools, and copy the
          Cookie header from any request. Signing out of HoYoLAB invalidates it.
        </p>
      </details>

      {!hoyolab.loaded ? null : hoyolab.cookie ? (
        <>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void hoyolab.refreshWishes()}
              disabled={busy || !hoyolab.canMintAuthkey}
            >
              Refresh wishes
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void hoyolab.refreshTimers()}
              disabled={busy || !hoyolab.canReadChronicle}
            >
              Refresh timers
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void hoyolab.refreshDiary()}
              disabled={busy || !hoyolab.canReadChronicle}
            >
              Read my diary
            </button>
          </div>

          {/*
            Said before a button is pressed rather than after it fails: the two
            capabilities come from different cookies, and a paste can easily
            carry one set and not the other.
          */}
          {!hoyolab.canMintAuthkey ? (
            <p className={styles.hint}>
              That cookie can read your account but cannot mint a wish link — it is missing
              cookie_token_v2. Copy the Cookie header again after signing in.
            </p>
          ) : null}

          <p className={styles.hint}>
            <button type="button" className={styles.quiet} onClick={() => void hoyolab.forget()}>
              Forget this cookie
            </button>
          </p>
        </>
      ) : (
        <form
          className={styles.field}
          onSubmit={(event) => {
            event.preventDefault();
            void hoyolab.saveCookie(draft);
            setDraft('');
          }}
        >
          <label className="sr-only" htmlFor="hoyolab-cookie">
            HoYoLAB cookie
          </label>
          <textarea
            id="hoyolab-cookie"
            className={styles.input}
            placeholder="Paste your HoYoLAB Cookie header"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div>
            <button type="submit" className={styles.secondary}>
              Turn it on
            </button>
          </div>
        </form>
      )}

      {hoyolab.status.kind === 'working' ? (
        <p className={styles.progress} aria-live="polite">
          {hoyolab.status.what}…
        </p>
      ) : null}

      {hoyolab.status.kind === 'failed' ? (
        <p className={styles.failure} role="alert">
          {hoyolab.status.message}
        </p>
      ) : null}

      {hoyolab.status.kind === 'done' ? (
        <p className={styles.success} aria-live="polite">
          {hoyolab.status.message}
        </p>
      ) : null}

      {hoyolab.notes ? (
        <div className={styles.readout}>
          <p className={styles.line}>
            <strong>{formatNumber(hoyolab.notes.resin)}</strong> of {hoyolab.notes.resinCap} resin,{' '}
            <strong>
              {hoyolab.notes.commissionsDone}/{hoyolab.notes.commissionsTotal}
            </strong>{' '}
            commissions, <strong>{hoyolab.notes.weeklyBossDiscountsLeft}</strong> weekly boss
            discounts left.
          </p>
        </div>
      ) : null}

      {hoyolab.diary ? (
        <div className={styles.readout}>
          <p className={styles.line}>
            <strong>{formatNumber(hoyolab.diary.primogems)}</strong> primogems this month, against{' '}
            {formatNumber(hoyolab.diary.lastMonthPrimogems)} last month.
          </p>
          <ul className={styles.sources}>
            {hoyolab.diary.categories.map((category) => (
              <li key={category.name}>
                <span>{category.name}</span>
                <b>{formatNumber(category.amount)}</b>
              </li>
            ))}
          </ul>
          <p className={styles.hint}>
            This is what you earned, not what the planner assumes. Use it to set your own income
            figure in the Plan screen&rsquo;s assumptions sheet.
          </p>
        </div>
      ) : null}
    </>
  );
}
