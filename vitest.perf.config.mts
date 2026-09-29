import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Performance budget run: perf.test.ts only, on its own.
 *
 * The absolute timings in that file measure whether the engine can meet SPEC's
 * 50ms input-change budget. Run inside the full suite they instead measure
 * contention between worker threads, and failed about half the time on a
 * machine where the isolated figure was 26ms. `PERF` switches those assertions
 * on; `fileParallelism: false` keeps this run alone.
 *
 * Deliberately standalone rather than merged with vitest.config.mts, because
 * mergeConfig concatenates `include` instead of replacing it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/engine/wish/perf.test.ts'],
    env: { PERF: '1' },
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
});
