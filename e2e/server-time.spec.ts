import { expect, test, type Page } from '@playwright/test';

/**
 * Server time, end to end.
 *
 * Genshin resets at 4:00 *server* time and runs three clocks. Everything used
 * to assume America, which put a European player's countdowns six hours out
 * and an Asian player's thirteen — silently, because a countdown always looks
 * plausible.
 *
 * The server comes from the UID, so this imports one and checks the clock moved.
 */

const enkaFixture = {
  data: {
    playerInfo: { nickname: 'Traveler', level: 57 },
    avatarInfoList: [{ avatarId: 10000002, propMap: { '4001': { val: '90' } } }],
  },
  ttl: 60,
  fetchedAt: Date.now(),
  cached: false,
};

async function mockEnka(page: Page) {
  await page.route('https://enka.network/ui/**', (route) => route.abort());
  await page.route('**/api/enka/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(enkaFixture),
    }),
  );
}

/**
 * Imports a UID and waits for the *stored* profile to say so.
 *
 * Waiting on the character chip is not enough on a second import: the chip is
 * already on screen from the first one, so the assertion passes before the
 * settings write lands and the next page reads the old server. The server line
 * is driven by the stored row, so it is the honest signal.
 */
async function importUid(page: Page, uid: string, server: string) {
  await page.goto('/account');
  await page.getByLabel(/UID/i).first().fill(uid);
  // "Import characters" the first time, "Refresh" once a profile exists.
  await page.getByRole('button', { name: /Import characters|Refresh/ }).click();
  await expect(page.getByText(/Reading/)).toContainText(server);
}

/**
 * The Daily reset countdown, in minutes.
 *
 * Found by its own label rather than by matching "In ..." anywhere on the
 * page: several rows start that way and which one comes first depends on the
 * hour, which is exactly the variable under test.
 */
async function dailyResetMinutes(page: Page): Promise<number> {
  await page.goto('/timers');
  // The screen renders a busy panel until the stored timers arrive, so the row
  // has to be waited for rather than read straight after the navigation.
  await expect(page.getByText('Daily reset', { exact: true })).toBeVisible();

  const text =
    (await page
      .locator('div', { has: page.getByText('Daily reset', { exact: true }) })
      .last()
      .innerText()) ?? '';

  const countdown = /In\s+(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?/.exec(text);
  expect(countdown, `no countdown in: ${JSON.stringify(text)}`).not.toBeNull();

  return Number(countdown?.[1] ?? 0) * 60 + Number(countdown?.[2] ?? 0);
}

test.describe('Server time', () => {
  test.beforeEach(async ({ page }) => {
    await mockEnka(page);
  });

  test('says it is assuming America before a UID is imported', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByText(/Assuming the/)).toContainText('America');
    await expect(page.getByText(/Assuming the/)).toContainText('no UID has been imported');
  });

  test('reads the server off the UID', async ({ page }) => {
    await importUid(page, '712345678', 'Europe');

    await page.goto('/account');
    // And it survives a reload, because it comes from stored settings.
    await expect(page.getByText(/Reading/)).toContainText('Europe');
  });

  test('places an Asian UID on the Asia clock, not a Chinese one', async ({ page }) => {
    // 18xxxxxxxx is a newer Asian account; reading the first digit alone would
    // call it China and be thirteen hours out.
    await importUid(page, '1812345678', 'Asia');
  });

  /**
   * The behaviour all of this exists for: America's reset is at 09:00 UTC and
   * Europe's at 03:00, so from any instant the two countdowns differ by six
   * hours, whichever side of the reset the test happens to run.
   */
  test('moves the daily reset countdown by six hours for a European account', async ({ page }) => {
    await importUid(page, '612345678', 'America');
    const america = await dailyResetMinutes(page);

    await importUid(page, '712345678', 'Europe');
    const europe = await dailyResetMinutes(page);

    const difference = (((america - europe) % 1440) + 1440) % 1440;
    expect(difference, `America ${america} min, Europe ${europe} min`).toBe(360);
  });

  test('moves it by thirteen hours for an Asian account', async ({ page }) => {
    await importUid(page, '612345678', 'America');
    const america = await dailyResetMinutes(page);

    await importUid(page, '812345678', 'Asia');
    const asia = await dailyResetMinutes(page);

    const difference = (((america - asia) % 1440) + 1440) % 1440;
    expect(difference, `America ${america} min, Asia ${asia} min`).toBe(13 * 60);
  });
});
