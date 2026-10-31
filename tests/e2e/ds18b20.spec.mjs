import { chooseTourDevice } from './support/tour.mjs';
import { test, expect } from '@playwright/test';

// Protect the external sensor's route, optional probe and shared preparation viewer.
// Recording/analysis exercise the existing shared flow once, on desktop.
for (const width of [1440, 320]) {
  test(`DS18B20 wiring and preparation${width === 1440 ? ', recording and analysis' : ''} at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/lab.html?mock=1');
    await page.locator('#sensor-cards a[href*="/sensors/ds18b20/"]').click();
    await expect(page).toHaveURL(/\/sensors\/ds18b20\/.*view=preview/);
    await page.locator('#activate-experiment').click();
    await expect(page.locator('[data-screen="prepare"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('equipment.png'), fullPage: true });
    await page.locator('[data-guide-action="confirm"]').click();
    await expect(page.locator('.guide-model')).toHaveAttribute('data-viewer-state', 'applied');
    await page.locator('.wiring-choices select[name="probes"]').selectOption('1');
    await expect(page.locator('.guide-model')).toHaveAttribute('data-viewer-state', 'applied');
    await page.locator('[data-guide-action="table"]').click();
    const table = page.locator('.guide-wiring');
    await expect(table).toBeVisible();
    for (const pin of ['VDD', 'GND', 'DQ', 'P1', 'P2']) await expect(table).toContainText(pin);
    await page.screenshot({ path: testInfo.outputPath('wiring.png'), fullPage: true });
    for (const id of ['vcc', 'gnd', 'dq1', 'dq2']) {
      await expect(page.locator(`[data-guide-step="${id}"]`)).toHaveAttribute('aria-current', 'step');
      await page.locator('[data-guide-action="confirm"]').click();
      await expect(page.locator(`[data-guide-step="${id}"]`)).toHaveAttribute('data-complete', 'true');
    }
    await page.locator('[data-guide-action="program-confirm"]').click();
    await page.locator('[data-guide-action="connect"]').click();
  await chooseTourDevice(page);
    await expect(page.locator('[data-guide-step="reception"]')).toHaveAttribute('data-complete', 'true');
    await page.locator('#to-measure').click();
    const dialog = page.locator('.experiment-guide');
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('probe-guide.png'), fullPage: true });
    await dialog.locator('[data-guide-next]').click();
    await expect(page.locator('#start-recording')).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('measure.png'), fullPage: true });
    if (width === 320) return;
    await page.locator('#start-recording').click();
    await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-recording-state', 'recording');
    await page.locator('#capture-continuous-point').click();
    await page.locator('#finish-recording').click();
    await expect(page.locator('#additional-recording')).toBeEnabled();
    await page.locator('[data-view="analysis"]').click();
    await expect(page.locator('#analysis-source')).toBeEnabled();
    await page.locator('#analysis-source').selectOption('points');
    await page.screenshot({ path: testInfo.outputPath('analysis.png'), fullPage: true });
    await page.locator('.luminous-export > summary').click();
    const pending = page.waitForEvent('download');
    await page.locator('#export-points-csv').click();
    const download = await pending, chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    const imported = await page.evaluate(async text => {
      const { parseExperimentCsv } = await import('/src/data/files/csv.js');
      return parseExperimentCsv(text);
    }, csv);
    expect(imported.samples).toHaveLength(1);
    const temperatures = imported.run.context.channels.filter(channel => channel.unit === '℃');
    expect(temperatures).toHaveLength(2);
    for (const temperature of temperatures) {
      const value = imported.samples[0].values[temperature.id];
      expect(Number.isFinite(value)).toBe(true);
      expect(value * 16).toBe(Math.round(value * 16));
    }
  });
}

test('one-probe point recording preserves absent channels when the connected probe changes', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tests/browser/');
  await page.evaluate(async () => {
    const { mountLabFixture } = await import('/tests/browser/lab-fixture.js');
    const { startApp } = await import('/src/app/startup.js');
    const { createRepository } = await import('/src/data/repository.js');
    const { createTransport } = await import('/src/device/transport.js');
    const fixture = await mountLabFixture(), repository = createRepository({ databaseName: 'probe-test-' + crypto.randomUUID() });
    let notify;
    const ble = { isSupported: () => true, requestDevice: async () => ({ name: 'test micro:bit' }),
      async connect() {}, async startNotifications(handler) { notify = handler; },
      setDisconnectedListener() {}, async sendStartCommand() {}, async disconnect() {} };
    const app = await startApp(fixture.host, { repository, deviceTransport: createTransport({ ble }), historyEnabled: false,
      initialUrl: new URL('/sensors/ds18b20/?mock=1&view=measure', location.href).href });
    window.probeTest = { app, send: line => notify(line), snapshot: () => repository.readSnapshot(app.getState().storage.id) };
  });
  await page.locator('.experiment-guide-close').click();
  await page.locator('button[data-recording-mode="point"]').click();
  await page.locator('.luminous-settings').click();
  await page.locator('#connect').click();
  await page.locator('.luminous-close').click();
  for (const line of ['23.9375,', ',-10.0625']) {
    for (let i = 0; i < 3; i++) {
      await page.evaluate(line => window.probeTest.send(line), line);
      await page.clock.runFor(1000);
    }
    await expect(page.locator('#capture-point')).toBeEnabled();
    await page.locator('#capture-point').click();
    await expect.poll(() => page.evaluate(() => window.probeTest.app.getState().busy)).toBe(false);
  }
  await page.locator('#finish-recording').click();
  await expect(page.locator('#additional-recording')).toBeEnabled();
  const snapshot = await page.evaluate(() => window.probeTest.snapshot());
  expect(snapshot.samples.map(sample => sample.values)).toEqual([
    { temperature1C: 23.9375, temperature2C: null },
    { temperature1C: null, temperature2C: -10.0625 },
  ]);
  expect(snapshot.samples.map(sample => sample.validity)).toEqual([
    { temperature1C: 'valid', temperature2C: 'missing' },
    { temperature1C: 'missing', temperature2C: 'valid' },
  ]);
  expect(snapshot.pointRecords).toHaveLength(2);
  await page.locator('[data-view="analysis"]').click();
  await expect(page.locator('#analysis-source')).toHaveValue('points');
});
