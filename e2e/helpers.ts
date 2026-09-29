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
