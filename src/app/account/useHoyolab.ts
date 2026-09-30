'use client';

import { useCallback, useEffect, useState } from 'react';

import { db } from '@/db/schema';
import { setTimerAt, TIMER_IDS } from '@/db/timers';
import { timersFromNotes } from '@/engine/timers/from-notes';
import { fetchDiary, fetchNotes, mintWishUrl } from '@/lib/hoyolab-api';
import {
  canMintAuthkey,
  canReadChronicle,
  filterCookie,
  HOYOLAB_FAILURE_COPY,
  type DiaryMonth,
  type HoyolabFailure,
  type RealTimeNotes,
} from '@/lib/hoyolab';
import { WISH_FAILURE_COPY, type WishApiFailure } from '@/lib/wish-api';
import { syncWishes } from '@/lib/wish-sync';
import { readOr } from '@/lib/storage';

/**
 * The HoYoLAB opt-in.
 *
 * Nothing here runs unless the player has pasted a cookie. Everything the app
 * does without one keeps working exactly as it did, which is the condition
 * ROADMAP sets for this feature: declining it costs nothing that works today.
 */

const COOKIE_KEY = 'hoyolab-cookie';

export type HoyolabStatus =
  | { kind: 'idle' }
  | { kind: 'working'; what: string }
  | { kind: 'done'; message: string }
  | { kind: 'failed'; message: string };

export type HoyolabState = {
  /** The filtered cookie, or null when the opt-in is off. */
  cookie: string | null;
  /** False until storage has been read, so the panel can hold still. */
  loaded: boolean;
  canReadChronicle: boolean;
  canMintAuthkey: boolean;
  status: HoyolabStatus;
  notes: RealTimeNotes | null;
  diary: DiaryMonth | null;
  saveCookie: (raw: string) => Promise<void>;
  forget: () => Promise<void>;
  refreshTimers: () => Promise<void>;
  refreshWishes: () => Promise<void>;
  refreshDiary: () => Promise<void>;
};

export function useHoyolab(uid: string | null): HoyolabState {
  const [cookie, setCookie] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<HoyolabStatus>({ kind: 'idle' });
  const [notes, setNotes] = useState<RealTimeNotes | null>(null);
  const [diary, setDiary] = useState<DiaryMonth | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readOr(() => db.settings.get(COOKIE_KEY), undefined).then((row) => {
      if (cancelled) return;
      setCookie((row?.value as string | undefined) ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveCookie = useCallback(async (raw: string) => {
    // Filtered before the first write, so the cookies we do not use never
    // reach storage at all.
    const filtered = filterCookie(raw);
    if (!filtered) {
      setStatus({ kind: 'failed', message: HOYOLAB_FAILURE_COPY['invalid-cookie'] });
      return;
    }

    await db.settings.put({ key: COOKIE_KEY, value: filtered, updatedAt: Date.now() });
    setCookie(filtered);
    setStatus({ kind: 'done', message: 'Saved. Starfall can refresh itself now.' });
  }, []);

  const forget = useCallback(async () => {
    await db.settings.delete(COOKIE_KEY);
    setCookie(null);
    setNotes(null);
    setDiary(null);
    setStatus({ kind: 'idle' });
  }, []);

  /** Guards the two things every call needs, so each action can assume them. */
  const ready = useCallback(
    (what: string): { uid: string; cookie: string } | null => {
      if (!uid || !cookie) {
        setStatus({ kind: 'failed', message: 'Import your UID first, then paste your cookie.' });
        return null;
      }
      setStatus({ kind: 'working', what });
      return { uid, cookie };
    },
    [uid, cookie],
  );

  const fail = (reason: HoyolabFailure) =>
    setStatus({ kind: 'failed', message: HOYOLAB_FAILURE_COPY[reason] });

  const refreshTimers = useCallback(async () => {
    const args = ready('Reading your resin');
    if (!args) return;

    const result = await fetchNotes(args.uid, args.cookie);
    if (!result.ok) return fail(result.reason);

    setNotes(result.data);

    // Countdowns have to be run backwards into the moment each timer started,
    // or a transformer with two hours left reads as one just used.
    const timers = timersFromNotes(result.data, new Date());
    await setTimerAt(TIMER_IDS.resin, timers.resin.value, timers.resin.setAt);
    await setTimerAt(
      TIMER_IDS.realmCurrency,
      timers.realmCurrency.value,
      timers.realmCurrency.setAt,
    );
    if (timers.transformer) {
      await setTimerAt(TIMER_IDS.transformer, 0, timers.transformer.setAt);
    }

    setStatus({
      kind: 'done',
      message: `${result.data.resin} resin, straight from the game. Timers updated.`,
    });
  }, [ready]);

  const refreshWishes = useCallback(async () => {
    const args = ready('Fetching a fresh wish link');
    if (!args) return;

    const minted = await mintWishUrl(args.uid, args.cookie);
    if (!minted.ok) return fail(minted.reason);

    setStatus({ kind: 'working', what: 'Reading your wish history' });
    const sync = await syncWishes(minted.data);

    if (sync.reason) {
      setStatus({
        kind: 'failed',
        message: WISH_FAILURE_COPY[sync.reason as WishApiFailure],
      });
      return;
    }

    setStatus({
      kind: 'done',
      message:
        sync.added === 0
          ? 'Already up to date. No link to paste.'
          : `Imported ${sync.added} new ${sync.added === 1 ? 'pull' : 'pulls'}. No link to paste.`,
    });
  }, [ready]);

  const refreshDiary = useCallback(async () => {
    const args = ready('Reading your Traveler’s Diary');
    if (!args) return;

    const result = await fetchDiary(args.uid, args.cookie);
    if (!result.ok) return fail(result.reason);

    setDiary(result.data);
    setStatus({ kind: 'done', message: 'Diary read. This is what you actually earned.' });
  }, [ready]);

  return {
    cookie,
    loaded,
    canReadChronicle: cookie ? canReadChronicle(cookie) : false,
    canMintAuthkey: cookie ? canMintAuthkey(cookie) : false,
    status,
    notes,
    diary,
    saveCookie,
    forget,
    refreshTimers,
    refreshWishes,
    refreshDiary,
  };
}
