import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

for (const [sensor, width] of [['temperature',1366],['magnetometer',390]]) {
  test(`USB help offers verified ${sensor} file without marking installation complete at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:844});
    await page.addInitScript(() => Object.defineProperty(navigator,'usb',{configurable:true,value:undefined}));
    await page.goto(`/sensors/${sensor}/`);
    await page.locator('[data-guide-group="program"]').click();
    await expect(page.locator('.guide-program')).toHaveAttribute('data-state','unavailable');
    const help = page.locator('[data-installation-help]'), dialog = page.locator('#installation-troubleshooting');
    await help.click();
    await expect(dialog).toBeVisible();
    await expect(page.locator('#installation-program-name')).toContainText(await page.locator('.guide-program-target').innerText());
    await expect(dialog.locator('h2')).toBeFocused();
    const fileUrl = `**/public/firmware/sensor-lab-${sensor}-v1.hex`;
    const download = page.locator('#download-program');
    if (sensor === 'temperature') {
      await page.route(fileUrl,route=>route.fulfill({body:':corrupt',contentType:'text/plain'}));
      await download.click();
      await expect(page.locator('#installation-download-status')).not.toBeEmpty();
      await expect(download).toBeEnabled();
      await expect(page.locator('.guide-program')).toHaveAttribute('data-state','unavailable');
      await page.unroute(fileUrl);
    }
    const downloaded = page.waitForEvent('download');
    await download.click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toBe(`sensor-lab-${sensor}-v1.hex`);
    const received = await readFile(await file.path(),'utf8');
    const expected = await readFile(new URL(`../../public/firmware/sensor-lab-${sensor}-v1.hex`,import.meta.url),'utf8');
    expect(received).toBe(expected.replace(/\r\n/g,'\n'));
    await expect(page.locator('.guide-program')).toHaveAttribute('data-state','unavailable');
    await expect(page.locator('[data-guide-step="program"]')).toHaveAttribute('data-complete','false');
    await page.setViewportSize({width,height:420});
    await expect(dialog.getByRole('button',{name:'닫기',exact:true})).toBeInViewport({ratio:1});
    await page.keyboard.press('Escape');
    await expect(help).toBeFocused();
  });
}
