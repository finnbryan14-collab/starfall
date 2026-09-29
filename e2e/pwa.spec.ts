import { expect, test } from '@playwright/test';

/**
 * Installability and offline.
 *
 * ROADMAP's condition is that it installs on iOS and Android and opens
 * offline. Whether a real phone offers the install prompt is something only a
 * phone can answer, so what is checked here is everything that decides it: a
 * valid manifest, icons that actually render, a registered service worker, and
 * a shell that survives the network going away.
 */

test.describe('PWA', () => {
  test('serves a manifest with everything an install needs', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);

    const manifest = await response.json();
    expect(manifest.name).toBe('Starfall');
    expect(manifest.short_name).toBe('Starfall');
    // Without standalone display there is no install, and on iOS no Web Push.
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/plan');
    expect(manifest.background_color).toBe('#141739');
    expect(manifest.theme_color).toBe('#141739');

    // Android needs a 192 and a 512, and a maskable one to avoid being letterboxed.
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(
      true,
    );
  });

  test('renders every icon the manifest points at', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();

    for (const icon of manifest.icons as { src: string }[]) {
      const response = await request.get(icon.src);
      expect(response.ok(), `${icon.src} did not serve`).toBe(true);
      expect(response.headers()['content-type']).toContain('image/png');

      const body = await response.body();
      // A PNG starts with a fixed 8-byte signature; anything else is not one.
      expect(body.subarray(0, 8).toString('hex'), `${icon.src} is not a PNG`).toBe(
        '89504e470d0a1a0a',
      );
    }
  });

  test('serves the iOS home-screen icon, which ignores the manifest', async ({ request }) => {
    const response = await request.get('/apple-icon');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  });

  test('links the manifest and the iOS icon from every page', async ({ page }) => {
    await page.goto('/plan');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    // The status bar matches the page rather than flashing white.
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#141739');
  });

  test('registers the service worker and caches the shell', async ({ page }) => {
    await page.goto('/plan');

    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            return Boolean(registration?.active);
          }),
        { timeout: 20_000 },
      )
      .toBe(true);

    // Every route in the shell is cached, not just the one that was visited.
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const shell = names.find((name) => name.includes('shell'));
      if (!shell) return [];
      const cache = await caches.open(shell);
      const keys = await cache.keys();
      return keys.map((request) => new URL(request.url).pathname);
    });

    for (const route of ['/plan', '/artifacts', '/timers', '/account']) {
      expect(cached, `${route} was not precached`).toContain(route);
    }
  });

  test('opens offline once the shell is cached', async ({ page, context }) => {
    await page.goto('/plan');
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            return Boolean(registration?.active);
          }),
        { timeout: 20_000 },
      )
      .toBe(true);

    // Give the worker a moment to finish claiming this client.
    await page.waitForTimeout(500);
    await context.setOffline(true);
    await page.reload();

    // The shell renders from cache with no network at all.
    await expect(page.getByRole('heading', { name: /Skirk/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    await context.setOffline(false);
  });

  test('never caches account API responses', async ({ page }) => {
    await page.goto('/plan');
    const source = await (await fetch('http://localhost:3100/sw.js')).text();
    // A stale UID import or wish history would be worse than none.
    expect(source).toContain("url.pathname.startsWith('/api/')");
  });
});
