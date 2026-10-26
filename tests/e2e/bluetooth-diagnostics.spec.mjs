import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { bluetoothFixture } from '../fixtures/bluetooth-diagnostics.mjs';
import { trialPrograms } from '../../dev/bluetooth-install/firmware/programs.js';

// The local command bridge has one shared command slot; keep this file sequential.
test.describe.configure({ mode: 'default' });

const url = '/dev/bluetooth-install/';
const openManual = page => page.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
async function fake(page, options = {}) {
  await page.addInitScript(`window.bleTrial = (${bluetoothFixture.toString()})(${JSON.stringify(options)});
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: window.bleTrial.bluetooth });`);
}
test('development page offers the trial image for setup/recovery and exports unsupported context without connecting', async ({ page, request }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: undefined }));
  await page.goto(url);
  const trialLinks = page.locator('a[download="temperature-pairing-trial-v1.hex"]');
  const hrefs = await trialLinks.evaluateAll(links => links.map(link => link.href));
  const downloadResponse = await request.get(hrefs[0]); expect(downloadResponse.ok()).toBe(true);
  const trialSource = (await downloadResponse.text()).replace(/\r\n/g, '\n');
  expect(createHash('sha256').update(trialSource).digest('hex')).toBe(trialPrograms.find(p => p.id === 'temperature').hexSha256);
  await expect(page.locator('#choose')).toBeDisabled();
  await expect(page.locator('#pair')).toBeDisabled();
  await page.locator('#memo').fill('A · 연결 전 기준선');
  const downloading = page.waitForEvent('download');
  await page.locator('#save-log').click();
  const download = await downloading;
  const data = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(data.context.memo).toBe('A · 연결 전 기준선');
  expect(data.environment.bluetooth).toBe('unsupported');
});
test('current firmware can be diagnosed and measured without any reset or firmware write', async ({ page }) => {
  await fake(page, { fixedFrame: true });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await openManual(page);
  expect(await page.evaluate(() => window.bleTrial.requests.length)).toBe(0);
  await page.locator('#choose').click();
  await expect(page.locator('#model')).toHaveText('BBC micro:bit V2');
  await expect(page.locator('#regions')).toContainText('11f3cd7e54807276');
  await page.locator('#candidate').check();
  await expect(page.locator('#pair')).toBeDisabled();
  await expect(page.locator('#mode-hint')).toContainText('pairing_mode: 0');
  await page.locator('#temperature-confirm').check();
  await page.locator('#start-uart').click();
  await expect(page.locator('#stop-uart')).toBeEnabled();
  expect(await page.evaluate(() => [window.bleTrial.state.connects, window.bleTrial.state.disconnects])).toEqual([1, 0]);
  await page.evaluate(() => window.bleTrial.line('25\n26\n'));
  await expect(page.locator('#line-count')).toHaveText('2');
  await expect(page.locator('#last-line')).toHaveText('26');
  await page.locator('#stop-uart').click();
  await expect(page.locator('#connection-state')).toHaveText('연결 안 됨');
  expect(await page.evaluate(() => window.bleTrial.writes)).toEqual([[0xee], [0, 1], [0, 2], 'start\n', 'stop\n']);
  await page.locator('#reconnect').click();
  await expect(page.locator('#mode')).toHaveText('1 · 일반 실행');
  expect(errors).toEqual([]);
});
test('local commands run a round trip and expose evidence without further browser interaction', async ({ page, request }) => {
  const temperature = trialPrograms.find(p => p.id === 'temperature'), light = trialPrograms.find(p => p.id === 'light-level');
  await fake(page, { flash: true, disconnectOnReset: true, disconnectOnFinish: true,
    runtimeHash: temperature.runtimeHash, programHash: temperature.programHash,
    autoSamples: { [temperature.programHash]: '25', [light.programHash]: '120' } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  expect(await page.evaluate(() => window.bleTrial.requests.length)).toBe(0);
  await page.locator('#choose').click();
  await page.locator('#remote-control').check();
  const base = '/__dev/bluetooth-trial';
  await expect.poll(async () => (await (await request.get(base + '/status')).json()).armed).toBe(true);
  const command = await request.post(base + '/command', { headers: { 'X-Sensor-Lab-Trial': '1' }, data: { action: 'run', plan: 'quick' } });
  expect(command.ok()).toBe(true);
  await expect.poll(async () => (await (await request.get(base + '/status')).json()).state?.status, { timeout: 45000 }).toBe('passed');
  const saved = await (await request.get(base + '/log')).json();
  expect(saved.snapshot.state.steps.map(step => step.id)).toEqual(['light-level', 'temperature']);
  expect(saved.snapshot.log.entries.some(entry => entry.kind === 'trial-program-verified')).toBe(true);
  expect(await page.evaluate(() => window.bleTrial.requests.length)).toBe(1);
  expect(await page.evaluate(() => [window.bleTrial.state.connects, window.bleTrial.state.disconnects])).toEqual([5, 4]);
  expect(errors).toEqual([]);
  await page.locator('#remote-control').uncheck();
  await expect.poll(async () => (await (await request.get(base + '/status')).json()).online).toBe(false);
});

test('local cancellation stops the suite and releases controls', async ({ page, request }) => {
  const temperature = trialPrograms.find(p => p.id === 'temperature');
  await fake(page, { flash: true, runtimeHash: temperature.runtimeHash, programHash: temperature.programHash });
  await page.goto(url); await page.locator('#choose').click(); await page.locator('#remote-control').check();
  const base = '/__dev/bluetooth-trial', headers = { 'X-Sensor-Lab-Trial': '1' };
  await expect.poll(async () => (await (await request.get(base + '/status')).json()).armed).toBe(true);
  expect((await request.post(base + '/command', { headers, data: { action: 'run', plan: 'quick' } })).ok()).toBe(true);
  await expect.poll(async () => (await (await request.get(base + '/status')).json()).state?.status).toBe('running');
  expect((await request.post(base + '/command', { headers, data: { action: 'cancel' } })).ok()).toBe(true);
  await expect.poll(async () => (await (await request.get(base + '/status')).json()).state?.status).toBe('cancelled');
  await expect.poll(async () => (await (await request.get(base + '/status')).json()).busy).toBe(false);
  await expect(page.locator('#auto-start')).toBeEnabled();
  await page.locator('#remote-control').uncheck();
  await expect.poll(async () => (await (await request.get(base + '/status')).json()).online).toBe(false);
});
