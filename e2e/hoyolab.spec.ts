import { expect, test, type Page } from '@playwright/test';

/**
 * The HoYoLAB opt-in, end to end with the proxy intercepted.
 *
 * ROADMAP's condition is that declining it costs nothing that works today, so
 * the first test here is that the screen is fully usable with it switched off.
 *
 * Every cookie value below is fake.
 */

const UID = '618285856';

/** A realistic paste: what we need, buried in what we do not. */
const PASTED_COOKIE =
  '_ga=GA1.1.0000; ltoken_v2=FAKE_LTOKEN_VALUE; mi18nLang=en-us; ltuid_v2=987654321; ' +
  'cookie_token_v2=FAKE_COOKIE_TOKEN; account_mid_v2=FAKE_MID; account_id_v2=987654321; ' +
  'DEVICEFP=deadbeefcafe';

const enkaFixture = {
  data: {
    playerInfo: { nickname: 'Traveler', level: 57 },
    avatarInfoList: [{ avatarId: 10000002, propMap: { '4001': { val: '90' } } }],
  },
  ttl: 60,
  fetchedAt: Date.now(),
  cached: false,
};

const notesFixture = {
  current_resin: 137,
  max_resin: 200,
  resin_recovery_time: '30240',
  current_home_coin: 1_800,
  max_home_coin: 2_400,
  home_coin_recovery_time: '21600',
  finished_task_num: 4,
  total_task_num: 4,
  is_extra_task_reward_received: true,
  remain_resin_discount_num: 1,
  resin_discount_num_limit: 3,
  transformer: { obtained: true, recovery_time: { Day: 0, Hour: 2, Minute: 0, Second: 0 } },
  expeditions: [],
  max_expedition_num: 5,
};

const diaryFixture = {
  data_month: 9,
  month_data: {
    current_primogems: 4_320,
    last_primogems: 3_900,
    primogem_rate: 10,
    group_by: [
      { action_id: 1, action: 'Events', num: 2_400, percent: 56 },
      { action_id: 2, action: 'Daily Activity', num: 1_920, percent: 44 },
    ],
  },
};

async function setUp(page: Page) {
  await page.route('https://enka.network/ui/**', (route) => route.abort());
  await page.route('**/api/enka/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(enkaFixture),
    }),
  );
}

/** Answers each action, and records what the proxy was asked for. */
async function mockHoyolab(page: Page, overrides: Record<string, unknown> = {}) {
  const calls: { action: string; cookie: string }[] = [];

  await page.route('**/api/hoyolab', async (route) => {
    const body = route.request().postDataJSON() as { action: string; cookie: string };
    calls.push({ action: body.action, cookie: body.cookie });

    if (body.action in overrides) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overrides[body.action]),
      });
      return;
    }

    const data =
      body.action === 'notes'
        ? notesFixture
        : body.action === 'diary'
          ? diaryFixture
          : { authkey: 'FAKEMINTEDAUTHKEY000' };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ retcode: 0, data }),
    });
  });

  return calls;
}

/** Every gacha page comes back empty; this is about the link, not the pulls. */
async function mockEmptyGachaLog(page: Page) {
  await page.route('**/api/wishes', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ retcode: 0, data: { list: [] } }),
    }),
  );
}

async function importUid(page: Page) {
  await page.getByLabel(/UID/i).first().fill(UID);
  await page.getByRole('button', { name: 'Import characters' }).click();
  await expect(page.getByText('Kamisato Ayaka')).toBeVisible();
}

async function turnOn(page: Page) {
  await page.getByLabel('HoYoLAB cookie').fill(PASTED_COOKIE);
  await page.getByRole('button', { name: 'Turn it on' }).click();
  await expect(page.getByText(/Starfall can refresh itself now/)).toBeVisible();
}

test.describe('HoYoLAB opt-in', () => {
  test.beforeEach(async ({ page }) => {
    await setUp(page);
  });

  /** ROADMAP: declining it costs nothing that works today. */
  test('is off by default and nothing else needs it', async ({ page }) => {
    const calls = await mockHoyolab(page);
    await page.goto('/account');

    // Off means off: no request is made, and the actions are not even shown.
    await expect(page.getByRole('button', { name: 'Refresh wishes' })).toHaveCount(0);
    await expect(page.getByLabel('HoYoLAB cookie')).toBeVisible();

    await importUid(page);
    await expect(page.getByRole('button', { name: 'Import wishes' })).toBeVisible();
    expect(calls, 'nothing may call HoYoLAB before the player opts in').toEqual([]);
  });

  test('says what it costs before it asks for anything', async ({ page }) => {
    await page.goto('/account');
    // Scoped to the disclosure: the Backups panel warns about the same cookie,
    // and this is about what the opt-in itself says before it is taken.
    const disclosure = page.getByRole('group').filter({ hasText: 'What it does' });
    await disclosure.click();

    await expect(disclosure.getByText(/reads your whole account/)).toBeVisible();
    await expect(disclosure.getByText(/not true to say it never leaves your device/)).toBeVisible();
  });

  /**
   * The strong version of the privacy claim: after opting in, storage holds the
   * cookies these three endpoints use and nothing else from the paste.
   */
  test('stores only the cookies it uses', async ({ page }) => {
    await mockHoyolab(page);
    await page.goto('/account');
    await turnOn(page);

    const stored = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const request = indexedDB.open('starfall');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows: { key: string; value: unknown }[] = await new Promise((resolve) => {
        const request = db.transaction('settings', 'readonly').objectStore('settings').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve([]);
      });
      db.close();
      return rows.find((row) => row.key === 'hoyolab-cookie')?.value as string | undefined;
    });

    expect(stored).toContain('ltoken_v2=FAKE_LTOKEN_VALUE');
    expect(stored).toContain('cookie_token_v2=FAKE_COOKIE_TOKEN');
    expect(stored, 'analytics cookies must never be stored').not.toContain('_ga');
    expect(stored).not.toContain('DEVICEFP');
    expect(stored).not.toContain('mi18nLang');
  });

  test('reads live resin and writes it into the timers', async ({ page }) => {
    await mockHoyolab(page);
    await page.goto('/account');
    await importUid(page);
    await turnOn(page);

    await page.getByRole('button', { name: 'Refresh timers' }).click();
    await expect(page.getByText(/137 resin, straight from the game/)).toBeVisible();

    await page.goto('/timers');
    await expect(page.getByRole('spinbutton', { name: 'Resin' })).toHaveValue('137');
    // Two hours left on the transformer, not a fresh 166 — the countdown was
    // run backwards into when it was used. A second or two elapses between the
    // write and this read, so the minutes are not asserted exactly.
    await expect(page.getByText(/Ready in 1 h 59 min|Ready in 2 h 0 min/)).toBeVisible();
  });

  test('refreshes wish history with no link to paste', async ({ page }) => {
    const calls = await mockHoyolab(page);
    await mockEmptyGachaLog(page);

    await page.goto('/account');
    await importUid(page);
    await turnOn(page);

    await page.getByRole('button', { name: 'Refresh wishes' }).click();
    await expect(page.getByText(/No link to paste/)).toBeVisible({ timeout: 30_000 });

    expect(calls.map((call) => call.action)).toContain('authkey');
    // The filtered cookie, not the paste.
    expect(calls[0].cookie).not.toContain('_ga');
  });

  test('reads the Traveler’s Diary and shows income by source', async ({ page }) => {
    await mockHoyolab(page);
    await page.goto('/account');
    await importUid(page);
    await turnOn(page);

    await page.getByRole('button', { name: 'Read my diary' }).click();
    await expect(page.getByText(/4,320.*primogems this month/)).toBeVisible();
    await expect(page.getByText('Events')).toBeVisible();
    await expect(page.getByText('2,400')).toBeVisible();
  });

  test('says what to do when the cookie has expired', async ({ page }) => {
    await mockHoyolab(page, { notes: { retcode: -100, message: 'not logged in' } });
    await page.goto('/account');
    await importUid(page);
    await turnOn(page);

    await page.getByRole('button', { name: 'Refresh timers' }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(/Sign in to HoYoLAB again/);
  });

  test('names the Real-Time Notes switch rather than blaming the cookie', async ({ page }) => {
    await mockHoyolab(page, { notes: { retcode: 10104, message: 'denied' } });
    await page.goto('/account');
    await importUid(page);
    await turnOn(page);

    await page.getByRole('button', { name: 'Refresh timers' }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(/Real-Time Notes/);
  });

  test('forgets the cookie for good when asked', async ({ page }) => {
    await mockHoyolab(page);
    await page.goto('/account');
    await turnOn(page);

    await page.getByRole('button', { name: 'Forget this cookie' }).click();
    await expect(page.getByLabel('HoYoLAB cookie')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('HoYoLAB cookie')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh wishes' })).toHaveCount(0);
  });
});
