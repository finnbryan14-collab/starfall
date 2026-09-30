import { expect, test, type Page } from '@playwright/test';

/**
 * What Starfall does on a device that will not let it store anything.
 *
 * Safari's private browsing has thrown on `indexedDB.open()`, "block all
 * cookies" covers site storage, and some managed devices switch it off. Every
 * screen reads Dexie on mount, so the rejections used to go unhandled and
 * /timers and /account/luck rendered *nothing at all* — a blank page with
 * nothing to read and nothing to try.
 *
 * Without storage the engine is untouched and every screen still computes. What
 * is lost is remembering, and that has to be said rather than discovered.
 */

const ROUTES = ['/plan', '/artifacts', '/timers', '/account', '/account/luck'];

/** Storage that refuses, the two ways browsers do it. */
const WAYS_TO_BLOCK = {
  'open() throws': () => {
    indexedDB.open = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
  },
  'indexedDB missing': () => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  },
};

async function block(page: Page, how: keyof typeof WAYS_TO_BLOCK) {
  await page.addInitScript(WAYS_TO_BLOCK[how]);
}

for (const how of Object.keys(WAYS_TO_BLOCK) as (keyof typeof WAYS_TO_BLOCK)[]) {
  test.describe(`storage blocked: ${how}`, () => {
    for (const route of ROUTES) {
      test(`${route} still renders`, async ({ page }) => {
        const crashes: string[] = [];
        page.on('pageerror', (error) => crashes.push(error.message));

        await block(page, how);
        await page.goto(route);

        // Something a player can actually read, not an empty panel.
        await expect(page.locator('main')).not.toBeEmpty();
        const text = await page.locator('main').innerText();
        expect(text.trim().length, `${route} rendered nothing`).toBeGreaterThan(100);

        expect(crashes, `${route} threw`).toEqual([]);
      });
    }

    test('says nothing will be saved', async ({ page }) => {
      await block(page, how);
      await page.goto('/plan');

      await expect(page.getByText(/blocking site storage/)).toBeVisible();
      // And says what still works, so it does not read as "this app is broken".
      await expect(page.getByText(/Everything still works/)).toBeVisible();
    });

    test('the planner still answers', async ({ page }) => {
      await block(page, how);
      await page.goto('/plan');

      // The engine is pure and the inputs are on screen, so the one thing the
      // app exists to do is unaffected.
      const primogems = page.getByRole('spinbutton', { name: 'Primogems' });
      await primogems.click();
      await primogems.fill('11200');
      await primogems.blur();

      await expect(page.locator('p[aria-hidden="true"] span').first()).not.toHaveText('0.0');
    });
  });
}

test('says nothing when storage works', async ({ page }) => {
  await page.goto('/plan');
  await expect(page.getByText(/blocking site storage/)).toHaveCount(0);
});
