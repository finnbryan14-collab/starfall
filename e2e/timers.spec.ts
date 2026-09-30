import { expect, test, type Page } from '@playwright/test';

import { setStepper } from './helpers';

/**
 * The Timers screen.
 *
 * ROADMAP's condition is that values are correct after a simulated ten-hour
 * gap. Nothing here counts down in the page — every timer is derived from a
 * stored instant — so the way to test that is to move the clock forward and
 * reload, exactly as closing the app overnight would.
 */

const MS_PER_HOUR = 3_600_000;

/**
 * Runs the page's clock `ms` ahead of real time, from the next load onwards.
 *
 * A Proxy rather than a subclass: extending Date means declaring constructor
 * parameters, and TypeScript then decides a zero-argument call is unreachable.
 * Only `Date` is shifted, not timers, so IndexedDB and the app's own interval
 * keep behaving normally.
 */
async function shiftClock(page: Page, ms: number) {
  await page.addInitScript((offset) => {
    const RealDate = Date;
    const shift = offset as number;

    globalThis.Date = new Proxy(RealDate, {
      construct(target, args) {
        if (args.length === 0) return new target(RealDate.now() + shift);
        return Reflect.construct(target, args);
      },
      get(target, property, receiver) {
        if (property === 'now') return () => RealDate.now() + shift;
        return Reflect.get(target, property, receiver);
      },
    }) as DateConstructor;
  }, ms);
}

test.describe('Timers screen', () => {
  test('starts at zero resin and says how long to full', async ({ page }) => {
    await page.goto('/timers');
    await expect(page.getByRole('heading', { name: 'Original Resin' })).toBeVisible();
    // 200 points at 8 minutes each is 26 h 40 min from empty, which the
    // duration format renders in days and hours — minutes are dropped once a
    // duration passes a day, as the preview does.
    await expect(page.getByText(/Full in 1 day 2 h/)).toBeVisible();
  });

  test('records a resin reading and works out when it fills', async ({ page }) => {
    await page.goto('/timers');
    await setStepper(page, 'Resin now', 143);

    // 57 points to go at 8 minutes each is 7 h 36 min.
    await expect(page.getByText(/Full in 7 h 36 min/)).toBeVisible();
    await expect(page.getByText('143', { exact: true })).toBeVisible();
  });

  /** ROADMAP: correct after a simulated ten-hour gap. */
  test('is right after the app has been closed for ten hours', async ({ page }) => {
    await page.goto('/timers');
    await setStepper(page, 'Resin now', 100);
    await expect(page.getByText(/Full in 13 h 20 min/)).toBeVisible();

    // Ten hours pass with the app closed: 600 minutes is 75 more resin.
    await shiftClock(page, 10 * MS_PER_HOUR);
    await page.reload();

    await expect(page.getByText('175', { exact: true })).toBeVisible();
    // 25 points to go is 3 h 20 min.
    await expect(page.getByText(/Full in 3 h 20 min/)).toBeVisible();
  });

  test('caps rather than overflowing after a long absence', async ({ page }) => {
    await page.goto('/timers');
    await setStepper(page, 'Resin now', 100);

    await shiftClock(page, 100 * MS_PER_HOUR);
    await page.reload();

    await expect(page.getByText('200', { exact: true })).toBeVisible();
    await expect(page.getByText(/Anything you earn from here is wasted/)).toBeVisible();
  });

  test('tracks the transformer on its real 166-hour cooldown', async ({ page }) => {
    await page.goto('/timers');
    await expect(page.getByText('Not tracked yet').first()).toBeVisible();

    await page.getByRole('button', { name: 'I just used it' }).click();
    // 166 hours is 6 days 22 hours.
    await expect(page.getByText(/Ready in 6 days 22 h/)).toBeVisible();

    await shiftClock(page, 166 * MS_PER_HOUR);
    await page.reload();
    await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  });

  test('says the cooldown is not the seven days the gadget claims', async ({ page }) => {
    await page.goto('/timers');
    await expect(page.getByText(/6 days 22, not the 7 the gadget says/)).toBeVisible();
  });

  test('counts down to the daily and weekly resets', async ({ page }) => {
    await page.goto('/timers');
    await expect(page.getByText('Daily reset')).toBeVisible();
    await expect(page.getByText('Weekly reset')).toBeVisible();
    await expect(page.getByText(/Monday, in /)).toBeVisible();
  });

  test('accrues realm currency at the teapot rate', async ({ page }) => {
    await page.goto('/timers');
    await setStepper(page, 'Rate an hour', 30);
    await setStepper(page, 'Realm currency now', 1000);

    await shiftClock(page, 10 * MS_PER_HOUR);
    await page.reload();

    // 1,000 plus 10 hours at 30 an hour is 1,300.
    await expect(page.getByText(/1,300 of 2,400/)).toBeVisible();
  });

  test('survives a reload without the clock moving', async ({ page }) => {
    await page.goto('/timers');
    await setStepper(page, 'Resin now', 143);
    await page.reload();
    await expect(page.getByText('143', { exact: true })).toBeVisible();
  });

  /**
   * SPEC.md section 4 lists expeditions among the timers. The engine had them
   * from Phase 2; no screen ever showed one.
   */
  test('sends an expedition and counts it down', async ({ page }) => {
    await page.goto('/timers');
    await expect(page.getByText('Expedition 1')).toBeVisible();
    await expect(page.getByText('Not sent').first()).toBeVisible();

    await page.getByRole('button', { name: 'Send 20 h' }).click();

    // 20 hours, less the moment it took to click.
    await expect(page.getByText(/Back in 19 h 59 min|Back in 20 h 0 min/)).toBeVisible();
  });

  test('fills the next free slot rather than asking which', async ({ page }) => {
    await page.goto('/timers');
    await page.getByRole('button', { name: 'Send 4 h' }).click();
    await page.getByRole('button', { name: 'Send 8 h' }).click();

    await expect(page.getByRole('button', { name: 'Cancel 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel 2' })).toBeVisible();
    await expect(page.getByText('Not sent')).toHaveCount(3);
  });

  test('stops offering slots once all five are out', async ({ page }) => {
    await page.goto('/timers');
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: 'Send 4 h' }).click();
    }

    await expect(page.getByRole('button', { name: 'Send 4 h' })).toBeDisabled();
    await expect(page.getByText(/All five are out/)).toBeVisible();
  });

  test('keeps counting while the app is closed', async ({ page }) => {
    await page.goto('/timers');
    await page.getByRole('button', { name: 'Send 8 h' }).click();
    await expect(page.getByText(/Back in 7 h 59 min|Back in 8 h 0 min/)).toBeVisible();

    // The row stores when it was sent, not a countdown, so a reload cannot
    // restart it.
    await page.reload();
    await expect(page.getByText(/Back in 7 h 59 min|Back in 8 h 0 min/)).toBeVisible();
  });

  test('frees the slot when one is collected', async ({ page }) => {
    await page.goto('/timers');
    await page.getByRole('button', { name: 'Send 4 h' }).click();
    await expect(page.getByText('Not sent')).toHaveCount(4);

    await page.getByRole('button', { name: 'Cancel 1' }).click();
    await expect(page.getByText('Not sent')).toHaveCount(5);
  });
});
