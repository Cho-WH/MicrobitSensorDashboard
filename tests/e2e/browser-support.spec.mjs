import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Exercise capability branches in isolated Chromium; this is not a physical iOS/BLE test.
async function environment(page, { api = false, ios = true, secure = true, blocked = false } = {}) {
  await page.addInitScript(({ api, ios, secure, blocked }) => {
    window.bluetoothRequests = 0;
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: api ? {
      requestDevice() { window.bluetoothRequests++; return Promise.reject(new DOMException('cancelled', 'NotFoundError')); },
      getAvailability() { throw new Error('unexpected hardware probe'); },
    } : undefined });
    if (ios) {
      // iPad desktop user agent: detection must also consider touch capability.
      Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
    }
    if (!secure) Object.defineProperty(window, 'isSecureContext', { value: false });
    if (blocked) Object.defineProperty(document, 'permissionsPolicy', { value: { allowsFeature: () => false } });
  }, { api, ios, secure, blocked });
}

test('connection guidance precedes preparation and leaves file analysis accessible on unsupported iOS', async ({ page }) => {
  await environment(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lab.html');
  const notice = page.locator('#connection-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('data-screen-context', 'home');
  await expect(page.locator('#connection-help')).not.toHaveAttribute('open', '');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('#connection-bluefy')).toHaveAttribute('href', 'https://apps.apple.com/kr/app/bluefy-web-ble-browser/id1492822055');
  await expect(page.locator('#connection-bluefy')).toBeVisible();
  // Keep the user's system clipboard untouched while checking the exact current route.
  await page.evaluate(() => {
    window.copiedAddresses = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { window.copiedAddresses.push(text); },
    } });
  });
  await page.locator('#connection-copy-address').click();
  await expect.poll(() => page.evaluate(() => window.copiedAddresses.at(-1))).toBe(page.url());
  await page.locator('#sensor-cards a[href*="/temperature/"]').click();
  await expect(notice).toHaveAttribute('data-screen-context', 'preview');
  await page.locator('#activate-experiment').click();
  await expect(notice).toHaveAttribute('data-screen-context', 'prepare');
  await page.locator('#connection-copy-address').click();
  await expect.poll(() => page.evaluate(() => window.copiedAddresses.at(-1))).toBe(page.url());
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.locator('#connection-copy-address').click();
  await expect(page.locator('#connection-address')).toBeVisible();
  await expect(page.locator('#connection-address')).toHaveValue(page.url());
  await expect(page.locator('#connection-address')).toBeFocused();
  await page.locator('[data-guide-group="connection"]').click();
  await expect(page.locator('[data-guide-action="connect"]')).toBeDisabled();
  await page.locator('#connection-help summary').click();
  await expect(page.locator('#connection-ios-help')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.bluetoothRequests)).toBe(0);

  const chooser = page.waitForEvent('filechooser');
  await page.locator('#open-file').click();
  await (await chooser).setFiles(fileURLToPath(new URL('../fixtures/gay-lussac-v2.json', import.meta.url)));
  await expect(page.locator('[data-screen="analysis"]')).toBeVisible();
  await expect(notice).toBeHidden();
  await expect(page.locator('#lab-error')).toBeHidden();
  await page.locator('#overview-table-toggle').click();
  await expect(page.locator('#raw-rows tr').first()).toBeVisible();
});

test('an iOS browser exposing Bluetooth and the mock route receive no unsupported notice or automatic chooser', async ({ page }) => {
  await environment(page, { api: true });
  await page.goto('/sensors/temperature/');
  await expect(page.locator('[data-screen="prepare"]')).toBeVisible();
  await expect(page.locator('#connection-notice')).toBeHidden();
  await page.locator('[data-guide-group="connection"]').click();
  await expect(page.locator('[data-guide-action="connect"]')).toBeEnabled();
  expect(await page.evaluate(() => window.bluetoothRequests)).toBe(0);
  await page.locator('[data-guide-action="connect"]').click();
  await expect.poll(() => page.evaluate(() => window.bluetoothRequests)).toBe(1);

  const mockPage = await page.context().newPage();
  try {
    await environment(mockPage, { api: false });
    await mockPage.goto('/sensors/temperature/?mock=1');
    await expect(mockPage.locator('[data-screen="prepare"]')).toBeVisible();
    await expect(mockPage.locator('#connection-notice')).toBeHidden();
  } finally { await mockPage.close(); }
});

for (const [reason, options] of [['insecure', { secure: false }], ['blocked', { api: true, blocked: true }]]) {
  test(`connection guidance distinguishes ${reason} from needing another browser`, async ({ page }) => {
    await environment(page, options);
    await page.goto('/sensors/temperature/?view=measure');
    await expect(page.locator('#connection-notice')).toBeVisible();
    await expect(page.locator('#connection-notice')).toHaveAttribute('data-support', reason);
    await expect(page.locator('#connection-bluefy')).toBeHidden();
    await page.locator('.luminous-settings').click();
    await expect(page.locator('#connect')).toBeDisabled();
    expect(await page.evaluate(() => window.bluetoothRequests)).toBe(0);
  });
}
