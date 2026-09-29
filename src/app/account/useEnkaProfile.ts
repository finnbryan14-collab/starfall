'use client';

import { useCallback, useEffect, useState } from 'react';

import { db } from '@/db/schema';
import {
  describeAge,
  isValidUid,
  msUntilRefresh,
  type CachedProfile,
  type EnkaFailure,
} from '@/lib/enka';

/**
 * Importing a UID's showcase, and holding on to it.
 *
 * The profile lives in IndexedDB, so it survives a reload and is there offline.
 * Enka's TTL is honoured here rather than only on the server: their docs say a
 * repeat request burns rate limit even when it returns cached data, so the only
 * thing that truly protects the limit is not making the request.
 */

const PROFILE_KEY = 'enka-profile';

export type EnkaProfileState = {
  profile: CachedProfile | null;
  /** Null until storage has been read, so the screen can hold still. */
  loaded: boolean;
  importing: boolean;
  failure: EnkaFailure | null;
  /** Milliseconds until a refresh is allowed. Zero when it is. */
  cooldownMs: number;
  age: string | null;
};

export function useEnkaProfile() {
  const [profile, setProfile] = useState<CachedProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [failure, setFailure] = useState<EnkaFailure | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    db.settings.get(PROFILE_KEY).then((row) => {
      if (cancelled) return;
      setProfile((row?.value as CachedProfile | undefined) ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keeps the "updated 3 min ago" line and the refresh cooldown honest.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const importUid = useCallback(async (uid: string) => {
    const trimmed = uid.trim();
    if (!isValidUid(trimmed)) {
      setFailure('invalid-uid');
      return;
    }

    setImporting(true);
    setFailure(null);

    try {
      const response = await fetch(`/api/enka/${trimmed}`);
      const body = await response.json();

      if (!response.ok) {
        setFailure((body?.error as EnkaFailure) ?? 'server-error');
        return;
      }

      const next: CachedProfile = {
        uid: trimmed,
        data: body.data,
        fetchedAt: body.fetchedAt ?? Date.now(),
        ttlSeconds: body.ttl ?? 60,
      };

      await db.settings.put({ key: PROFILE_KEY, value: next, updatedAt: Date.now() });
      setProfile(next);
      setNow(Date.now());
    } catch {
      setFailure('network');
    } finally {
      setImporting(false);
    }
  }, []);

  const forget = useCallback(async () => {
    await db.settings.delete(PROFILE_KEY);
    setProfile(null);
    setFailure(null);
  }, []);

  return {
    profile,
    loaded,
    importing,
    failure,
    cooldownMs: profile ? msUntilRefresh(profile, now) : 0,
    age: profile ? describeAge(profile.fetchedAt, now) : null,
    importUid,
    forget,
  };
}
