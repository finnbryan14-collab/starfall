import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

/**
 * Backups, end to end.
 *
 * ROADMAP's condition is export and import of every table as one JSON file.
 * The round trip below is the only test that proves it: export, destroy the
 * database, restore, and find the same pity on the Plan screen.
 *
 * Every authkey and cookie below is fake.
 */

const AUTHKEY = 'FAKEAUTHKEYFORTESTSONLY000000';
const WISH_URL =
  'https://gs.hoyoverse.com/genshin/event/e20190909gacha-v3/index.html' +
  `?authkey_ver=1&sign_type=2&lang=en&authkey=${AUTHKEY}&region=os_usa&game_biz=hk4e_global`;

const COOKIE =
  'ltoken_v2=FAKE_LTOKEN_SECRET; ltuid_v2=987654321; cookie_token_v2=FAKE_TOKEN_SECRET; ' +
  'account_mid_v2=FAKE_MID; account_id_v2=987654321';

/** Newest first: 22 filler, then a 5★. So pity comes out at 22. */
function log() {
  const rows = [];
  let id = 3000;
  for (let i = 0; i < 22; i++) {
    rows.push({
      id: String(id--),
      gacha_type: '301',
      rank_type: '3',
      name: 'Cool Steel',
      time: '2026-09-20 12:00:00',
    });
  }
  rows.push({
    id: String(id--),
    gacha_type: '301',
    rank_type: '5',
    name: 'Skirk',
    time: '2026-09-19 12:00:00',
  });
  return rows;
}

async function mockGachaLog(page: Page) {
  const rows = log();
  await page.route('**/api/wishes', async (route) => {
    const body = route.request().postDataJSON() as { gachaType: string; endId?: string };
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ retcode: 0, data: { list: rows.slice(start + 1, start + 21) } }),
    });
  });
}

async function importWishes(page: Page) {
  await page.getByLabel('Wish history link').fill(WISH_URL);
  await page.getByRole('button', { name: 'Import wishes' }).click();
  await expect(page.getByText(/Imported 23 new pulls/)).toBeVisible({ timeout: 30_000 });
}

/**
 * Waits until the page is hydrated and its effects have run.
 *
 * `goto` resolves on `load`, which is before React attaches handlers — setting
 * a file on the input then goes nowhere. The HoYoLAB field is only rendered
 * once the settings read has come back, so its presence means both have
 * happened.
 */
async function ready(page: Page) {
  await expect(
    page
      .getByLabel('HoYoLAB cookie')
      .or(page.getByRole('button', { name: 'Refresh wishes' }))
      .first(),
  ).toBeVisible();
}

/** Exports and returns the file's parsed contents. */
async function exportBackup(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export a backup' }).click(),
  ]);

  const path = await download.path();
  const text = await readFile(path, 'utf8');
  return { filename: download.suggestedFilename(), text, json: JSON.parse(text) };
}

/**
 * Empties every table, which is what a cleared browser leaves behind.
 *
 * Deliberately not `deleteDatabase`: the page holds an open Dexie connection,
 * so the delete is *blocked* and completes at some later moment — possibly
 * after the next navigation has already written fresh rows, which then vanish.
 * That is a race in the test, not a finding about the app. Clearing the stores
 * is deterministic and leaves the same thing behind: nothing.
 */
async function wipe(page: Page) {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('starfall');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const stores = Array.from(db.objectStoreNames);
    if (stores.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(stores, 'readwrite');
        for (const store of stores) transaction.objectStore(store).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }

    db.close();
  });
}

test.describe('Backups', () => {
  test('exports everything as one dated JSON file', async ({ page }) => {
    await mockGachaLog(page);
    await page.goto('/account');
    await ready(page);
    await importWishes(page);

    const backup = await exportBackup(page);

    expect(backup.filename).toMatch(/^starfall-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(backup.json.format).toBe('starfall-backup');
    expect(backup.json.tables.wishes).toHaveLength(23);
    // Every table is present, even the empty ones, so a restore is total.
    for (const table of [
      'plans',
      'profile',
      'characters',
      'artifacts',
      'wishes',
      'timers',
      'settings',
    ]) {
      expect(Array.isArray(backup.json.tables[table]), table).toBe(true);
    }
  });

  /**
   * The whole point of a backup: the device is gone and the file is all there
   * is. Anything short of this round trip only tests that a file was written.
   */
  test('survives the device losing everything', async ({ page }) => {
    await mockGachaLog(page);
    await page.goto('/account');
    await ready(page);
    await importWishes(page);

    await page.goto('/plan');
    await expect(page.getByRole('spinbutton', { name: 'Pity' })).toHaveValue('22');

    await page.goto('/account');
    await ready(page);
    const backup = await exportBackup(page);

    await wipe(page);
    await page.goto('/plan');
    await expect(page.getByRole('spinbutton', { name: 'Pity' })).toHaveValue('0');

    await page.goto('/account');
    await ready(page);
    await page.getByLabel('Backup file').setInputFiles({
      name: backup.filename,
      mimeType: 'application/json',
      buffer: Buffer.from(backup.text),
    });

    await expect(page.getByText(/Restoring replaces everything/)).toBeVisible();
    await page.getByRole('button', { name: 'Replace everything' }).click();
    await expect(page.getByText(/Restored .*23 wishes/)).toBeVisible();

    await page.goto('/plan');
    await expect(page.getByRole('spinbutton', { name: 'Pity' })).toHaveValue('22');
  });

  /**
   * A backup is a file people email themselves. The HoYoLAB cookie reads a
   * whole account, so it must never be in one.
   */
  test('never writes the HoYoLAB cookie into the file', async ({ page }) => {
    await page.goto('/account');
    await ready(page);
    await page.getByLabel('HoYoLAB cookie').fill(COOKIE);
    await page.getByRole('button', { name: 'Turn it on' }).click();
    await expect(page.getByText(/Starfall can refresh itself now/)).toBeVisible();

    const backup = await exportBackup(page);

    expect(backup.text).not.toContain('FAKE_LTOKEN_SECRET');
    expect(backup.text).not.toContain('FAKE_TOKEN_SECRET');
    expect(backup.text).not.toContain('hoyolab-cookie');
  });

  test('leaves the cookie alone when a backup is restored over it', async ({ page }) => {
    await page.goto('/account');
    await ready(page);
    const empty = await exportBackup(page);

    await page.getByLabel('HoYoLAB cookie').fill(COOKIE);
    await page.getByRole('button', { name: 'Turn it on' }).click();
    await expect(page.getByRole('button', { name: 'Refresh wishes' })).toBeVisible();

    await page.getByLabel('Backup file').setInputFiles({
      name: empty.filename,
      mimeType: 'application/json',
      buffer: Buffer.from(empty.text),
    });
    await page.getByRole('button', { name: 'Replace everything' }).click();
    await expect(page.getByText(/^Restored/)).toBeVisible();

    // The cookie is not in the file, so a restore must not sign the player out
    // of an opt-in they never touched.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Refresh wishes' })).toBeVisible();
  });

  test('refuses a file that is not a backup, and says which way it is wrong', async ({ page }) => {
    await page.goto('/account');
    await ready(page);

    await page.getByLabel('Backup file').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello":"world"}'),
    });
    await expect(page.locator('main').getByRole('alert')).toContainText(/not a Starfall backup/);

    await page.getByLabel('Backup file').setInputFiles({
      name: 'photo.json',
      mimeType: 'application/json',
      buffer: Buffer.from('this is not json'),
    });
    await expect(page.locator('main').getByRole('alert')).toContainText(/isn.t JSON/);
  });

  test('asks before it replaces anything', async ({ page }) => {
    await mockGachaLog(page);
    await page.goto('/account');
    await ready(page);
    await importWishes(page);
    const backup = await exportBackup(page);

    await wipe(page);
    await page.goto('/account');
    await ready(page);

    await page.getByLabel('Backup file').setInputFiles({
      name: backup.filename,
      mimeType: 'application/json',
      buffer: Buffer.from(backup.text),
    });

    // Cancelling must leave the device untouched.
    await expect(page.getByText(/23 wishes/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.goto('/plan');
    await expect(page.getByRole('spinbutton', { name: 'Pity' })).toHaveValue('0');
  });
});
