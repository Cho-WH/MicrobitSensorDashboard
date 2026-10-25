import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// A real insecure origin: localhost and overriding isSecureContext do not
// reproduce the missing secure-context APIs on a LAN HTTP address.
test.use({ launchOptions: { args: ['--host-resolver-rules=MAP sensor-lab.test 127.0.0.1', '--no-proxy-server'] } });

test('HTTP opens the lab and supports imported file analysis and calculated columns', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://sensor-lab.test:8081/lab.html');
  expect(await page.evaluate(() => ({ secure: isSecureContext, uuid: typeof crypto.randomUUID })))
    .toEqual({ secure: false, uuid: 'undefined' });
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
  await expect(page.locator('#connection-notice')).toHaveAttribute('data-support', 'insecure');

  const chooser = page.waitForEvent('filechooser');
  await page.locator('#open-file').click();
  await (await chooser).setFiles(fileURLToPath(new URL('../fixtures/gay-lussac-v2.json', import.meta.url)));
  await expect(page.locator('[data-screen="analysis"]')).toBeVisible();
  await page.locator('#overview-table-toggle').click();
  await expect(page.locator('#raw-rows tr').first()).toBeVisible();
  await page.locator('[data-add-calculation]').click();
  await page.locator('#calculation-menu > button').last().click();
  await expect(page.locator('#calculation-dialog')).toBeVisible();
  await page.locator('[data-operand="rhs"] [data-value]').fill('1');
  await page.locator('#calculation-dialog [type="submit"]').click();
  await expect(page.locator('#calculation-dialog')).not.toBeVisible();
  await expect(page.locator('[data-calculation-menu]').first()).toBeVisible();
  await expect(page.locator('#lab-error')).toBeHidden();
  expect(errors).toEqual([]);
});
