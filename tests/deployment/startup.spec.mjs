import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test('initial render and reload keep the shell stable after fonts become available', async ({page}, info) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(() => {
    window.startupShifts = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.startupShifts.push(entry.value);
    }).observe({type:'layout-shift',buffered:true});
  });
  for (const reload of [false,true]) {
    if (reload) await page.reload(); else await page.goto('/dist/');
    await expect(page.locator('[data-screen="home"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.startupShifts.reduce((sum,value)=>sum+value,0))).toBeLessThan(0.01);
    await page.screenshot({path:info.outputPath(reload?'reload.png':'initial.png')});
  }
});

test('a late or failed base font cannot block interaction or replace the chosen fallback', async ({page}) => {
  let release;
  const gate = new Promise(resolve => { release=resolve; });
  await page.route('**/lab-fonts/core-*.woff2', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/dist/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('[data-screen="home"]')).toBeVisible();
    const chosen = await page.evaluate(() => document.documentElement.style.getPropertyValue('--sl-font'));
    expect(chosen).toContain('system-ui');
    expect(chosen).not.toContain('Sensor Lab Sans');
    await page.locator('#sensor-cards a[href*="/sensors/temperature/"]').click();
    await expect(page.locator('[data-screen="preview"]')).toBeVisible();
    release();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--sl-font'))).toBe(chosen);
  } finally { release(); }
  await page.unroute('**/lab-fonts/core-*.woff2');
  await page.route('**/lab-fonts/core-*.woff2', route => route.abort());
  await page.reload();
  await expect(page.locator('[data-screen="preview"]')).toBeVisible();
  await expect(page.locator('#activate-experiment')).toBeEnabled();
});

test('built app resolves routes, lazy assets and USB preparation under a hosting subdirectory', async ({ page }) => {
  const failures = [], requests = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => requests.push(request.url()));
  await page.goto('/dist/');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
  expect(requests.some(url => /microbit-usb|\.hex$/.test(url))).toBe(false);
  const font = await page.locator('[data-app-font]').getAttribute('href');
  expect(requests.some(url => url.endsWith(font))).toBe(true);
  await page.locator('#sensor-cards a[href*="/sensors/temperature/"]').click();
  await expect(page).toHaveURL(/\/dist\/sensors\/temperature\/\?view=preview/);
  await expect(page.locator('#tool-share-inline svg')).toBeVisible();
  await page.locator('#activate-experiment').click();
  await page.locator('[data-guide-group="program"]').click();
  await expect(page.locator('.guide-program')).toHaveAttribute('data-state', 'ready');
  expect(requests.some(url => /\/dist\/assets\/microbit-usb-.*\.js$/.test(url))).toBe(true);
  expect(requests.some(url => /\/dist\/assets\/static\/.*\.hex$/.test(url))).toBe(true);
  // Preparation must not open a hardware chooser or claim installation success.
  await expect(page.locator('[data-guide-action="install"]')).toBeEnabled();
  await page.locator('[data-guide-group="connection"]').click();
  await page.locator('.guide-device-actions [data-connection-help]').click();
  const help = page.locator('#connection-troubleshooting');
  await expect.poll(() => help.locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await help.getByRole('button', {name:'닫기',exact:true}).click();
  await page.locator('#to-measure').click();
  await page.locator('.experiment-guide [data-guide-next]').click();
  await expect.poll(() => page.locator('.luminous-device img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  expect(failures).toEqual([]);
});

test('built app opens stored data, exports PNG and displays late-loaded guidance', async ({ page }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto('/dist/sensors/magnetometer/?view=measure');
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

test('background program download does not block manual preparation or navigation', async ({ page }) => {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const loading = new Promise(resolve => { started = resolve; });
  await page.route('**/*.hex', async route => { started(); await gate; await route.continue(); });
  try {
    await page.goto('/dist/sensors/temperature/?view=prepare');
    await loading;
    const confirm = page.locator('[data-guide-action="confirm"]');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.locator('[data-guide-action="install"]')).toBeDisabled();
    await page.locator('[data-guide-action="program-confirm"]').click();
    await expect(page.locator('#to-measure')).toBeEnabled();
    await page.locator('#to-measure').click();
    await expect(page.locator('[data-screen="measure"]')).toBeVisible();
  } finally { release(); }
});

test('versioned 3D guidance resolves its shared modules below a hosting subdirectory', async ({ page, request }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto('/dist/sensors/bmp280/?view=prepare');
  await page.locator('[data-guide-group="wiring"]').click();
  const viewer = page.locator('#guide-host iframe');
  await expect(viewer).toHaveAttribute('src', /\/assets\/scene-.*\/public\/viewers\/wiring\//);
  await expect(viewer.contentFrame().locator('#stage canvas')).toBeVisible();
  await expect(viewer.contentFrame().locator('#error')).toBeHidden();
  // The other 3D entry point uses this same versioned tree and no stale source modules.
  const src = await viewer.getAttribute('src');
  const scene = src.slice(0, src.indexOf('/public/viewers/')) + '/src/catalog/sensors/magnetometer/calibration-scene.js';
  const loaded = await page.evaluate(async url => typeof (await import(url)).createCalibrationScene, scene);
  expect(loaded).toBe('function');
  expect((await request.get(scene)).status()).toBe(200);
  expect(failures).toEqual([]);
});
