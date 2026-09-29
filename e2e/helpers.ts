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
 * Waits out the Plan screen's write debounce.
 *
 * usePlan holds edits for 400ms before writing them, so anything that reads or
 * rewrites the stored plan straight after an edit races the save in flight.
 */
export async function waitForPlanSave(page: Page) {
  await page.waitForTimeout(700);
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
