import { expect, test, type Page } from '@playwright/test';

/**
 * Wish-history import, end to end with the gacha log intercepted.
 *
 * ROADMAP's condition is that a real import fills pity and guarantee on the
 * Plan tab and the authkey is not persisted anywhere. The second half is
 * checked directly here: after an import, no storage on the origin contains
 * the key.
 *
 * Every authkey below is fake.
 */

const AUTHKEY = 'FAKEAUTHKEYFORTESTSONLY000000';
const WISH_URL =
  'https://gs.hoyoverse.com/genshin/event/e20190909gacha-v3/index.html' +
  `?authkey_ver=1&sign_type=2&lang=en&authkey=${AUTHKEY}&region=os_usa&game_biz=hk4e_global`;

type Row = {
  id: string;
  gacha_type: string;
  rank_type: string;
  name: string;
  /** Server-local, with no zone — exactly how the real log reports it. */
  time: string;
};

/** Minutes back from a fixed past instant, so the log reads newest first. */
function logTime(minutesBack: number): string {
  const at = new Date(Date.UTC(2026, 8, 20, 17, 0, 0) - minutesBack * 60_000);
  return at.toISOString().slice(0, 19).replace('T', ' ');
}

/** Newest first, as the real API returns them. */
function buildLog(): Row[] {
  const rows: Row[] = [];
  let id = 2000;

  const push = (rank: string, name: string) => {
    rows.push({
      id: String(id--),
      gacha_type: '301',
      rank_type: rank,
      name,
      time: logTime(rows.length),
    });
  };

  // Reading newest to oldest: 22 filler, then Skirk (a win), then 70 filler,
  // then Qiqi (a loss). So pity is 22 and the next 5-star is a 50/50.
  for (let i = 0; i < 22; i++) push('3', 'Cool Steel');
  push('5', 'Skirk');
  for (let i = 0; i < 70; i++) push('3', 'Cool Steel');
  push('5', 'Qiqi');

  return rows;
}

/**
 * Serves the log a page at a time, honouring the end_id cursor, so the
 * client's paging is genuinely exercised rather than short-circuited.
 */
async function mockGachaLog(page: Page, rows: Row[] = buildLog()) {
  await page.route('**/api/wishes', async (route) => {
    const body = route.request().postDataJSON() as { gachaType: string; endId?: string };

    // Only the character banner has anything; the rest come back empty.
    if (body.gachaType !== '301') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ retcode: 0, data: { list: [] } }),
      });
      return;
    }

    const start =
      body.endId && body.endId !== '0' ? rows.findIndex((r) => r.id === body.endId) : -1;
    const page20 = rows.slice(start + 1, start + 21);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ retcode: 0, data: { list: page20 } }),
    });
  });
}

async function importFromPaste(page: Page) {
  await page.getByLabel('Wish history link').fill(WISH_URL);
  await page.getByRole('button', { name: 'Import wishes' }).click();
}

test.describe('Wish history import', () => {
  test('reads the whole history and derives pity and the guarantee', async ({ page }) => {
    await mockGachaLog(page);
    await page.goto('/account');
    await importFromPaste(page);

    // 94 pulls across the paged responses.
    await expect(page.getByText(/Imported 94 new pulls/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/22 pity/)).toBeVisible();
    await expect(page.getByText(/your next 5★ is/)).toContainText('a 50/50');
  });

  test('shows how it read the last 5★, so a wrong call is visible', async ({ page }) => {
    await mockGachaLog(page);
    await page.goto('/account');
    await importFromPaste(page);

    await expect(page.getByText(/Last 5★ was/)).toContainText('Skirk');
    // Chronologically: Qiqi is the first pull, then 70 filler, so Skirk
    // arrives on the 71st pull since the last 5-star.
    await expect(page.getByText(/Last 5★ was/)).toContainText('71 pity');
  });

  test('keeps guaranteed pulls out of the 50/50 record', async ({ page }) => {
    await mockGachaLog(page);
    await page.goto('/account');
    await importFromPaste(page);

    // Qiqi was a loss; Skirk was the guarantee being cashed in, not a flip.
    await expect(page.getByText(/won 0 of 1 real 50\/50s/)).toBeVisible();
    await expect(page.getByText(/weren.t coin flips/)).toBeVisible();
  });

  /** ROADMAP: the import fills pity and guarantee on the Plan tab. */
  test('carries pity through to the Plan screen', async ({ page }) => {
    await mockGachaLog(page);
    await page.goto('/account');
    await importFromPaste(page);
    await expect(page.getByText(/22 pity/)).toBeVisible({ timeout: 30_000 });

    await page.goto('/plan');
    await expect(page.getByRole('spinbutton', { name: 'Pity' })).toHaveValue('22');
    await expect(page.getByRole('radio', { name: '50/50' })).toBeChecked();
  });

  test('carries a guarantee through when the last 5★ was standard', async ({ page }) => {
    // Newest first: 5 filler, then Qiqi. A loss, so the next is guaranteed.
    const rows: Row[] = [];
    let id = 500;
    for (let i = 0; i < 5; i++) {
      rows.push({
        id: String(id--),
        gacha_type: '301',
        rank_type: '3',
        name: 'Cool Steel',
        time: logTime(rows.length),
      });
    }
    rows.push({
      id: String(id--),
      gacha_type: '301',
      rank_type: '5',
      name: 'Qiqi',
      time: logTime(rows.length),
    });

    await mockGachaLog(page, rows);
    await page.goto('/account');
    await importFromPaste(page);
    await expect(page.getByText(/5 pity/)).toBeVisible({ timeout: 30_000 });

    await page.goto('/plan');
    await expect(page.getByRole('radio', { name: 'Guaranteed' })).toBeChecked();
  });

  /** ROADMAP: the authkey is not persisted anywhere. */
  test('never stores the authkey', async ({ page }) => {
    await mockGachaLog(page);
    await page.goto('/account');
    await importFromPaste(page);
    await expect(page.getByText(/Imported 94 new pulls/)).toBeVisible({ timeout: 30_000 });

    const leaked = await page.evaluate(async (key) => {
      const found: string[] = [];

      for (const storage of [localStorage, sessionStorage]) {
        for (let i = 0; i < storage.length; i++) {
          const name = storage.key(i)!;
          if ((storage.getItem(name) ?? '').includes(key)) found.push(`${name} (web storage)`);
        }
      }

      // Every record in every IndexedDB store.
      for (const info of await indexedDB.databases()) {
        if (!info.name) continue;
        const db: IDBDatabase = await new Promise((resolve, reject) => {
          const request = indexedDB.open(info.name!);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        for (const store of Array.from(db.objectStoreNames)) {
          const rows: unknown[] = await new Promise((resolve) => {
            const request = db.transaction(store, 'readonly').objectStore(store).getAll();
            request.onsuccess = () => resolve(request.result as unknown[]);
            request.onerror = () => resolve([]);
          });
          if (JSON.stringify(rows).includes(key)) found.push(`${info.name}/${store}`);
        }
        db.close();
      }

      return found;
    }, AUTHKEY);

    expect(leaked, 'the authkey must not survive the import anywhere').toEqual([]);
  });

  test('says what to do when the link has expired', async ({ page }) => {
    await page.route('**/api/wishes', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ retcode: -101, message: 'authkey timeout' }),
      }),
    );

    await page.goto('/account');
    await importFromPaste(page);
    await expect(page.locator('main').getByRole('alert')).toContainText(/That link has expired/);
  });

  test('rejects a link that is not a wish URL without calling the proxy', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/wishes', async (route) => {
      calls++;
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ retcode: 0, data: { list: [] } }),
      });
    });

    await page.goto('/account');
    await page.getByLabel('Wish history link').fill('https://example.com/not-a-wish-link');
    await page.getByRole('button', { name: 'Import wishes' }).click();

    await expect(page.locator('main').getByRole('alert')).toContainText(
      /doesn.t look like a wish link/,
    );
    expect(calls, 'a disallowed host must never reach the proxy').toBe(0);
  });

  test('a second import adds nothing and says so', async ({ page }) => {
    await mockGachaLog(page);
    await page.goto('/account');
    await importFromPaste(page);
    await expect(page.getByText(/Imported 94 new pulls/)).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Import wishes' }).click();
    await expect(page.getByText('Already up to date.')).toBeVisible({ timeout: 30_000 });
  });

  /**
   * ROADMAP Phase 4, luck stats: pity at each 5★, the 50/50 record, and the
   * run measured against what the model expects.
   */
  test('shows how lucky the run actually was', async ({ page }) => {
    await mockGachaLog(page);
    await page.goto('/account');
    await importFromPaste(page);
    await expect(page.getByText(/Imported 94 new pulls/)).toBeVisible({ timeout: 30_000 });

    await page.getByRole('link', { name: /How lucky/i }).click();
    await expect(page).toHaveURL(/\/account\/luck$/);

    // Two 5★s in 72 counted pulls, against an expected 124.6. The exact
    // convolution puts that at the 93rd percentile.
    await expect(page.getByRole('heading', { name: 'Your luck' })).toBeVisible();
    await expect(page.getByText(/would still be waiting/)).toContainText('Lucky.');
    await expect(page.getByText(/would still be waiting/)).toContainText('2');

    const list = page.getByLabel('Every 5-star, newest last');
    await expect(list).toContainText('Qiqi');
    await expect(list).toContainText('Skirk');
    await expect(list).toContainText('71 pity');
    // Qiqi is standard, so that 5★ was a lost 50/50, and Skirk was the
    // guarantee being cashed in rather than a flip.
    await expect(list).toContainText('a lost 50/50');
    await expect(list).toContainText('Guaranteed, not a coin flip');
  });

  test('says there is nothing to judge before any history is imported', async ({ page }) => {
    await page.goto('/account/luck');
    await expect(page.getByText(/Nothing to judge yet/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your luck' })).toBeVisible();
  });
});
