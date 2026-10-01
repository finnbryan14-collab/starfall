'use client';

import * as Comlink from 'comlink';
import { useEffect, useRef, useState } from 'react';

import type { Search, SearchInput } from '@/engine/damage/search';

import type { BuildsWorkerApi } from './builds.worker';

/**
 * Runs the build search in a worker and hands back the latest result.
 *
 * Same shape as useArtifacts, and for the same reason: requests are serialised
 * by a monotonic id so a slow run finishing after a newer one started is
 * dropped rather than overwriting it. It matters more here, because a search
 * can take a second — long enough to change the enemy level twice while the
 * first answer is still being computed.
 *
 * The previous answer stays on screen while a new one runs. A blank where a
 * number was reads as breakage, and the old number is still true of the inputs
 * it was computed from — `pending` is what says it is now stale.
 */

type Answer = { key: string; search: Search };

export type BuildSearchState = {
  search: Search | null;
  /** True while the shown answer does not yet match the current input. */
  pending: boolean;
  error: Error | null;
};

export function useBuildSearch(input: SearchInput | null): BuildSearchState {
  const apiRef = useRef<Comlink.Remote<BuildsWorkerApi> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      apiRef.current = null;
    };
  }, []);

  const key = input ? JSON.stringify(input) : null;

  useEffect(() => {
    if (!input || !key) return;

    if (!workerRef.current) {
      // `type: 'module'` is required: the bundler emits an ESM worker, and a
      // classic worker silently never runs it.
      workerRef.current = new Worker(new URL('./builds.worker.ts', import.meta.url), {
        type: 'module',
      });
      apiRef.current = Comlink.wrap<BuildsWorkerApi>(workerRef.current);
    }
    const api = apiRef.current;
    if (!api) return;

    const id = ++requestId.current;
    let cancelled = false;

    void (async () => {
      try {
        const search = await api.search(input);
        if (cancelled || id !== requestId.current) return;
        setFailure(null);
        setAnswer({ key, search });
      } catch (error) {
        if (cancelled || id !== requestId.current) return;
        setFailure(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return () => {
      cancelled = true;
    };
    // The input is a fresh object every render, so it is compared by value
    // through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    search: answer?.search ?? null,
    pending: key !== null && answer?.key !== key && !failure,
    error: failure,
  };
}
