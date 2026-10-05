import { expect, test } from '@playwright/test';

/**
 * The one control sound has, and the one promise it makes: a choice made once
 * stays made.
 *
 * Nothing here can assert that a sound was heard — there is no way to observe
 * the Web Audio graph from a test, and faking one would only assert that the
 * fake was called. What is worth holding is the part that would annoy someone:
 * turning it off and finding it on again tomorrow.
 */

test.describe('Sound', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Sound' })).toBeVisible();
  });

  /**
   * On by default. Every sound responds to something the player did and
   * browsers suspend audio until a gesture regardless, so nobody is ambushed —
   * and defaulting off would mean almost nobody ever hears it.
   */
  test('is on to begin with', async ({ page }) => {
    const toggle = page.getByRole('button', { name: /sound/i });

    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveText('Turn sound off');
    await expect(page.getByText(/only ever plays in response to something you did/)).toBeVisible();
  });

  test('turns off, and says so', async ({ page }) => {
    await page.getByRole('button', { name: 'Turn sound off' }).click();

    const toggle = page.getByRole('button', { name: /sound/i });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveText('Turn sound on');
    await expect(page.getByText(/Sound is off\. Nothing will play\./)).toBeVisible();
  });

  /** The whole point of storing it. */
  test('remembers the choice across a reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Turn sound off' }).click();
    await expect(page.getByRole('button', { name: /sound/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await page.reload();

    await expect(page.getByRole('button', { name: /sound/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByText(/Sound is off/)).toBeVisible();
  });

  test('turns back on again', async ({ page }) => {
    await page.getByRole('button', { name: 'Turn sound off' }).click();
    await page.getByRole('button', { name: 'Turn sound on' }).click();

    await expect(page.getByRole('button', { name: /sound/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
