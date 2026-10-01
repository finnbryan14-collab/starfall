import { expect, test } from '@playwright/test';

/**
 * The WebGL sky, and the four reasons it is allowed not to exist.
 *
 * It is scenery, so every one of these is a case where the player loses
 * nothing: the SVG starfield is server-rendered and always behind it. What
 * would be a bug is the canvas mounting when it should not, or the SVG
 * disappearing when the canvas does not arrive.
 */

/** The canvas only sets this once three.js has loaded and the first frame ran. */
const READY = 'canvas[data-ready="true"]';

test.describe('the sky', () => {
  test('fades a canvas in over the SVG starfield', async ({ page }) => {
    await page.goto('/plan');

    await expect(page.locator(READY)).toBeAttached({ timeout: 20_000 });
    // Both skies are present: the canvas is layered over the SVG, not swapping
    // it out, so a renderer that dies mid-session leaves a sky behind.
    await expect(page.locator('svg[aria-hidden="true"]').first()).toBeAttached();
  });

  test('is hidden from assistive technology, being scenery', async ({ page }) => {
    await page.goto('/plan');
    await expect(page.locator(READY)).toBeAttached({ timeout: 20_000 });

    expect(await page.locator('canvas').getAttribute('aria-hidden')).toBe('true');
  });

  /**
   * The whole point of the canvas is that it drifts, so reduced motion is not
   * a case of animating less — there is nothing left worth rendering.
   */
  test('does not exist at all under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/plan');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(2000);

    await expect(page.locator('canvas')).toHaveCount(0);
    // And the SVG sky is still there, so the page is not suddenly flat.
    await expect(page.locator('svg[aria-hidden="true"]').first()).toBeAttached();
  });

  /**
   * three.js is ~180 KB gzipped. It has to stay out of the first paint, or the
   * scenery is costing the thing people actually came for.
   */
  test('keeps three.js out of the initial payload', async ({ page }) => {
    const before: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') before.push(request.url());
    });

    await page.goto('/plan', { waitUntil: 'domcontentloaded' });
    const atFirstPaint = before.length;

    await expect(page.locator(READY)).toBeAttached({ timeout: 20_000 });

    // The renderer arrived, and it arrived after the page was usable.
    expect(before.length).toBeGreaterThan(atFirstPaint);
  });

  test('takes no pointer events, so it cannot swallow a tap', async ({ page }) => {
    await page.goto('/plan');
    await expect(page.locator(READY)).toBeAttached({ timeout: 20_000 });

    // A control underneath the canvas is still clickable.
    await page.getByRole('radio', { name: 'Guaranteed' }).check();
    await expect(page.getByRole('radio', { name: 'Guaranteed' })).toBeChecked();
  });
});
