import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test('built app resolves routes, lazy assets and USB preparation under a hosting subdirectory', async ({ page }) => {
  const failures = [], requests = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => requests.push(request.url()));
  await page.goto('/dist/');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
  expect(requests.some(url => url.includes('PretendardVariable.woff2') || /microbit-usb|\.hex$/.test(url))).toBe(false);
  await page.locator('#sensor-cards a[href*="/sensors/temperature/"]').click();
  await expect(page).toHaveURL(/\/dist\/sensors\/temperature\/\?view=preview/);
  await expect(page.locator('#tool-share-inline svg')).toBeVisible();
  await page.locator('#activate-experiment').click();
  await page.locator('[data-guide-group="program"]').click();
  await expect(page.locator('.guide-program')).toHaveAttribute('data-state', 'ready');
  expect(requests.some(url => /\/dist\/assets\/microbit-usb-.*\.js$/.test(url))).toBe(true);
  expect(requests.some(url => /\/dist\/public\/firmware\/.*\.hex$/.test(url))).toBe(true);
  // Preparation must not open a hardware chooser or claim installation success.
  await expect(page.locator('[data-guide-action="install"]')).toBeEnabled();
  expect(failures).toEqual([]);
});

test('built app opens stored data, exports PNG and displays late-loaded guidance', async ({ page }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto('/dist/sensors/magnetometer/?mock=1&view=measure');
  const guide = page.locator('.experiment-guide');
  await expect(guide).toBeVisible();
  await expect.poll(() => guide.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await guide.locator('[data-guide-next]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#open-file').click();
  await (await chooser).setFiles(fileURLToPath(new URL('../fixtures/gay-lussac-v2.json', import.meta.url)));
  await expect(page.locator('[data-screen="analysis"]')).toBeVisible();
  await page.locator('#tab-relationship').click();
  await expect(page.locator('#analysis-chart')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('[data-export="png"]').click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  expect(failures).toEqual([]);
});
