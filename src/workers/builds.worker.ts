import * as Comlink from 'comlink';

import { searchBuilds, type Search, type SearchInput } from '@/engine/damage/search';

/**
 * The build search, off the main thread.
 *
 * It visits one to eighteen million nodes on a 400-artifact bag — 68ms to 1.2s
 * of straight-line arithmetic, and up to 7s on a bag twice that size. Inline
 * that would freeze the tab outright, not merely drop frames.
 *
 * MATH.md section 9 has the measurements.
 */

const api = {
  search(input: SearchInput): Search {
    return searchBuilds(input);
  },
};

export type BuildsWorkerApi = typeof api;

Comlink.expose(api);
