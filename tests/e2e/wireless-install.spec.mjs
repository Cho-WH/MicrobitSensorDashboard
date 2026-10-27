import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

async function prepare(page, incompatible = false) {
  await page.route('**/tests/fixtures/bluetooth-diagnostics.mjs', async route => route.fulfill({
    contentType: 'application/javascript', body: await readFile(new URL('../fixtures/bluetooth-diagnostics.mjs', import.meta.url), 'utf8') }));
  // Measurement captures Bluetooth while the app loads; install captures it later.
  // Route both through the fixture before either client is constructed.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', { configurable: true,
      value: { requestDevice: options => window.fixture.bluetooth.requestDevice(options) } });
  });
  await page.goto('/sensors/temperature/?view=preview');
  await page.evaluate(async incompatible => {
    const { bluetoothFixture } = await import('/tests/fixtures/bluetooth-diagnostics.mjs');
    const { getFirmwareArtifact } = await import('/src/device/firmware.js');
    const p = getFirmwareArtifact('sensor-lab-temperature').partial;
    window.fixture = bluetoothFixture({ runtimeHash: incompatible ? '0011223344556677' : p.runtimeHash,
      programHash: '0102030405060708', flash: true, disconnectOnReset: true, disconnectOnFinish: true,
      autoSamples: { [p.programHash]: '26' } });
  }, incompatible);
  await page.locator('#activate-experiment').click();
  await page.locator('[data-guide-group="program"]').click();
  await page.getByRole('button', { name: '무선으로 설치하기', exact: true }).click();
  await expect(page.locator('.guide-program')).toHaveAttribute('data-state', 'ready');
}
test('switches installation method within the same step and hands the installed board to existing measurement UX', async ({ page }) => {
  await prepare(page);
  // An older measurement device must not take precedence over the installed board.
  await page.locator('[data-guide-group="connection"]').click();
  await page.locator('[data-guide-action="connect"]').click();
  await expect(page.locator('.guide-reception')).toHaveAttribute('data-state', 'waiting');
  await page.locator('[data-guide-action="disconnect"]').click();
  await expect(page.locator('[data-guide-action="reconnect"]')).toBeVisible();
  await page.locator('[data-guide-group="program"]').click();
  const startsBeforeInstall = await page.evaluate(() => window.fixture.writes.filter(p => typeof p === 'string').length);
  // Hold the post-transfer reconnect: 100% sent must not look like completion.
  await page.evaluate(() => {
    const f = window.fixture, connect = f.device.gatt.connect.bind(f.device.gatt);
    f.device.gatt.connect = async () => {
      if (f.state.packets) await new Promise(resolve => { window.finishInstall = resolve; });
      return connect();
    };
  });
  await expect(page.locator('.guide-program')).toBeVisible();
  await expect(page.getByRole('button', { name: 'USB로 설치하기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '무선으로 프로그램 설치', exact: true }).click();
  await expect(page.locator('.guide-program progress')).toBeHidden();
  await expect(page.locator('[data-guide-action="program-confirm"]')).toBeHidden();
  await expect(page.locator('[data-guide-action="next"]')).toBeHidden();
  await expect(page.locator('[data-guide-action="cancel-install"]')).toBeEnabled();
  await page.evaluate(() => window.finishInstall());
  await expect(page.locator('.guide-program')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('[data-guide-action="next"]')).toBeEnabled();
  expect(await page.evaluate(() => window.fixture.requests.length)).toBe(2);
  const startsBeforeConnect = await page.evaluate(() => window.fixture.writes.filter(p => typeof p === 'string').length);
  expect(startsBeforeConnect).toBe(startsBeforeInstall);
  await page.locator('[data-guide-action="next"]').click();
  await expect(page.locator('.guide-reception')).toBeVisible();
  await expect(page.locator('[data-guide-action="reconnect"]')).toBeHidden();
  expect(await page.evaluate(() => window.fixture.writes.filter(p => typeof p === 'string').length)).toBe(startsBeforeConnect);
  await page.locator('[data-guide-action="connect"]').click();
  await expect(page.locator('[data-guide-action="disconnect"]')).toBeVisible();
  // This fixture emits a burst, not the sustained reception required for readiness.
  await expect(page.locator('.guide-value strong')).toHaveText('26');
  expect(await page.evaluate(() => window.fixture.requests.length)).toBe(2);
  await page.locator('[data-guide-action="disconnect"]').click();
  await expect(page.locator('[data-guide-action="reconnect"]')).toBeVisible();
});

test('cancelling installation handoff stays cancelled after late unsubscribe and permits another connection', async ({ page }) => {
  await prepare(page);
  await page.locator('[data-guide-action="install"]').click();
  await expect(page.locator('.guide-program')).toHaveAttribute('data-state', 'success');
  await page.locator('[data-guide-action="next"]').click();
  await page.evaluate(() => {
    const f = window.fixture, stop = f.control.stopNotifications;
    f.control.stopNotifications = () => new Promise(resolve => {
      window.finishHandoff = () => { f.control.stopNotifications = stop; resolve(); };
    });
  });
  await page.locator('[data-guide-action="connect"]').click();
  await expect.poll(() => page.evaluate(() => !!window.finishHandoff)).toBe(true);
  await page.locator('[data-guide-action="disconnect"]').click();
  await expect(page.locator('[data-guide-action="connect"]')).toBeEnabled();
  await page.evaluate(() => window.finishHandoff());
  await expect(page.locator('.guide-reception')).toHaveAttribute('data-state', 'disconnected');
  expect(await page.evaluate(() => window.fixture.device.gatt.connected)).toBe(false);
  expect(await page.evaluate(() => window.fixture.writes.some(value => typeof value === 'string'))).toBe(false);
  await page.locator('[data-guide-action="connect"]').click();
  await expect(page.locator('.guide-value strong')).toHaveText('26');
  await page.locator('[data-guide-action="disconnect"]').click();
});

test('manual disconnect followed by a stalled reconnect can be cancelled and retried', async ({ page }) => {
  await prepare(page);
  await page.locator('[data-guide-action="install"]').click();
  await expect(page.locator('.guide-program')).toHaveAttribute('data-state', 'success');
  await page.locator('[data-guide-action="next"]').click();
  await page.locator('[data-guide-action="connect"]').click();
  await expect(page.locator('.guide-value strong')).toHaveText('26');
  await page.locator('[data-guide-action="disconnect"]').click();
  await page.evaluate(() => {
    const gatt = window.fixture.device.gatt, connect = gatt.connect.bind(gatt);
    gatt.connect = () => new Promise(resolve => {
      window.finishReconnect = () => resolve(gatt);
      window.restoreConnect = () => { gatt.connect = connect; };
    });
  });
  await page.locator('[data-guide-action="reconnect"]').click();
  await expect.poll(() => page.evaluate(() => !!window.finishReconnect)).toBe(true);
  await page.locator('[data-guide-action="disconnect"]').click();
  await expect(page.locator('[data-guide-action="reconnect"]')).toBeEnabled();
  await page.evaluate(() => window.restoreConnect());
  await page.locator('[data-guide-action="reconnect"]').click();
  await page.evaluate(() => window.finishReconnect());
  await expect(page.locator('.guide-value strong')).toHaveText('26');
  expect(await page.evaluate(() => window.fixture.device.gatt.connected)).toBe(true);
  await page.locator('[data-guide-action="disconnect"]').click();
});

test('USB connection uses the same guide and still selects a Bluetooth board before receiving', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'USB로 설치하기', exact: true }).click();
  // The program is already present; no hardware USB flash is simulated here.
  await page.evaluate(async () => {
    const { getFirmwareArtifact } = await import('/src/device/firmware.js');
    window.fixture.state.programHash = getFirmwareArtifact('sensor-lab-temperature').partial.programHash;
    const requestDevice = window.fixture.bluetooth.requestDevice.bind(window.fixture.bluetooth);
    window.fixture.bluetooth.requestDevice = args => new Promise(resolve => {
      window.selectBoard = () => resolve(requestDevice(args));
    });
  });
  await page.locator('[data-guide-action="program-confirm"]').click();
  await expect(page.locator('.guide-reception')).toBeVisible();
  await page.locator('[data-guide-action="connect"]').click();
  await expect(page.locator('.guide-reception')).toHaveAttribute('data-state', 'connecting');
  await expect(page.locator('[data-guide-action="measure"]')).toBeHidden();
  await page.evaluate(() => window.selectBoard());
  await expect(page.locator('[data-guide-action="disconnect"]')).toBeVisible();
  await expect(page.locator('.guide-value strong')).toHaveText('26');
  expect(await page.evaluate(() => window.fixture.requests.length)).toBe(1);
  await page.locator('[data-guide-action="disconnect"]').click();
});
test('incompatible board offers USB in place without sending any firmware or mode command', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page, true);
  await page.getByRole('button', { name: '무선으로 프로그램 설치', exact: true }).click();
  await expect(page.locator('.guide-device-status')).toContainText('USB');
  await expect(page.locator('[data-guide-action="install"]')).toBeHidden();
  await expect(page.locator('[data-guide-action="program-confirm"]')).toBeHidden();
  await expect(page.locator('[data-guide-action="next"]')).toBeHidden();
  expect(await page.evaluate(() => window.fixture.writes.some(p => [1, 2, 255].includes(p[0])))).toBe(false);
  await page.getByRole('button', { name: 'USB로 설치하기', exact: true }).click();
  await expect(page.locator('[data-guide-action="install"]')).toContainText('USB');
  await expect(page.getByRole('button', { name: '무선으로 설치하기', exact: true })).toBeVisible();
});

test('exhausted recovery shows the reset action, then retry finishes without resending the program', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.evaluate(() => {
    const f = window.fixture, connect = f.device.gatt.connect.bind(f.device.gatt);
    window.failReconnect = true;
    f.device.gatt.connect = async () => {
      if (f.state.packets && window.failReconnect) throw new DOMException('Rebooting', 'NetworkError');
      return connect();
    };
  });
  await page.getByRole('button', { name: '무선으로 프로그램 설치', exact: true }).click();
  const program = page.locator('.guide-program');
  await expect(program).toHaveAttribute('data-state', 'recovery', { timeout: 20_000 });
  await expect(page.locator('[data-guide-action="program-confirm"]')).toBeHidden();
  await expect(page.locator('[data-guide-action="next"]')).toBeHidden();
  await expect(program.getByRole('button', { name: 'USB로 설치하기', exact: true })).toBeVisible();
  const packets = await page.evaluate(() => window.fixture.state.packets);
  await page.evaluate(() => { window.failReconnect = false; });
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(program).toHaveAttribute('data-state', 'success');
  expect(await page.evaluate(() => window.fixture.state.packets)).toBe(packets);
});
