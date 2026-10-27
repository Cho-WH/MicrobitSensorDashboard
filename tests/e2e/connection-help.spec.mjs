import { test, expect } from '@playwright/test';

for (const width of [1366, 390]) test(`shared connection help preserves device and recording state at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/sensors/temperature/?mock=1');
  await page.locator('[data-guide-group="connection"]').click();
  const dialog=page.locator('#connection-troubleshooting');
  const guideHelp=page.locator('.guide-device-actions [data-connection-help]');
  await guideHelp.click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('#connection-troubleshooting-title')).toBeFocused();
  await expect(dialog.locator('img')).toHaveJSProperty('complete',true);
  expect(await dialog.locator('img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  const box=await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
  // The close action remains reachable even in a short viewport.
  await page.setViewportSize({width,height:420});
  await expect(dialog.getByRole('button',{name:'닫기',exact:true})).toBeInViewport({ratio:1});
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();await expect(guideHelp).toBeFocused();
  await page.setViewportSize({width,height:844});
  // Merely opening help must not connect a device.
  await expect(page.locator('[data-guide-action="connect"]')).toBeVisible();
  await page.locator('[data-guide-action="connect"]').click();
  await expect(page.locator('[data-guide-step="reception"]')).toHaveAttribute('data-complete','true');
  await page.locator('#to-measure').click();
  await page.locator('.experiment-guide [data-guide-next]').click();
  await page.locator('#start-recording').click();
  const screen=page.locator('[data-screen="measure"]');
  const measureHelp=page.locator('.luminous-device [data-connection-help]');
  await measureHelp.click();await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'연결 도움말 닫기',exact:true}).click();
  await expect(measureHelp).toBeFocused();
  await expect(screen).toHaveAttribute('data-recording-state','recording');
  await expect(page.locator('#connection-status')).toHaveText('모의 연결');
  await page.locator('.luminous-settings').click();
  const settings=page.locator('#measurement-settings');
  const settingsHelp=settings.locator('[data-connection-help]');
  await settingsHelp.click();await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeVisible();await expect(settingsHelp).toBeFocused();
  await expect(screen).toHaveAttribute('data-recording-state','recording');
});
