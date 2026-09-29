import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';

/**
 * Lighthouse against a production build, on the mobile profile.
 *
 * ROADMAP Phase 5 sets the bar: performance >= 90, accessibility >= 95 on
 * mobile. This runs it locally so the bar is met before a deploy rather than
 * discovered after one.
 *
 * Chrome is launched through Playwright and handed to Lighthouse by port.
 * Lighthouse's own chrome-launcher writes a temp profile it then cannot always
 * remove on Windows, which fails the whole run during cleanup — after the
 * audit has already succeeded, so there is nothing useful to read.
 *
 * Run: pnpm lighthouse            (defaults to the four main routes)
 *      pnpm lighthouse /plan      (one route)
 */

const BASE = process.env.LIGHTHOUSE_URL ?? 'http://localhost:3101';
const DEFAULT_ROUTES = ['/plan', '/artifacts', '/timers', '/account'];

/** The two ROADMAP names, and two more worth not regressing. */
const THRESHOLDS: Record<string, number> = {
  performance: 90,
  accessibility: 95,
  'best-practices': 90,
  seo: 90,
};

const PORT = 9222;

type Category = { title: string; score: number | null };

async function audit(url: string, port: number) {
  const result = await lighthouse(url, {
    port,
    output: 'json',
    logLevel: 'error',
    // Lighthouse's own defaults are the mobile profile; named here so a change
    // in its defaults cannot quietly move the bar.
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 412,
      height: 823,
      deviceScaleFactor: 1.75,
      disabled: false,
    },
    throttlingMethod: 'simulate',
  });

  if (!result) throw new Error(`Lighthouse returned nothing for ${url}`);
  return result.lhr;
}

async function main() {
  const routes = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_ROUTES;

  const browser = await chromium.launch({
    args: [`--remote-debugging-port=${PORT}`, '--no-sandbox'],
  });

  let failures = 0;

  try {
    for (const route of routes) {
      const url = new URL(route, BASE).toString();
      const lhr = await audit(url, PORT);

      const scores = Object.entries(lhr.categories as Record<string, Category>).map(
        ([id, category]) => ({
          id,
          score: category.score === null ? null : Math.round(category.score * 100),
        }),
      );

      const line = scores
        .map(({ id, score }) => {
          const threshold = THRESHOLDS[id];
          const failed = score !== null && threshold !== undefined && score < threshold;
          if (failed) failures++;
          return `${id} ${score ?? 'n/a'}${failed ? ` (want >= ${threshold})` : ''}`;
        })
        .join('  ');

      console.log(`${route.padEnd(12)} ${line}`);

      // Only the audits that actually cost points, so the output stays useful.
      const worst = Object.values(lhr.audits)
        .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative')
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
        .slice(0, 5);

      for (const item of worst) {
        console.log(`             - ${item.id}: ${item.title}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (failures > 0) {
    console.error(`\n${failures} category/categories below the ROADMAP threshold.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
