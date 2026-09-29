import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { enterPreviewExample } from './helpers';

/**
 * Side-by-side comparison of each screen against design/preview.html.
 *
 * Reduced motion is forced for both. The preview plays its signature dial
 * animation on load, so without this the shot would catch it mid-flight and no
 * two runs would match. Reduced motion lands on the same end state, instantly.
 */

const OUT = path.join(process.cwd(), 'screenshots');
const PREVIEW_URL = pathToFileURL(path.join(process.cwd(), 'design', 'preview.html')).href;

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
] as const;

/** Each screen, and how to bring both sides to the same state. */
const SCREENS = [
  {
    name: 'plan',
    path: '/plan',
    previewTab: null as string | null,
    prepare: enterPreviewExample,
    heading: /Skirk/,
  },
  {
    name: 'artifacts',
    path: '/artifacts',
    previewTab: 'Artifacts' as string | null,
    // The screen already opens on the MATH.md example; just wait for the
    // worker to answer.
    prepare: async (page: Page) => {
      await page.getByText('Level it.').waitFor({ timeout: 20_000 });
    },
    heading: /Worth leveling/,
  },
];

test.use({ reducedMotion: 'reduce' });

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // The preview builds its chart and starfield in a module script after load.
  await page.waitForTimeout(600);
}

/**
 * Lays the two shots side by side, labelled, and screenshots that.
 *
 * The PNGs come back at 2x (deviceScaleFactor), so the images are pinned to the
 * logical viewport width explicitly and the figures are told not to flex. Left
 * to size themselves they overflow the composer viewport and wrap.
 */
async function compose(
  page: Page,
  appPng: Buffer,
  previewPng: Buffer,
  label: string,
  width: number,
) {
  const toSrc = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;
  const GAP = 24;
  const PAD = 24;

  await page.setViewportSize({ width: width * 2 + GAP + PAD * 2, height: 800 });
  await page.setContent(`
    <style>
      body { margin: 0; background: #0b0d22; color: #ece6d6;
             font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; padding: ${PAD}px; }
      .pair { display: flex; flex-wrap: nowrap; gap: ${GAP}px; align-items: flex-start;
              width: max-content; }
      figure { margin: 0; flex: 0 0 auto; width: ${width}px; }
      figcaption { padding-bottom: 8px; font-weight: 600; letter-spacing: .01em;
                   white-space: nowrap; }
      .sub { color: #8789c0; font-weight: 400; }
      img { display: block; width: ${width}px; height: auto;
            border: 1px solid #30357a; border-radius: 6px; }
    </style>
    <div class="pair">
      <figure>
        <figcaption>Starfall <span class="sub">${label}</span></figcaption>
        <img src="${toSrc(appPng)}">
      </figure>
      <figure>
        <figcaption>design/preview.html <span class="sub">${label}</span></figcaption>
        <img src="${toSrc(previewPng)}">
      </figure>
    </div>
  `);
  await page.evaluate(() =>
    Promise.all(Array.from(document.images).map((i) => (i.complete ? null : i.decode()))),
  );
  return page.locator('.pair').screenshot({ scale: 'css' });
}

for (const viewport of VIEWPORTS) {
  for (const screen of SCREENS) {
    test(`${screen.name} vs preview at ${viewport.name}`, async ({ browser }) => {
      await mkdir(OUT, { recursive: true });

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: 'reduce',
        deviceScaleFactor: 2,
      });

      const app = await context.newPage();
      await app.goto(screen.path);
      // The screens compute from their own inputs now, so both sides have to be
      // brought to the same example or the comparison means nothing.
      await screen.prepare(app);
      await settle(app);
      const appPng = await app.screenshot({
        path: path.join(OUT, `app-${screen.name}-${viewport.name}.png`),
      });

      const preview = await context.newPage();
      await preview.goto(PREVIEW_URL);
      if (screen.previewTab) {
        await preview.getByRole('button', { name: screen.previewTab }).click();
      }
      await settle(preview);
      const previewPng = await preview.screenshot({
        path: path.join(OUT, `preview-${screen.name}-${viewport.name}.png`),
      });

      await expect(app.getByRole('heading', { name: screen.heading })).toBeVisible();

      const composer = await context.newPage();
      const pairPng = await compose(composer, appPng, previewPng, viewport.name, viewport.width);
      await writeFile(path.join(OUT, `compare-${screen.name}-${viewport.name}.png`), pairPng);

      await context.close();

      const written = await readFile(path.join(OUT, `compare-${screen.name}-${viewport.name}.png`));
      expect(written.byteLength).toBeGreaterThan(1000);
    });
  }
}
