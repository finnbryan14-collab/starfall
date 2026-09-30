import { expect, test } from '@playwright/test';

import { planReady, setStepper, waitForPlanSave } from './helpers';

/**
 * Choosing who you are planning for, and keeping more than one plan.
 *
 * SPEC.md section 1 lists target character and target date as the planner's
 * first two inputs, and asks that "several can exist (e.g. 'Skirk C1' and
 * 'Save for 7.2')". Neither was reachable: the target was whatever the first
 * run wrote and no screen ever set it again.
 */

/*
  By id rather than by role or label. An `<input type="text" list="...">` maps
  to `combobox`, not `textbox`, and "By" is a substring of eight accessible
  names on this screen — "Chance of getting Skirk *by* pull count", "Income *by*
  Nov 3". The ids are what the labels point at, so they are exact by
  construction.
*/
type Page = import('@playwright/test').Page;

const target = (page: Page) => page.locator('#plan-target');
const byDate = (page: Page) => page.locator('#plan-date');
const switcher = (page: Page) => page.locator('#plan-switcher');

test.describe('Plan target', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plan');
    await planReady(page);
  });

  test('can be pointed at a different character', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Skirk');

    await target(page).fill('Escoffier');
    await target(page).blur();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Escoffier');
  });

  test('moves the date to that character’s banner', async ({ page }) => {
    await target(page).fill('Escoffier');
    await target(page).blur();

    // 7.1 phase 2 runs to 2026-11-03, so that is when the plan counts to.
    await expect(byDate(page)).toHaveValue('2026-11-03');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Nov 3');
  });

  test('takes a goal that is not a character at all', async ({ page }) => {
    // The schema allows free text, and "save for 7.2" is a real plan.
    await target(page).fill('Save for 7.2');
    await target(page).blur();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Save for 7.2');
  });

  test('lets the date be set by hand', async ({ page }) => {
    await byDate(page).fill('2026-12-25');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dec 25');

    await waitForPlanSave(page);
    await page.reload();
    await expect(byDate(page)).toHaveValue('2026-12-25');
  });

  test('offers the characters the calendar knows', async ({ page }) => {
    const options = page.locator('#plan-characters option');
    await expect(options.first()).toBeAttached();
    expect(await options.count()).toBeGreaterThan(20);
  });
});

test.describe('Several plans', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plan');
    await planReady(page);
  });

  test('a first run has one plan and no switcher to explain', async ({ page }) => {
    await expect(switcher(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete this plan' })).toHaveCount(0);
  });

  test('keeps two plans apart, each with its own inputs', async ({ page }) => {
    await target(page).fill('Skirk');
    await target(page).blur();
    await setStepper(page, 'Primogems', 11_200);

    await page.getByRole('button', { name: 'Save another plan' }).click();
    await expect(switcher(page)).toBeVisible();

    await target(page).fill('Save for 7.2');
    await target(page).blur();
    await setStepper(page, 'Primogems', 500);

    // Back to the first: its own figure, not the second's.
    await switcher(page).selectOption({ label: 'Skirk C0' });
    await expect(page.getByRole('spinbutton', { name: 'Primogems' })).toHaveValue('11,200');

    // Not "Save for 7.2 C0": a constellation only belongs on a character.
    await switcher(page).selectOption({ label: 'Save for 7.2' });
    await expect(page.getByRole('spinbutton', { name: 'Primogems' })).toHaveValue('500');
  });

  test('survives a reload with both plans intact', async ({ page }) => {
    await page.getByRole('button', { name: 'Save another plan' }).click();
    await target(page).fill('Escoffier');
    await target(page).blur();

    await waitForPlanSave(page);
    await page.reload();

    await expect(switcher(page)).toBeVisible();
    expect(await page.locator('#plan-switcher option').count()).toBe(2);
  });

  test('deleting one falls back to the other rather than to nothing', async ({ page }) => {
    await page.getByRole('button', { name: 'Save another plan' }).click();
    await expect(switcher(page)).toBeVisible();

    await page.getByRole('button', { name: 'Delete this plan' }).click();

    // One left, so the switcher goes away again and the screen still works.
    await expect(switcher(page)).toHaveCount(0);
    await expect(page.getByRole('spinbutton', { name: 'Primogems' })).toBeVisible();
  });
});

test.describe('Balance projection', () => {
  test('draws the balance by date under the dial', async ({ page }) => {
    await page.goto('/plan');
    await planReady(page);
    await setStepper(page, 'Primogems', 11_200);

    // SPEC section 1: a projection of the balance by date, as a small line.
    const chart = page.getByRole('img', { name: /Primogems from/ });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute('aria-label', /by \w+ \d+/);
  });

  test('says nothing when the date has already passed', async ({ page }) => {
    await page.goto('/plan');
    await planReady(page);
    await byDate(page).fill('2026-09-01');

    // Nothing to project over, so there is no line — and the screen says why
    // rather than leaving a gap where a chart was.
    await expect(page.getByRole('img', { name: /Primogems from/ })).toHaveCount(0);
    await expect(page.getByText(/has passed/)).toBeVisible();
  });

  test('ends on the income figure the screen is showing', async ({ page }) => {
    await page.goto('/plan');
    await planReady(page);
    await setStepper(page, 'Primogems', 11_200);
    await setStepper(page, /^Income/, 3_850);

    // 11,200 + 3,850. A line that ended anywhere else would contradict the
    // stepper directly above it.
    await expect(page.getByRole('img', { name: /Primogems from/ })).toHaveAttribute(
      'aria-label',
      /to 15,050 by/,
    );
  });
});

/**
 * What the server puts in the HTML, before any JavaScript runs.
 *
 * `/plan` is prerendered at build time and served for as long as the deploy
 * lives. Anything computed from a clock is therefore the *build's* clock in the
 * HTML and the visitor's on hydration — React throws the markup away and
 * re-renders, which is React error #418.
 *
 * It cannot be caught by loading the page locally, because a local check runs
 * moments after the build and the two clocks agree. It showed up only on a
 * deployment that had been up a while. So the invariant is asserted directly:
 * the prerendered HTML carries no projection at all.
 */
test.describe('Prerendered HTML', () => {
  test('carries nothing computed from a clock', async ({ request, baseURL }) => {
    const html = await (await request.get(new URL('/plan', baseURL).toString())).text();

    // The balance line only exists once income has been projected over a real
    // span, which cannot happen before the stored plan has loaded.
    expect(html, 'the balance line must not be prerendered').not.toContain('Primogems from');

    // And the screen still ships something to read rather than an empty panel.
    expect(html).toContain('Your stash');
    expect(html).toContain('aria-busy="true"');
  });
});
