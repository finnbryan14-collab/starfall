'use client';

import * as Comlink from 'comlink';
import { useEffect, useRef, useState } from 'react';

import type { ResinEstimate, ResinEstimateInput } from '@/engine/artifacts/resin';
import type { KeepOrTrashInput } from '@/engine/artifacts/score';

import type { ArtifactsWorkerApi, ScoreResponse } from './artifacts.worker';

/**
 * Runs the artifact simulations in a worker and hands back the latest result.
 *
 * Requests are serialised by a monotonic id: a slow run that finishes after a
 * newer one started is dropped rather than overwriting it. Without that, typing
 * quickly in a substat field can leave the screen showing the answer to an
 * input you already replaced.
 *
 * `pending` is derived from whether the stored answer belongs to the current
 * input, rather than being set at the top of the effect. Setting it there would
 * force an extra render on every input change for no benefit.
 */

type Answer = {
  /** The input this answer belongs to. */
  key: string;
  score: ScoreResponse;
  resin: ResinEstimate | null;
};

export type ArtifactsState = {
  score: ScoreResponse | null;
  resin: ResinEstimate | null;
  /** True while the shown answer does not yet match the current input. */
  pending: boolean;
  /** Set when the worker could not produce an answer. */
  error: Error | null;
};

export function useArtifacts(
  scoreInput: KeepOrTrashInput,
  resinInput: ResinEstimateInput | null,
): ArtifactsState {
  const apiRef = useRef<Comlink.Remote<ArtifactsWorkerApi> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);

  // Owned for the component's lifetime; started lazily by the run below so
  // there is no render just to record that it exists.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      apiRef.current = null;
    };
  }, []);

  const key = JSON.stringify({ scoreInput, resinInput });

  useEffect(() => {
    if (!workerRef.current) {
      //  is required: the bundler emits an ESM worker, and a
      // classic worker silently never runs it — no error, just a call that
      // never resolves.
      workerRef.current = new Worker(new URL('./artifacts.worker.ts', import.meta.url), {
        type: 'module',
      });
      apiRef.current = Comlink.wrap<ArtifactsWorkerApi>(workerRef.current);
    }
    const api = apiRef.current;
    if (!api) return;

    const id = ++requestId.current;
    let cancelled = false;

    void (async () => {
      try {
        const [score, resin] = await Promise.all([
          api.score(scoreInput),
          resinInput ? api.resin(resinInput) : Promise.resolve(null),
        ]);
        // A newer request started while this one ran: its answer wins.
        if (cancelled || id !== requestId.current) return;
        setAnswer({ key, score, resin });
      } catch (error) {
        // Keep the previous answer on screen rather than blanking it, but do
        // not swallow the reason: a worker that fails silently looks exactly
        // like one that is merely slow.
        if (cancelled || id !== requestId.current) return;
        setFailure(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return () => {
      cancelled = true;
    };
    // The inputs are fresh objects every render, so they are compared by value
    // through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    score: answer?.score ?? null,
    resin: answer?.resin ?? null,
    pending: answer?.key !== key && !failure,
    error: failure,
  };
}
