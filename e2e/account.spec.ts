import { expect, test, type Page } from '@playwright/test';

/**
 * The Account screen.
 *
 * The Enka route is intercepted here rather than called for real. Hitting a
 * third party on every test run would be slow, flaky, rate-limited and rude,
 * and it would test their uptime rather than our code. The live integration was
 * verified separately against Enka's own documented example UID: a real import
 * returned a profile with ttl 59, and a second request inside that window came
 * back from cache in 10ms rather than 1,942ms.
 */

/** Shaped like a real Enka response, with the fields the chips read. */
const profileFixture = {
  data: {
    playerInfo: { nickname: 'Traveler', level: 57 },
    avatarInfoList: [
      // Kamisato Ayaka, level 90, C1.
      { avatarId: 10000002, propMap: { '4001': { val: '90' } }, talentIdList: [1] },
      // Jean, level 80, C0.
      { avatarId: 10000003, propMap: { '4001': { val: '80' } } },
    ],
  },
  ttl: 60,
  fetchedAt: Date.now(),
  cached: false,
};

async function mockEnka(page: Page, body: unknown, status = 200) {
  await page.route('**/api/enka/**', async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/** Enka's art is blocked so the tests never depend on their CDN being up. */
async function blockEnkaArt(page: Page) {
  await page.route('https://enka.network/ui/**', (route) => route.abort());
}

test.describe('Account screen', () => {
  test.beforeEach(async ({ page }) => {
    await blockEnkaArt(page);
  });

  test('imports a UID and shows the showcase as chips', async ({ page }) => {
    await mockEnka(page, profileFixture);
    await page.goto('/account');

    await page.getByLabel('UID').fill('618285856');
    await page.getByRole('button', { name: 'Import characters' }).click();

    const chips = page.getByLabel('Characters in your showcase');
    await expect(chips).toBeVisible();

    // Names come from the generated Enka map, not from the response.
    await expect(chips).toContainText('Kamisato Ayaka');
    await expect(chips).toContainText('Jean');
    // Rarity is never colour alone (DESIGN.md).
    await expect(chips).toContainText('★★★★★');
    await expect(chips).toContainText('Lv 90');
    await expect(chips).toContainText('C1');

    await expect(page.getByText(/Showing 2 from Traveler/)).toBeVisible();
  });

  test('keeps the profile across a reload', async ({ page }) => {
    await mockEnka(page, profileFixture);
    await page.goto('/account');
    await page.getByLabel('UID').fill('618285856');
    await page.getByRole('button', { name: 'Import characters' }).click();
    await expect(page.getByText('Kamisato Ayaka')).toBeVisible();

    await page.reload();
    // Read back from IndexedDB, with no second request.
    await expect(page.getByText('Kamisato Ayaka')).toBeVisible();
    await expect(page.getByText(/Updated just now/)).toBeVisible();
  });

  test('holds off refreshing until Enka’s TTL has passed', async ({ page }) => {
    await mockEnka(page, profileFixture);
    await page.goto('/account');
    await page.getByLabel('UID').fill('618285856');
    await page.getByRole('button', { name: 'Import characters' }).click();
    await expect(page.getByText('Kamisato Ayaka')).toBeVisible();

    // Their docs are explicit that a repeat request burns rate limit even when
    // it returns cached data, so the button is disabled rather than merely slow.
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    await expect(page.getByText(/you can check again in \d+ seconds?/)).toBeVisible();
  });

  test('rejects a malformed UID without spending a request', async ({ page }) => {
    let requests = 0;
    await page.route('**/api/enka/**', async (route) => {
      requests++;
      await route.fulfill({ status: 200, body: JSON.stringify(profileFixture) });
    });

    await page.goto('/account');
    await page.getByLabel('UID').fill('12345');
    await page.getByRole('button', { name: 'Import characters' }).click();

    await expect(page.getByText(/That UID doesn.t look right/)).toBeVisible();
    expect(requests, 'a malformed UID must not reach the network').toBe(0);
  });

  test('says what to do for each kind of failure', async ({ page }) => {
    const cases = [
      { status: 404, error: 'not-found', copy: /No player with that UID/ },
      { status: 424, error: 'maintenance', copy: /under maintenance/ },
      { status: 429, error: 'rate-limited', copy: /Too many requests/ },
      { status: 503, error: 'enka-down', copy: /Enka.Network is having trouble/ },
    ];

    for (const testCase of cases) {
      await mockEnka(page, { error: testCase.error }, testCase.status);
      await page.goto('/account');
      await page.getByLabel('UID').fill('618285856');
      await page.getByRole('button', { name: 'Import characters' }).click();

      await expect(
        page.locator('main').getByRole('alert'),
        `status ${testCase.status}`,
      ).toContainText(testCase.copy);
    }
  });

  test('tells a player with the showcase off what to switch on', async ({ page }) => {
    await mockEnka(page, {
      data: { playerInfo: { nickname: 'Traveler' }, avatarInfoList: [] },
      ttl: 60,
      fetchedAt: Date.now(),
    });
    await page.goto('/account');
    await page.getByLabel('UID').fill('618285856');
    await page.getByRole('button', { name: 'Import characters' }).click();

    await expect(page.locator('main').getByRole('alert')).toContainText(
      /Turn on your in-game character showcase/,
    );
  });

  test('forgets a UID when asked', async ({ page }) => {
    await mockEnka(page, profileFixture);
    await page.goto('/account');
    await page.getByLabel('UID').fill('618285856');
    await page.getByRole('button', { name: 'Import characters' }).click();
    await expect(page.getByText('Kamisato Ayaka')).toBeVisible();

    await page.getByRole('button', { name: 'Forget this UID' }).click();
    await expect(page.getByText('Kamisato Ayaka')).toHaveCount(0);

    await page.reload();
    await expect(page.getByText('Kamisato Ayaka')).toHaveCount(0);
  });

  test('carries the fan-project notice', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByText(/not affiliated with HoYoverse/)).toBeVisible();
  });

  /**
   * The banner calendar is generated from a fan source on a weekly cron, so it
   * can quietly fall behind a patch. Saying when it was refreshed is what lets
   * a player tell a stale target date from a wrong one.
   */
  test('says when the game data was last refreshed', async ({ page }) => {
    await page.goto('/account');

    const line = page.getByText(/Last refreshed/);
    await expect(line).toBeVisible();
    await expect(line).toContainText(/\d{4}-\d{2}-\d{2}/);
    await expect(line).toContainText(/paimon\.moe/);
  });
});
