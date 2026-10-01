import { expect, test } from '@playwright/test';

/**
 * Layout rules that hold on every screen.
 *
 * DESIGN.md: the app is a phone-first reading column and must never scroll
 * sideways. That regressed silently — an `sr-only` table widened /plan to 531px
 * at a 390px viewport, because a table ignores a width below its own
 * min-content width. Nothing else would have caught it: it is invisible, and it
 * does not fail a screenshot until someone happens to scroll.
 */

const ROUTES = [
  '/plan',
  '/artifacts',
  '/timers',
  '/account',
  '/account/luck',
  '/account/roster',
  '/account/builds',
];

for (const route of ROUTES) {
  test(`${route} never scrolls sideways`, async ({ page }) => {
    await page.goto(route);
    // Let the charts draw and the stored state land; both add content.
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(1_000);

    const { scrollWidth, clientWidth, widest } = await page.evaluate(() => {
      const root = document.scrollingElement!;
      const widest: string[] = [];

      for (const node of document.querySelectorAll('body *')) {
        const box = node.getBoundingClientRect();
        // The starfield is deliberately larger than the viewport and clipped.
        if (node.closest('svg[aria-hidden="true"]')) continue;
        if (box.right > root.clientWidth + 1) {
          widest.push(`${node.tagName}.${String((node as HTMLElement).className).split(' ')[0]}`);
        }
      }

      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, widest };
    });

    expect(scrollWidth, `widened by: ${widest.slice(0, 5).join(', ')}`).toBeLessThanOrEqual(
      clientWidth,
    );
  });
}
