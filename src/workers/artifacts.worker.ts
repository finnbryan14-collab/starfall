import * as Comlink from 'comlink';

import {
  resinEstimate,
  type ResinEstimate,
  type ResinEstimateInput,
} from '@/engine/artifacts/resin';
import {
  histogram,
  keepOrTrash,
  type Histogram,
  type KeepOrTrashInput,
  type KeepOrTrashResult,
} from '@/engine/artifacts/score';

/**
 * The artifact simulations, off the main thread.
 *
 * keepOrTrash runs 20,000 upgrade paths and the resin estimate another 40,000.
 * That is tens of milliseconds of straight-line arithmetic — enough to drop
 * frames and make a stepper feel stuck if it ran inline (MATH.md asks for a
 * worker for exactly this reason).
 */

export type ScoreResponse = {
  result: Omit<KeepOrTrashResult, 'scores'> & { scores: Float64Array };
  histogram: Histogram;
};

const api = {
  /** Scores a piece and bins the outcome in one round trip. */
  score(input: KeepOrTrashInput): ScoreResponse {
    const result = keepOrTrash(input);
    return { result, histogram: histogram(result.scores, result.goal) };
  },

  resin(input: ResinEstimateInput): ResinEstimate {
    return resinEstimate(input);
  },
};

export type ArtifactsWorkerApi = typeof api;

Comlink.expose(api);
