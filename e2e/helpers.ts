import { expect, type Page } from '@playwright/test';

/** Steppers are spinbuttons over a text input, so set them by typing. */
export async function setStepper(page: Page, name: string | RegExp, value: number) {
  const input = page.getByRole('spinbutton', { name });
  await input.click();
  await input.press('ControlOrMeta+a');
  await input.fill(String(value));
  // Commit on blur, which is when the formatted value is written back.
  await input.blur();
}

/** The numeral is aria-hidden display; the sentence below it carries meaning. */
export async function readAnswer(page: Page) {
  return page.locator('p[aria-hidden="true"] span').first().textContent();
}

/**
 * Waits for a counting numeral to stop moving, then returns it.
 *
 * Every big answer counts to its value rather than snapping, so reading one the
 * instant it appears catches it partway — a 49.5% read as 0.1 on its way up.
 *
 * This asks the numeral whether it is still counting rather than inferring it
 * from two reads agreeing. The inference is not sound: the tween runs on
 * requestAnimationFrame, and under a full parallel run the frames spread far
 * enough apart that consecutive samples disagree for as long as you keep
 * sampling — which failed the whole build-optimiser block on a loaded machine
 * while the screen itself was perfectly correct. `tweenNumber` sets the
 * attribute for exactly this reason.
 */
export async function settledAnswer(page: Page): Promise<string> {
  const numeral = page.locator('p[aria-hidden="true"] span').first();

  // Absent is the settled state, and it is also what a numeral that never
  // animated looks like — under reduced motion nothing sets it at all.
  await expect(numeral).not.toHaveAttribute('data-counting', 'true', { timeout: 20_000 });

  return (await numeral.textContent()) ?? '';
}

/**
 * The worked example from design/preview.html: 11,200 primogems, 14 fates,
 * pity 22, 50/50, 3,850 income — which comes to 108 pulls and 72.9% at C0.
 */
export async function enterPreviewExample(page: Page) {
  await setStepper(page, 'Primogems', 11_200);
  await setStepper(page, 'Intertwined Fates', 14);
  await setStepper(page, 'Pity', 22);
  await setStepper(page, /^Income/, 3_850);
  await expect.poll(() => readAnswer(page)).toBe('72.9');
}

/**
 * Waits until the Plan screen has its stored plan.
 *
 * `goto` resolves on `load`, before React has attached handlers — typing into
 * an input then goes nowhere, silently. The screen already marks itself
 * `aria-busy` until the stored plan arrives, which is the same moment
 * hydration has finished, so there is no test-only marker to add.
 */
export async function planReady(page: Page) {
  await expect(page.locator('section[aria-labelledby="plan-title"]')).toHaveAttribute(
    'aria-busy',
    'false',
  );
}

/** The newest `updatedAt` across stored plans, or 0 if there are none. */
async function newestPlanWrite(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('starfall');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows: { updatedAt?: number }[] = await new Promise((resolve) => {
      const request = db.transaction('plans', 'readonly').objectStore('plans').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });
    db.close();
    return rows.reduce((newest, row) => Math.max(newest, row.updatedAt ?? 0), 0);
  });
}

/**
 * Waits until nothing is left to write.
 *
 * usePlan holds edits for 400ms, so anything that reads or rewrites the stored
 * plan straight after an edit races the save in flight.
 *
 * Two earlier versions of this were wrong in opposite directions. A fixed 700ms
 * sleep was enough alone and not enough under a full parallel run. Waiting for
 * `updatedAt` to climb past the moment we started never finished when the write
 * had *already* landed, which is the common case. So: wait out the debounce,
 * then wait for two consecutive reads to agree.
 */
export async function waitForPlanSave(page: Page) {
  await page.waitForTimeout(600);

  let previous = -1;
  await expect
    .poll(
      async () => {
        const current = await newestPlanWrite(page);
        const settled = current === previous;
        previous = current;
        return settled;
      },
      { timeout: 15_000, intervals: [150, 150, 250, 250, 500] },
    )
    .toBe(true);
}

/** The number a stepper is showing, with its thousands separators removed. */
export async function readStepper(page: Page, name: string | RegExp): Promise<number> {
  const raw = await page.getByRole('spinbutton', { name }).inputValue();
  return Number(raw.replace(/[^0-9-]/g, ''));
}

/**
 * Moves the stored plan's balance confirmation back in time.
 *
 * The ledger carries a balance forward from when it was last confirmed, and
 * there is no way to wait ten days in a test. Written straight to IndexedDB
 * rather than through the app, so it exercises the read path for real.
 */
export async function backdateBalance(page: Page, days: number) {
  await waitForPlanSave(page);

  await page.evaluate(async (daysBack) => {
    const open = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('starfall');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

    const db = await open();
    const plans: { balanceConfirmedAt: number }[] = await new Promise((resolve) => {
      const request = db.transaction('plans', 'readonly').objectStore('plans').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });

    const at = Date.now() - daysBack * 86_400_000;
    await Promise.all(
      plans.map(
        (plan) =>
          new Promise<void>((resolve) => {
            const request = db
              .transaction('plans', 'readwrite')
              .objectStore('plans')
              .put({ ...plan, balanceConfirmedAt: at });
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
          }),
      ),
    );
    db.close();
  }, days);
}
