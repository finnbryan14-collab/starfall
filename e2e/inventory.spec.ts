import { expect, test, type Page } from '@playwright/test';

/**
 * GOOD inventory import, end to end.
 *
 * ROADMAP's condition is Zod validation and a confirm step. The confirm step
 * is the point: an import replaces the bag, so the counts have to be shown and
 * agreed before anything is written.
 */

type Artifact = Record<string, unknown>;

function artifact(slotKey: string, mainStatKey: string, index: number): Artifact {
  return {
    setKey: 'BlizzardStrayer',
    slotKey,
    level: 20,
    rarity: 5,
    mainStatKey,
    location: index === 0 ? 'KamisatoAyaka' : '',
    lock: index % 2 === 0,
    substats: [
      { key: 'critRate_', value: 7.8 },
      { key: 'critDMG_', value: 21.8 },
      { key: 'eleMas', value: 40 },
      { key: '', value: 0 },
    ],
  };
}

function goodFile(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: 'GOOD',
    version: 2,
    source: 'Inventory Kamera',
    characters: [
      { key: 'KamisatoAyaka', level: 90, constellation: 1 },
      { key: 'Nahida', level: 90, constellation: 0 },
    ],
    weapons: [{ key: 'MistsplitterReforged', level: 90, refinement: 1 }],
    artifacts: [
      artifact('flower', 'hp', 0),
      artifact('plume', 'atk', 1),
      artifact('sands', 'atk_', 2),
      artifact('goblet', 'cryo_dmg_', 3),
      artifact('circlet', 'critRate_', 4),
    ],
    ...overrides,
  });
}

async function choose(page: Page, body: string, name = 'inventory.json') {
  await page.getByLabel('GOOD inventory file').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(body),
  });
}

/**
 * Waits until the page is hydrated and its effects have run.
 *
 * `goto` resolves on `load`, which is before React attaches handlers — setting
 * a file on the input then goes nowhere, and the confirm step never appears.
 * The HoYoLAB field is only rendered once the settings read has come back, so
 * its presence means both have happened.
 */
async function ready(page: Page) {
  await expect(page.getByLabel('HoYoLAB cookie')).toBeVisible();
}

/** How many artifact rows are actually in the database. */
async function storedCount(page: Page) {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('starfall');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count: number = await new Promise((resolve) => {
      const request = db.transaction('artifacts', 'readonly').objectStore('artifacts').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(-1);
    });
    db.close();
    return count;
  });
}

test.describe('GOOD inventory import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/account');
    await ready(page);
  });

  test('shows what it found before it writes anything', async ({ page }) => {
    await choose(page, goodFile());

    await expect(page.getByText(/5 artifacts, 2 characters, 1 weapon/)).toBeVisible();
    // Named exactly, not matched loosely: the panel's own copy mentions the
    // scanner too, and this is about what the file said it was.
    await expect(page.getByText('Inventory Kamera', { exact: true })).toBeVisible();
    // Nothing is stored until it is agreed to.
    expect(await storedCount(page)).toBe(0);

    await page.getByRole('button', { name: 'Replace my inventory' }).click();
    await expect(page.getByText(/Imported 5 artifacts/)).toBeVisible();
    expect(await storedCount(page)).toBe(5);
  });

  test('breaks the count down by slot, so a missed slot is visible', async ({ page }) => {
    await choose(page, goodFile());

    // A scan that missed every circlet is a common failure of these tools, and
    // a single total would hide it.
    for (const slot of ['Flower', 'Plume', 'Sands', 'Goblet', 'Circlet']) {
      await expect(page.getByText(slot, { exact: true })).toBeVisible();
    }
  });

  test('replaces the previous inventory rather than adding to it', async ({ page }) => {
    await choose(page, goodFile());
    await page.getByRole('button', { name: 'Replace my inventory' }).click();
    await expect(page.getByText(/Imported 5 artifacts/)).toBeVisible();

    await choose(page, goodFile({ artifacts: [artifact('flower', 'hp', 0)] }));
    await page.getByRole('button', { name: 'Replace my inventory' }).click();
    await expect(page.getByText(/Imported 1 artifact/)).toBeVisible();

    // A scan is a photograph of the bag, not an addition to it.
    expect(await storedCount(page)).toBe(1);
  });

  test('survives a reload and says what is already stored', async ({ page }) => {
    await choose(page, goodFile());
    await page.getByRole('button', { name: 'Replace my inventory' }).click();
    await expect(page.getByText(/Imported 5 artifacts/)).toBeVisible();

    await page.reload();
    await expect(page.getByText(/5 artifacts stored/)).toBeVisible();
  });

  test('cancelling leaves the bag untouched', async ({ page }) => {
    await choose(page, goodFile());
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('button', { name: 'Replace my inventory' })).toHaveCount(0);
    expect(await storedCount(page)).toBe(0);
  });

  test('says which way a file is wrong', async ({ page }) => {
    await choose(page, 'this is not json');
    await expect(page.locator('main').getByRole('alert')).toContainText(/isn.t JSON/);

    await choose(page, '{"hello":"world"}');
    await expect(page.locator('main').getByRole('alert')).toContainText(/not a GOOD export/);

    await choose(page, goodFile({ version: 99 }));
    await expect(page.locator('main').getByRole('alert')).toContainText(/newer GOOD version/);

    await choose(page, goodFile({ artifacts: [{ setKey: 'BlizzardStrayer' }] }));
    await expect(page.locator('main').getByRole('alert')).toContainText(/damaged/);

    expect(await storedCount(page)).toBe(0);
  });

  test('says how many artifacts it could not read', async ({ page }) => {
    await choose(
      page,
      goodFile({
        artifacts: [
          artifact('flower', 'hp', 0),
          { ...artifact('goblet', 'hp', 1), mainStatKey: 'sandwich_dmg_' },
        ],
      }),
    );

    // Swallowing these would lose artifacts silently; the count is the only
    // way anybody would notice a scanner misreading main stats.
    await expect(page.getByText(/1 artifact was skipped/)).toBeVisible();
    await page.getByRole('button', { name: 'Replace my inventory' }).click();
    expect(await storedCount(page)).toBe(1);
  });

  test('goes into a backup and comes back out', async ({ page }) => {
    await choose(page, goodFile());
    await page.getByRole('button', { name: 'Replace my inventory' }).click();
    await expect(page.getByText(/Imported 5 artifacts/)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export a backup' }).click(),
    ]);

    const backup = JSON.parse(
      await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'),
    ) as { tables: { artifacts: unknown[] } };

    expect(backup.tables.artifacts).toHaveLength(5);
  });
});
