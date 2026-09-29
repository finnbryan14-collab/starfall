import { expect, test, type Page } from '@playwright/test';

import { enterPreviewExample, readAnswer, setStepper } from './helpers';

/**
 * The Fate Dial: the app's one orchestrated moment (DESIGN.md).
 *
 * ROADMAP's condition for this task is that an input change replays the
 * animation once, and that reduced motion shows the end state instantly.
 */

const goldPath = (page: Page) => page.locator('svg path[data-mine]');
const meteor = (page: Page) => page.locator('svg g[data-meteor]');

/**
 * How much of the gold path is drawn, 0 to 1.
 *
 * createDrawable animates `stroke-dasharray` — the first value is the visible
 * run, the second the gap. It leaves `stroke-dashoffset` at 0 throughout, so
 * watching the offset shows nothing.
 */
const drawnFraction = (page: Page) =>
  goldPath(page).evaluate((el) => {
    const path = el as unknown as SVGPathElement;
    const dashArray = getComputedStyle(el).strokeDasharray;
    // No dash pattern at all means the path is simply drawn in full.
    if (!dashArray || dashArray === 'none') return 1;
    const drawn = Number.parseFloat(dashArray);
    const total = path.getTotalLength();
    return total > 0 ? drawn / total : 1;
  });

test.describe('Fate Dial with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('draws the curve and lands the meteor on it', async ({ page }) => {
    await page.goto('/plan');
    await enterPreviewExample(page);

    await expect(goldPath(page)).toBeVisible();
    // The path has real geometry, not a stub.
    const length = await goldPath(page).evaluate((el) => (el as SVGPathElement).getTotalLength());
    expect(length).toBeGreaterThan(50);

    // The meteor ends up on the curve's end point, within a pixel.
    await expect
      .poll(
        async () => {
          const [end, marker] = await Promise.all([
            goldPath(page).evaluate((el) => {
              const p = el as SVGPathElement;
              const pt = p.getPointAtLength(p.getTotalLength());
              return { x: pt.x, y: pt.y };
            }),
            meteor(page).evaluate((el) => {
              const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(
                getComputedStyle(el).transform === 'none'
                  ? (el as SVGGElement).style.transform
                  : (el as SVGGElement).style.transform,
              );
              return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
            }),
          ]);
          if (!marker) return null;
          return Math.hypot(end.x - marker.x, end.y - marker.y) < 1.5;
        },
        { timeout: 6000 },
      )
      .toBe(true);
  });

  test('replays the draw when an input changes', async ({ page }) => {
    await page.goto('/plan');
    await enterPreviewExample(page);

    // Once settled the path is drawn in full.
    await expect.poll(() => drawnFraction(page), { timeout: 6000 }).toBeGreaterThan(0.99);

    // Change an input, then catch the redraw partway through.
    await setStepper(page, 'Primogems', 30_000);
    await expect
      .poll(() => drawnFraction(page), {
        timeout: 2500,
        intervals: [16, 16, 16, 16, 32, 32, 64],
      })
      .toBeLessThan(0.9);

    // And it finishes.
    await expect.poll(() => drawnFraction(page), { timeout: 6000 }).toBeGreaterThan(0.99);
  });

  test('counts the numeral rather than snapping it', async ({ page }) => {
    await page.goto('/plan');
    await enterPreviewExample(page);
    await expect.poll(() => readAnswer(page)).toBe('72.9');

    await setStepper(page, 'Primogems', 40_000);
    // Partway through, the numeral is between the old and new values.
    await page.waitForTimeout(300);
    const middle = Number(await readAnswer(page));
    expect(middle).toBeGreaterThan(72.9);
    expect(middle).toBeLessThan(100);
  });

  test('exposes the curve as text for screen readers', async ({ page }) => {
    await page.goto('/plan');
    await enterPreviewExample(page);

    const chart = page.getByRole('img', { name: /Chance of getting/ });
    await expect(chart).toHaveAttribute('aria-label', /108 pulls the chance is 72\.9 percent/);

    // A hidden table carries the data at 10-pull steps (DESIGN.md).
    const table = page.locator('table');
    await expect(table.locator('tbody tr').first()).toContainText('0');
    expect(await table.locator('tbody tr').count()).toBeGreaterThan(10);
  });
});

test.describe('Fate Dial with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows the end state instantly, with no dash pattern', async ({ page }) => {
    await page.goto('/plan');
    await enterPreviewExample(page);

    // No polling: under reduced motion the end state is written synchronously.
    expect(await drawnFraction(page)).toBeGreaterThan(0.99);
    expect(await readAnswer(page)).toBe('72.9');
  });

  test('still moves the meteor when an input changes', async ({ page }) => {
    await page.goto('/plan');
    await enterPreviewExample(page);

    const before = await meteor(page).evaluate((el) => (el as SVGGElement).style.transform);
    await setStepper(page, 'Primogems', 30_000);
    await expect
      .poll(() => meteor(page).evaluate((el) => (el as SVGGElement).style.transform))
      .not.toBe(before);
  });
});
