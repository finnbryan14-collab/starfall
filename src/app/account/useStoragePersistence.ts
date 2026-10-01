'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  isStandalone,
  persistenceAdvice,
  readPersistence,
  requestPersistence,
  storageUsage,
  type PersistenceAdvice,
  type PersistenceState,
} from '@/lib/persistence';

/**
 * Where the browser stands on keeping Starfall's data, and a way to ask.
 *
 * `ask` is the loud path: it can raise Firefox's permission popup, so it is
 * wired to a button rather than to a mount. The quiet request has already run
 * by the time anyone reads this — see src/components/PersistentStorage.tsx.
 */

export type StoragePersistence = {
  state: PersistenceState;
  advice: PersistenceAdvice;
  /** Bytes stored and allowed, when the browser will say. */
  usage: { usage: number; quota: number } | null;
  /** True until the first read comes back. */
  loading: boolean;
  ask: () => Promise<void>;
};

export function useStoragePersistence(): StoragePersistence {
  const [state, setState] = useState<PersistenceState>({ kind: 'unsupported' });
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([readPersistence(), storageUsage()]).then(([current, estimate]) => {
      if (cancelled) return;
      setState(current);
      setUsage(estimate);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const ask = useCallback(async () => {
    const next = await requestPersistence();
    setState(next);
    setAsked(true);
  }, []);

  return {
    state,
    usage,
    loading,
    ask,
    advice: persistenceAdvice({ state, standalone: isStandalone(), asked }),
  };
}
