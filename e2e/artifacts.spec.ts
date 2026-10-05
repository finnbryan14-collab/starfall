import { expect, test } from '@playwright/test';

import { settledAnswer } from './helpers';

/**
 * The Artifacts screen end to end.
 *
 * ROADMAP's condition is that entering a four-line piece is quick on a phone,
 * which means the substat picker must only ever offer stats the piece could
 * actually have. The simulation runs in a worker, so the checks here also prove
 * the worker answers at all.
 */

test.describe('Artifacts screen', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (error) => console.log('[pageerror]', error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') console.log('[console.error]', message.text());
    });
    await page.goto('/artifacts');
  });

  test('scores the MATH.md example at about even odds', async ({ page }) => {
    // The worker has to answer before anything else here is meaningful.
    await expect(page.getByText('Level it.')).toBeVisible({ timeout: 15_000 });

    // Settled, not snapped: the numeral counts to its value now.
    const probability = Number(await settledAnswer(page));
    expect(probability).toBeGreaterThan(45);
    expect(probability).toBeLessThan(55);

    await expect(page.getByText(/About even odds it finishes at 30\+ crit value/)).toBeVisible();
  });

  test('offers only substats the piece could actually have', async ({ page }) => {
    await expect(page.getByText('Level it.')).toBeVisible({ timeout: 15_000 });

    const first = page.getByLabel('Substat 1');
    const options = await first.locator('option').allTextContents();

    // ATK% is the main stat, so it cannot also be a substat.
    expect(options).not.toContain('ATK%');
    // The other three lines are taken.
    expect(options).not.toContain('CRIT DMG');
    expect(options).not.toContain('Energy Recharge');
    expect(options).not.toContain('DEF');
    // Its own value stays selectable, and free stats are offered.
    expect(options).toContain('CRIT Rate');
    expect(options).toContain('HP%');
  });

  test('re-scores when the goal changes', async ({ page }) => {
    await expect(page.getByText('Level it.')).toBeVisible({ timeout: 15_000 });
    const before = Number(await settledAnswer(page));

    // A much harder goal must lower the odds.
    const goal = page.getByRole('spinbutton', { name: /^Goal/ });
    await goal.click();
    await goal.press('ControlOrMeta+a');
    await goal.fill('45');
    await goal.blur();

    // Each read waits for the count to settle, so this cannot pass on a value
    // the numeral was only passing through on its way up.
    await expect
      .poll(async () => Number(await settledAnswer(page)), { timeout: 20_000 })
      .toBeLessThan(before);
  });

  test('shows the histogram with a goal line', async ({ page }) => {
    await expect(page.getByText('Level it.')).toBeVisible({ timeout: 15_000 });
    const chart = page.getByRole('img', { name: /Distribution of crit value/ });
    await expect(chart).toBeVisible();
    await expect(chart).toContainText('goal 30');
  });

  test('rolls one sampled outcome to +20', async ({ page }) => {
    await expect(page.getByText('Level it.')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Roll to +20' }).click();
    await expect(page.getByText(/This roll finished at/)).toBeVisible();
    await expect(page.getByText(/\+20, 4 substats/)).toBeVisible();

    await page.getByRole('button', { name: /Back to \+0/ }).click();
    await expect(page.getByText(/This roll finished at/)).toHaveCount(0);
  });

  test('estimates what a replacement costs', async ({ page }) => {
    await expect(page.getByText('Level it.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Half the time')).toBeVisible();
    await expect(page.getByText('9 times in 10')).toBeVisible();
    // The MATH.md figure for this piece.
    await expect(page.getByText(/1[3-6],\d{3} resin/)).toBeVisible();
  });

  test('keeps the main stat legal when the slot changes', async ({ page }) => {
    await expect(page.getByText('Level it.')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Slot').selectOption('flower');
    const main = page.getByLabel('Main stat');
    // A flower can only be flat HP, so the control has nothing to choose.
    await expect(main).toHaveValue('hp');
    await expect(main).toBeDisabled();
  });

  test('judges the piece differently for a different role', async ({ page }) => {
    await expect(page.getByText('Level it.')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel(/Judge it for/).selectOption('em-reaction');
    // The goal now reads in weighted rolls rather than crit value.
    await expect(page.getByText(/weighted rolls/).first()).toBeVisible();
  });
});
