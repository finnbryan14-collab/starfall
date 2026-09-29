import { expect, test } from '@playwright/test';

/**
 * Reduced motion must jump straight to end states (CLAUDE.md, DESIGN.md).
 *
 * Both halves are checked: the CSS tokens zero, and — the part that used to be
 * wrong in DESIGN.md — the JS durations src/motion/ reads zero with them, since
 * anime.js never sees the CSS media query on its own.
 */

/**
 * Returns milliseconds, not the raw string: Lightning CSS rewrites the authored
 * units when it minifies, so `160ms` ships as `.16s` and `0ms` as `0s`. The
 * number is what matters, and parsing both forms is exactly what
 * src/motion/durations.ts exists to do.
 */
const tokenDurationsMs = () => {
  const read = (name: string) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const match = /^(-?[\d.]+)(ms|s)?$/.exec(raw);
    if (!match) throw new Error(`unparseable duration for ${name}: ${raw}`);
    return match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1]);
  };
  return { quick: read('--d-quick'), move: read('--d-move'), signature: read('--d-signature') };
};

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('zeroes every motion token', async ({ page }) => {
    await page.goto('/dev/motion');
    const durations = await page.evaluate(tokenDurationsMs);
    expect(durations).toEqual({ quick: 0, move: 0, signature: 0 });
  });

  test('reports the preference and jumps the counter straight to its target', async ({ page }) => {
    await page.goto('/dev/motion');
    await expect(page.getByText('prefers-reduced-motion: reduce')).toBeVisible();

    const numeral = page
      .locator('p')
      .filter({ hasText: /^\d+\.\d$/ })
      .first();
    await expect(numeral).toHaveText('72.9');

    await page.getByRole('button', { name: 'Count to 12.4' }).click();
    // No waiting, no polling: under reduced motion the value is written once,
    // synchronously, so it is already final on the very next read.
    expect(await numeral.textContent()).toBe('12.4');
  });
});

test.describe('normal motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('keeps the token durations from tokens.css', async ({ page }) => {
    await page.goto('/dev/motion');
    const durations = await page.evaluate(tokenDurationsMs);
    expect(durations).toEqual({ quick: 160, move: 420, signature: 1100 });
  });

  test('actually animates the counter rather than snapping', async ({ page }) => {
    await page.goto('/dev/motion');
    const numeral = page
      .locator('p')
      .filter({ hasText: /^\d+\.\d$/ })
      .first();
    await expect(numeral).toHaveText('72.9');

    await page.getByRole('button', { name: 'Count to 12.4' }).click();
    // Mid-flight it should be somewhere between the two values.
    await page.waitForTimeout(250);
    const midpoint = Number(await numeral.textContent());
    expect(midpoint).toBeGreaterThan(12.4);
    expect(midpoint).toBeLessThan(72.9);

    // And it must land exactly, not wherever the last frame fell.
    await expect(numeral).toHaveText('12.4', { timeout: 3000 });
  });
});
