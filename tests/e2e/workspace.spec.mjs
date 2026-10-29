import { test, expect } from '@playwright/test';

const fitsWidth = page => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

test('elapsed time ticks reflow without changing coordinates and restore numeric axes', async ({ page }) => {
  await page.goto('/dev/design/?sensor=bmp280&state=paused&view=relationship');
  await expect(page.locator('html')).toHaveAttribute('data-review-ready', 'paused');
  await page.selectOption('#graph-x', 'receivedAt');
  const readAxis = () => page.evaluate(() => {
    const chart = globalThis.Chart.getChart(document.querySelector('#analysis-chart'));
    return { title:chart.scales.x.options.title.text, labels:chart.scales.x.ticks.map(tick => tick.label),
      points:chart.data.datasets[0].data.map(point => [point.x, point.y, point.receivedAt]) };
  });
  const before = await readAxis();
  expect(before.points[0][0]).toBe(0);
  for (const width of [320, 1366]) {
    await page.setViewportSize({width,height:844});
    await expect.poll(() => page.evaluate(() => {
      const chart = globalThis.Chart.getChart(document.querySelector('#analysis-chart'));
      return Math.abs(chart.width - chart.canvas.parentElement.clientWidth);
    })).toBeLessThanOrEqual(1);
    const current = await readAxis();
    expect(current.title).toBe('경과 시간');
    expect(current.labels.every(label => /[초분]/.test(label) && !label.includes('시'))).toBe(true);
    expect(new Set(current.labels).size).toBe(current.labels.length);
    expect(current.points).toEqual(before.points);
    await fitsWidth(page);
  }
  await page.selectOption('#graph-x', 'temperatureC');
  const numeric = await readAxis();
  expect(numeric.title).toContain('온도');
  expect(numeric.labels.every(label => !/[초분시]/.test(label))).toBe(true);
});

test('axis settings collapse without hidden focus targets across screen sizes and reduced motion', async ({ page }) => {
  await page.goto('/dev/design/?sensor=bmp280&state=paused&view=relationship');
  await expect(page.locator('html')).toHaveAttribute('data-review-ready', 'paused');
  const toggle=page.locator('#toggle-axis-settings'), panel=page.locator('#axis-settings-panel');
  for (const width of [320, 1366]) {
    await page.setViewportSize({width,height:844});
    if (width === 320) {
      await expect(toggle).toHaveAttribute('aria-expanded','false');
      await toggle.click();
    }
    // A deliberate expansion stays open when resizing to desktop.
    await expect(toggle).toHaveAttribute('aria-expanded','true');
    await toggle.focus(); await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('#axis-summary')).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await panel.evaluate(node=>node.contains(document.activeElement))).toBe(false);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded','true');
    await expect(panel).not.toHaveAttribute('inert','');
    await fitsWidth(page);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await toggle.click(); await toggle.click(); await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Tab');
  expect(await panel.evaluate(node => node.contains(document.activeElement))).toBe(false);
});

test('actual page: shell reflow preserves file-button focus and preview guidance', async ({ page }) => {
  await page.goto('/sensors/temperature/?mock=1&view=measure');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
  await page.locator('.experiment-guide [data-guide-next]').click();
  const open = page.locator('#open-file');
  await open.focus();
  for (const width of [320, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(open).toBeFocused();
    await expect(open).toHaveCount(1);
  }
  const chooser = page.waitForEvent('filechooser');
  await open.press('Enter');
  await chooser;
  const settings = page.locator('.luminous-settings');
  await settings.focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(settings).toBeFocused();
});

// Other viewport combinations, original samples and analysis navigation are
// covered by the existing workspace suite. Keep this regression on reflection.
test('actual page: reflection answers and print action survive reflow', async ({ page }) => {
  await page.goto('/dev/design/?sensor=bmp280&state=paused&view=relationship');
  await expect(page.locator('html')).toHaveAttribute('data-review-ready', 'paused');
  await page.locator('#use-graph-for-reflection').click();
  const answer = page.locator('#reflection-observation');
  const written = '측정 조건을 일정하게 두고 관찰한 결과입니다. '.repeat(20);
  await answer.fill(written);
  for (const [width, height] of [[1366,768], [320,700]]) {
    await page.setViewportSize({ width, height });
    await fitsWidth(page);
    await expect(answer).toHaveValue(written);
    await expect(page.locator('#reflection-print-button')).toBeVisible();
  }
  await page.setViewportSize({ width:1366, height:768 });
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
