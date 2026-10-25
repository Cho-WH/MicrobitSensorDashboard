import { test, expect } from '@playwright/test';

const fitsWidth = page => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
const fitsHeight = page => expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(2);

// Other viewport combinations, original samples and analysis navigation are
// covered by the existing workspace suite. Keep this regression on reflection.
test('actual page: reflection height and answers survive reflow', async ({ page }) => {
  await page.goto('/dev/design/?sensor=bmp280&state=paused&view=relationship');
  await expect(page.locator('html')).toHaveAttribute('data-review-ready', 'paused');
  await page.locator('#use-graph-for-reflection').click();
  const answer = page.locator('#reflection-observation');
  const written = '측정 조건을 일정하게 두고 관찰한 결과입니다. '.repeat(20);
  await answer.fill(written);
  for (const [width, height] of [[1366,768], [320,700]]) {
    await page.setViewportSize({ width, height });
    await fitsWidth(page);
    if (width >= 1366) await fitsHeight(page);
    await expect(answer).toHaveValue(written);
    await expect(page.locator('#reflection-print-button')).toBeVisible();
    await expect.poll(() => page.locator('.reflection-chart-stage').evaluate(node => node.clientHeight)).toBeGreaterThanOrEqual(200);
  }
  await page.setViewportSize({ width:1366, height:768 });
  await fitsHeight(page);
  // Font enlargement is deliberately allowed to create vertical scrolling.
  await page.locator('html').evaluate(node => { node.style.fontSize = '200%'; });
  await fitsWidth(page);
  await expect(answer).toHaveValue(written);
});

// Lazy loading, wire steps and resize lifetime remain in guide/preparation.
test('actual page: 3D network failure preserves wiring and retry recovers', async ({ page }) => {
  await page.goto('/dev/design/preparation.html?sensor=bmp280');
  await expect(page.locator('html')).toHaveAttribute('data-preparation-review-ready', 'true');
  const frame = page.locator('.guide-frame');
  await page.locator('[data-guide-group="wiring"]').click();
  await expect(page.locator('.guide-model')).toHaveAttribute('data-viewer-state', 'applied');
  await expect(page.frameLocator('.guide-frame').locator('#viewport canvas')).toBeVisible();
  await page.route('**/public/viewers/bmp280/index.html*', route => route.abort());
  // A real failed reload exercises the timeout/fallback rather than dispatching
  // an iframe error event, which browsers do not reliably emit for navigation.
  await frame.evaluate(node => { node.src = node.src; });
  await expect(page.locator('.guide-model')).toHaveAttribute('data-viewer-state', 'unavailable');
  await expect(page.locator('.guide-wiring tbody tr')).toHaveCount(4);
  await page.unroute('**/public/viewers/bmp280/index.html*');
  await page.locator('[data-guide-action="retry-model"]').click();
  await expect(page.locator('.guide-model')).toHaveAttribute('data-viewer-state', 'applied');
});
