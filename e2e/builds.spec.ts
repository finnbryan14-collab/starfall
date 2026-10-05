import { expect, test, type Page } from '@playwright/test';

import { setStepper, settledAnswer } from './helpers';

/**
 * The build optimiser, end to end.
 *
 * It is the first screen whose answer depends on every layer at once: the
 * scanner export, the generated base stats and growth curves, a talent file
 * fetched at runtime, the artifact main-stat table, set bonuses and the search
 * itself in a worker. Anything broken anywhere in that chain shows up here as
 * either no number or a wrong one — and a wrong damage figure looks exactly
 * like a right one, which is why this test checks the figure rather than only
 * that something rendered.
 */

function artifact(slotKey: string, mainStatKey: string, setKey: string, rolls = 1) {
  return {
    setKey,
    slotKey,
    level: 20,
    rarity: 5,
    mainStatKey,
    location: '',
    lock: false,
    substats: [
      { key: 'critRate_', value: 7.8 * rolls },
      { key: 'critDMG_', value: 21.8 * rolls },
      { key: 'atk_', value: 9.9 * rolls },
      { key: 'atk', value: 19 * rolls },
    ],
  };
}

/**
 * A bag with a real choice in it: two candidates per slot, all from one set.
 *
 * One set rather than two, deliberately. Whether a split build beats a 4-piece
 * depends on the exact rolls, and a test that depended on which way it went
 * would be asserting the search's arithmetic — which search.test.ts already
 * does against brute force. What this needs is a *guaranteed* 4-piece, so the
 * screen has an unmodelled bonus to show.
 */
function goodFile() {
  return JSON.stringify({
    format: 'GOOD',
    version: 2,
    source: 'Inventory Kamera',
    characters: [
      {
        key: 'HuTao',
        level: 90,
        ascension: 6,
        constellation: 0,
        talent: { auto: 10, skill: 10, burst: 10 },
      },
      {
        key: 'Bennett',
        level: 80,
        ascension: 6,
        constellation: 1,
        talent: { auto: 6, skill: 8, burst: 9 },
      },
    ],
    weapons: [
      { key: 'StaffOfHoma', level: 90, ascension: 6, refinement: 1, location: 'HuTao' },
      { key: 'FavoniusSword', level: 90, ascension: 6, refinement: 1, location: 'Bennett' },
    ],
    artifacts: [
      artifact('flower', 'hp', 'CrimsonWitchOfFlames'),
      artifact('plume', 'atk', 'CrimsonWitchOfFlames'),
      artifact('sands', 'atk_', 'CrimsonWitchOfFlames'),
      artifact('goblet', 'pyro_dmg_', 'CrimsonWitchOfFlames'),
      artifact('circlet', 'critDMG_', 'CrimsonWitchOfFlames'),
      // A second, weaker candidate in every slot, so there is something to
      // choose between and the answer is not forced.
      artifact('flower', 'hp', 'CrimsonWitchOfFlames', 0),
      artifact('plume', 'atk', 'CrimsonWitchOfFlames', 0),
      artifact('sands', 'eleMas', 'CrimsonWitchOfFlames', 0),
      artifact('goblet', 'hp_', 'CrimsonWitchOfFlames', 0),
      artifact('circlet', 'critRate_', 'CrimsonWitchOfFlames', 0),
    ],
  });
}

/** Hydration has happened once the HoYoLAB field is rendered. */
async function accountReady(page: Page) {
  await expect(page.getByLabel('HoYoLAB cookie')).toBeVisible();
}

async function importInventory(page: Page) {
  await page.goto('/account');
  await accountReady(page);

  await page.getByLabel('GOOD inventory file').setInputFiles({
    name: 'inventory.json',
    mimeType: 'application/json',
    buffer: Buffer.from(goodFile()),
  });
  await page.getByRole('button', { name: 'Replace my inventory' }).click();
  await expect(page.getByText(/Imported 10 artifacts/)).toBeVisible();
}

/**
 * The one big numeral, as a number, once it has stopped counting.
 *
 * It is aria-hidden display and it now counts to its value rather than
 * snapping, so reading it the instant it appears catches it partway up.
 */
async function readDamage(page: Page): Promise<number> {
  return Number((await settledAnswer(page)).replace(/,/g, ''));
}

/**
 * Waits until there is an answer at all.
 *
 * The screen is `aria-busy` until the talent file has been fetched and the
 * worker has answered, so this is the honest gate — but it is polled on the
 * numeral too, because a dash is what the screen shows before the first answer
 * and `Number('—')` is NaN, which compares equal to nothing and silently makes
 * every later assertion meaningless.
 */
async function settled(page: Page): Promise<number> {
  await expect(page.locator('section[aria-busy="false"]')).toBeVisible();
  await expect
    .poll(async () => Number.isFinite(await readDamage(page)), { timeout: 15_000 })
    .toBe(true);
  return readDamage(page);
}

/** Waits until the settled answer is no longer the one it was. */
async function expectDamageToChange(page: Page, previous: number): Promise<number> {
  // Polled rather than waited on `aria-busy`, because the search finishes in
  // tens of milliseconds and the busy flag can come and go between checks.
  // Each read settles first, so this cannot land on a value the numeral was
  // only passing through.
  await expect.poll(async () => readDamage(page), { timeout: 25_000 }).not.toBe(previous);
  return readDamage(page);
}

test.describe('build optimiser', () => {
  test.beforeEach(async ({ page }) => {
    await importInventory(page);
    await page.goto('/account/builds');
    await settled(page);
  });

  test('answers with a damage figure and says what it chose', async ({ page }) => {
    // Hu Tao is level 90 and sorts first, and her burst is the default hit.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Hu Tao');

    const damage = await readDamage(page);
    expect(Number.isFinite(damage)).toBe(true);
    // Loose on purpose: the exact figure is asserted in unit tests against the
    // wiki's own tables. What matters here is that the whole chain produced a
    // plausible number rather than zero, NaN or a dash.
    expect(damage).toBeGreaterThan(1000);
    expect(damage).toBeLessThan(10_000_000);

    // It has to say what the number is of, or it means nothing.
    await expect(page.getByText(/chosen from.*artifacts/)).toBeVisible();
    await expect(page.getByText(/Proven best/)).toBeVisible();

    // And show the five it picked.
    const pieces = page.getByRole('list', { name: 'The five artifacts it chose' });
    await expect(pieces.getByRole('listitem')).toHaveCount(5);
  });

  /**
   * The boundary, visible on the screen. A 4-piece set bonus is never applied
   * silently, so an active one has to appear with the game's own wording.
   */
  test('says which bonuses it is not applying', async ({ page }) => {
    const unmodelled = page.getByRole('list', { name: /not applying/ });
    await expect(unmodelled).toBeVisible();
    await expect(unmodelled).toContainText(/4-piece/);
    await expect(unmodelled).toContainText(/Depends on something Starfall cannot see/);
  });

  test('changes its answer when the hit changes', async ({ page }) => {
    const burst = await readDamage(page);

    // A normal attack at the same talent level is a different multiplier, so a
    // screen that showed the same number would be ignoring the choice.
    await page.getByLabel('Hit', { exact: true }).selectOption({ index: 0 });

    expect(await expectDamageToChange(page, burst)).toBeGreaterThan(0);
  });

  /**
   * Hu Tao is Pyro, so she can vaporise onto Hydro for 1.5 or melt onto Cryo
   * for 2.0 — and picking one has to raise the figure by roughly that much.
   */
  test('applies an amplifying reaction', async ({ page }) => {
    const plain = await readDamage(page);

    await page.getByRole('radio', { name: /Melt/ }).check();

    // Melt triggered by Pyro is a flat 2.0 coefficient, and this build has no
    // Elemental Mastery to raise it further.
    const melted = await expectDamageToChange(page, plain);
    expect(melted / plain).toBeGreaterThan(1.9);
    expect(melted / plain).toBeLessThan(2.1);
  });

  test('takes a team buff as a number rather than guessing one', async ({ page }) => {
    const plain = await readDamage(page);

    await page.getByText('Team buffs', { exact: true }).click();
    await setStepper(page, 'Flat ATK', 800);

    expect(await expectDamageToChange(page, plain)).toBeGreaterThan(plain);
  });

  test('says so when no build can meet an Energy Recharge floor', async ({ page }) => {
    await setStepper(page, 'Energy Recharge floor', 300);

    await expect(page.getByText(/Nothing meets that Energy Recharge floor/)).toBeVisible();
  });

  test('switches character without carrying the old answer over', async ({ page }) => {
    await page.getByLabel('Character', { exact: true }).selectOption('Bennett');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bennett');

    expect(await settled(page)).toBeGreaterThan(0);
  });

  test('tells someone with nothing imported what to do', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/account/builds');
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('starfall');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    });
    await page.reload();

    await expect(page.getByText(/Import inventory/)).toBeVisible();
  });
});
