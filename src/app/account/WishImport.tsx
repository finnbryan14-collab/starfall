'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { wishSummary } from '@/db/wishes';
import type { HistorySummary } from '@/engine/wish/history';
import { WISH_FAILURE_COPY, type WishApiFailure } from '@/lib/wish-api';
import {
  CACHE_FAILURE_COPY,
  isFileSystemAccessSupported,
  loadCacheHandle,
  pickWebCachesFolder,
  readWishUrl,
  saveCacheHandle,
  type CacheReadFailure,
} from '@/lib/wish-cache-fs';
import type { ImportProgress } from '@/lib/wish-import';
import { syncWishes } from '@/lib/wish-sync';
import { formatNumber } from '@/lib/format';

import styles from './WishImport.module.css';

/**
 * Importing wish history, either from a pasted link or from the game's own
 * cache folder.
 *
 * The folder route exists because an authkey lasts about a day: every other
 * tracker makes you re-run a script and re-paste every time. Granting the
 * folder once lets Starfall fetch a fresh key itself.
 *
 * Nothing about the link is stored. What lands in IndexedDB is the pulls.
 */

type Status =
  | { kind: 'idle' }
  | { kind: 'importing'; progress: ImportProgress | null }
  | { kind: 'done'; added: number; summary: HistorySummary }
  | { kind: 'failed'; message: string };

export function WishImport() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [hasFolder, setHasFolder] = useState(false);
  const supportsFolder = isFileSystemAccessSupported();

  useEffect(() => {
    let cancelled = false;
    void wishSummary().then((result) => {
      if (!cancelled && result.totalPulls > 0) setSummary(result);
    });
    void loadCacheHandle().then((handle) => {
      if (!cancelled) setHasFolder(handle !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const runImport = useCallback(async (link: string) => {
    setStatus({ kind: 'importing', progress: null });

    const result = await syncWishes(link, {
      onProgress: (progress) => setStatus({ kind: 'importing', progress }),
    });
    setSummary(result.summary);

    if (result.reason) {
      setStatus({ kind: 'failed', message: WISH_FAILURE_COPY[result.reason as WishApiFailure] });
      return;
    }

    setStatus({ kind: 'done', added: result.added, summary: result.summary });
  }, []);

  const importFromFolder = useCallback(
    async (pickFirst: boolean) => {
      let handle = await loadCacheHandle();

      if (pickFirst || !handle) {
        const picked = await pickWebCachesFolder();
        if (!picked) return; // Cancelled, which is not a failure.
        await saveCacheHandle(picked);
        setHasFolder(true);
        handle = picked;
      }

      const read = await readWishUrl(handle, { interactive: true });
      if (!read.ok) {
        setStatus({
          kind: 'failed',
          message: CACHE_FAILURE_COPY[read.reason as CacheReadFailure],
        });
        return;
      }

      await runImport(read.wish.url);
    },
    [runImport],
  );

  return (
    <>
      <h2 className={styles.heading}>Wish history</h2>
      <p className={styles.body}>
        Fills in your pity and 50/50 automatically. Starfall reads the link once and never stores it
        — only the pulls are kept.
      </p>

      {supportsFolder ? (
        <div className={styles.folder}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void importFromFolder(false)}
            disabled={status.kind === 'importing'}
          >
            {hasFolder ? 'Refresh from your game folder' : 'Use my game folder'}
          </button>
          <p className={styles.hint}>
            {hasFolder
              ? 'Open Wish → History in the game, then press this. No link to copy.'
              : 'Pick your Genshin webCaches folder once and Starfall can read a fresh link itself, every time.'}
          </p>
          {hasFolder ? (
            <button
              type="button"
              className={styles.quiet}
              onClick={() => void importFromFolder(true)}
            >
              Pick a different folder
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        className={styles.field}
        onSubmit={(event) => {
          event.preventDefault();
          void runImport(url);
        }}
      >
        <label className="sr-only" htmlFor="wish-url">
          Wish history link
        </label>
        <input
          id="wish-url"
          className={styles.input}
          type="url"
          autoComplete="off"
          placeholder={supportsFolder ? 'Or paste the link' : 'Paste the link from the game'}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button type="submit" className={styles.secondary} disabled={status.kind === 'importing'}>
          Import wishes
        </button>
      </form>

      {status.kind === 'importing' ? (
        <p className={styles.progress} aria-live="polite">
          {status.progress
            ? `Reading ${status.progress.bannerLabel}… ${formatNumber(status.progress.found)} pulls so far.`
            : 'Starting…'}
        </p>
      ) : null}

      {status.kind === 'failed' ? (
        <p className={styles.failure} role="alert">
          {status.message}
        </p>
      ) : null}

      {status.kind === 'done' ? (
        <p className={styles.success} aria-live="polite">
          {status.added === 0
            ? 'Already up to date.'
            : `Imported ${formatNumber(status.added)} new ${status.added === 1 ? 'pull' : 'pulls'}.`}
        </p>
      ) : null}

      {summary && summary.totalPulls > 0 ? (
        <div className={styles.summary}>
          <p className={styles.line}>
            <strong>{formatNumber(summary.pity)}</strong> pity, and your next 5★ is{' '}
            <strong>{summary.guaranteed ? 'guaranteed' : 'a 50/50'}</strong>.
          </p>

          {summary.fiveStars.length > 0 ? (
            <p className={styles.line}>
              {/*
                Shown rather than applied silently: the standard-character list
                this is judged against goes stale when HoYoverse adds one, and
                a player can see at a glance whether we read it right.
              */}
              Last 5★ was <strong>{summary.fiveStars.at(-1)!.name}</strong> at{' '}
              {summary.fiveStars.at(-1)!.pity} pity
              {summary.fiveStars.at(-1)!.featured ? '' : ', a standard character'}.
            </p>
          ) : null}

          <p className={styles.line}>
            {summary.fiftyFiftyWins + summary.fiftyFiftyLosses > 0 ? (
              <>
                You&rsquo;ve won <strong>{summary.fiftyFiftyWins}</strong> of{' '}
                {summary.fiftyFiftyWins + summary.fiftyFiftyLosses} real 50/50s
                {summary.averagePity !== null
                  ? `, averaging ${summary.averagePity.toFixed(1)} pulls per 5★`
                  : ''}
                .
              </>
            ) : (
              <>No 50/50s rolled yet.</>
            )}
          </p>

          <p className={styles.note}>
            Guaranteed pulls aren&rsquo;t counted as 50/50 wins — they weren&rsquo;t coin flips.
          </p>

          <p className={styles.note}>
            <Link href="/account/luck" className={styles.quiet}>
              See how lucky that actually is
            </Link>
          </p>
        </div>
      ) : null}
    </>
  );
}
