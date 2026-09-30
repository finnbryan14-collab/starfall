import { expect, test } from '@playwright/test';

import {
  backdateBalance,
  enterPreviewExample,
  planReady,
  readAnswer,
  readStepper,
  setStepper,
  waitForPlanSave,
} from './helpers';

/**
 * The Plan screen end to end.
 *
 * Covers the two conditions ROADMAP names for Phase 1: the screen survives a
 * reload, and entering the preview's example gives 72.9% for C0.
 */

test.describe('Plan screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plan');
    // `goto` resolves before React has the stored plan on screen; reading a
    // stepper any earlier gets the provisional zero.
    await planReady(page);
  });

  /** ROADMAP Phase 1: assert 72.9% for C0 on the preview's example. */
  test('gives 72.9% for the preview example', async ({ page }) => {
    await enterPreviewExample(page);

    // 50/50, not guaranteed, is the default; assert it rather than assume it.
    await expect(page.getByRole('radio', { name: '50/50' })).toBeChecked();

    await expect.poll(() => readAnswer(page)).toBe('72.9');
    await expect(page.getByText(/108\s*pulls you.ll have/)).toBeVisible();
  });

  test('prints the 90% hint for the C0 goal', async ({ page }) => {
    await enterPreviewExample(page);
    // 134 pulls for 90% odds, 26 beyond the 108 the player will have.
    await expect(page.getByText(/26 more pulls \(4,160 primogems\)/)).toBeVisible();
  });

  test('shows a row per constellation up to the goal', async ({ page }) => {
    await enterPreviewExample(page);

    const row = page.getByLabel('Chance by constellation');
    await expect(row).toContainText('C0');
    await expect(row).not.toContainText('C1');

    await setStepper(page, 'Constellation goal', 2);
    await expect(row).toContainText('C0');
    await expect(row).toContainText('C1');
    await expect(row).toContainText('C2');

    // The hint follows the goal, so it is no longer the C0 figure.
    await expect(page.getByText(/26 more pulls \(4,160 primogems\)/)).toHaveCount(0);
    await expect(page.getByText(/gets you to 90% odds/)).toBeVisible();
  });

  /** ROADMAP Phase 1: the screen survives a reload. */
  test('survives a reload', async ({ page }) => {
    await enterPreviewExample(page);
    await expect.poll(() => readAnswer(page)).toBe('72.9');

    await waitForPlanSave(page);
    await page.reload();

    await expect(page.getByRole('spinbutton', { name: 'Primogems' })).toHaveValue('11,200');
    await expect(page.getByRole('spinbutton', { name: 'Intertwined Fates' })).toHaveValue('14');
    await expect(page.getByRole('spinbutton', { name: 'Pity' })).toHaveValue('22');
    await expect.poll(() => readAnswer(page)).toBe('72.9');
  });

  test('a guarantee raises the odds and persists', async ({ page }) => {
    await enterPreviewExample(page);
    await expect.poll(() => readAnswer(page)).toBe('72.9');

    await page.getByRole('radio', { name: 'Guaranteed' }).check();
    await expect.poll(() => readAnswer(page)).not.toBe('72.9');
    const guaranteed = Number(await readAnswer(page));
    expect(guaranteed).toBeGreaterThan(72.9);

    await waitForPlanSave(page);
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Guaranteed' })).toBeChecked();
  });

  test('meets the SPEC case: 90 pulls, pity 0, guaranteed, C0 shows 100%', async ({ page }) => {
    await setStepper(page, 'Primogems', 0);
    await setStepper(page, 'Intertwined Fates', 90);
    await setStepper(page, 'Pity', 0);
    await setStepper(page, /^Income/, 0);
    await page.getByRole('radio', { name: 'Guaranteed' }).check();

    await expect.poll(() => readAnswer(page)).toBe('100.0');
  });

  test('invites the first input when there is nothing to go on', async ({ page }) => {
    await setStepper(page, 'Primogems', 0);
    await setStepper(page, 'Intertwined Fates', 0);
    await setStepper(page, /^Income/, 0);

    await expect(page.getByText('Add your primogems to see your odds.')).toBeVisible();
  });

  test('opens the income sheet and lets a source be switched off', async ({ page }) => {
    await page.getByRole('button', { name: 'Income assumptions' }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Daily commissions')).toBeVisible();
    // Community midpoints are labelled, so they cannot read as published facts.
    await expect(sheet.getByText('estimate').first()).toBeVisible();

    const commissions = sheet.getByRole('checkbox', { name: /Daily commissions/ });
    await expect(commissions).toBeChecked();
    await commissions.uncheck();
    await expect(commissions).not.toBeChecked();

    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).not.toBeVisible();
  });

  test('keyboard alone can change an input', async ({ page }) => {
    const pity = page.getByRole('spinbutton', { name: 'Pity' });
    await pity.click();
    await pity.press('ControlOrMeta+a');
    await pity.fill('20');
    await pity.blur();

    await pity.focus();
    await pity.press('ArrowUp');
    await pity.press('ArrowUp');
    await expect(pity).toHaveValue('22');
  });

  /**
   * ROADMAP Phase 4: the Plan screen opens with a balance that is right
   * without touching it, and says how stale it is.
   */
  test('carries the balance forward and shows its working', async ({ page }) => {
    await enterPreviewExample(page);
    const confirmed = await readStepper(page, 'Primogems');
    expect(confirmed).toBe(11_200);

    // Nothing to explain while the confirmation is the balance.
    await expect(page.getByText(/Carried forward from/)).toHaveCount(0);

    await backdateBalance(page, 10);
    await page.reload();
    await planReady(page);

    const carried = await readStepper(page, 'Primogems');
    expect(carried, 'ten days of income should have been added').toBeGreaterThan(confirmed);

    const line = page.getByText(/Carried forward from/);
    await expect(line).toBeVisible();
    await expect(line).toContainText(`+${(carried - confirmed).toLocaleString('en-US')} earned`);
  });

  test('re-anchors when the balance is typed again', async ({ page }) => {
    await enterPreviewExample(page);
    await backdateBalance(page, 10);
    await page.reload();
    await expect(page.getByText(/Carried forward from/)).toBeVisible();

    // Typing is a fresh confirmation, so there is nothing left to carry.
    await setStepper(page, 'Primogems', 5_000);
    await expect(page.getByText(/Carried forward from/)).toHaveCount(0);
    expect(await readStepper(page, 'Primogems')).toBe(5_000);

    await waitForPlanSave(page);
    await page.reload();
    await planReady(page);
    // Reloading must not re-apply the ten days that were already counted.
    expect(await readStepper(page, 'Primogems')).toBe(5_000);
  });
});
