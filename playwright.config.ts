import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against a production build on its own port.
 *
 * The Next dev server compiles routes on demand, and under parallel workers
 * that turned into 30-second timeouts on inputs that were fine in isolation —
 * 13 of 16 tests failed that way. A built server is both stable and closer to
 * what ships. Port 3100 keeps it clear of a dev server on 3000.
 */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : [['html', { open: 'never' }]],
  use: { baseURL, trace: 'on-first-retry' },

  /*
    Ten seconds, not the default five.

    Every assertion here is about correctness, never about speed — there is a
    separate `pnpm perf` for that, deliberately run alone. At 280 tests across
    twelve workers, each driving a browser and an IndexedDB, five seconds
    started failing assertions that pass in isolation. A longer ceiling costs
    nothing on a green run and stops the suite reporting load as breakage.
  */
  expect: { timeout: 10_000 },

  // The two widths every UI task is checked at (CLAUDE.md, DESIGN.md).
  projects: [
    {
      name: 'mobile-390',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],

  webServer: {
    command: 'pnpm build:e2e && pnpm start:e2e',
    url: baseURL,
    // Never reuse: a stray dev server on this port would reintroduce exactly
    // the on-demand compilation this avoids.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
