import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBluetoothProgrammer } from '../../src/device/bluetooth-programmer.js';
import { createDiagnostics } from '../../src/device/bluetooth-protocol.js';
import { getFirmwareArtifact, getFirmwareIdentity, firmwareManifest } from '../../src/device/firmware.js';
import { getExperiment, getSensorRuntime } from '../../src/catalog/index.js';
import { bluetoothFixture } from '../fixtures/bluetooth-diagnostics.mjs';
import { staleFirmware } from '../../src/device/stale-firmware.js';
import { createTransport } from '../../src/device/transport.js';
import { retryConnection } from '../../src/device/connection-retry.js';
import { createBleClient } from '../../src/device/ble-client.js';
const artifact = getFirmwareArtifact('sensor-lab-temperature');
async function setup(options = {}, overrides = {}) {
  const f = bluetoothFixture({ runtimeHash: artifact.partial.runtimeHash, programHash: '0102030405060708',
    disconnectOnReset: true, flash: true, disconnectOnFinish: true, ...options });
  const events = [];
  const programmer = createBluetoothProgrammer({ firmwareId: artifact.id, version: artifact.version,
    bluetooth: f.bluetooth, canInstall: () => true, fetchFile: async () => new Response(await readFile(new URL(artifact.partial.url))),
    createProtocol: opts => createDiagnostics({ ...opts, timeoutMs: 50, disconnectTimeoutMs: 10, serviceDiscoveryTimeoutMs: 20 }),
    retryDelaysMs: [1, 2, 4], onEvent: e => events.push(e), ...overrides });
  await programmer.prepare();
  return { f, programmer, events };
}
test('install verifies identity and hands the same live connection to measurement without starting it', async () => {
  const { f, programmer } = await setup({ autoSamples: { [artifact.partial.programHash]: '26' } });
  const installing = programmer.install(); assert.equal(f.requests.length, 1);
  await installing; assert.equal(programmer.getState().status, 'success');
  assert.equal(f.writes.some(x => typeof x === 'string'), false);
  const device = await programmer.takeConnection(), connects = f.state.connects;
  const transport = createTransport({ ble: createBleClient({ bluetooth: f.bluetooth }) });
  await transport.connect(getExperiment('temperature'), () => {}, () => {}, { device, reuseConnection: true });
  assert.equal(f.state.connects, connects); assert.equal(f.requests.length, 1);
  assert.equal(transport.getState().firstReading, true);
  await programmer.dispose(); assert.equal(f.device.gatt.connected, true);
  await transport.disconnect();
});
test('incompatible runtime and blocked recording state never send mode or firmware writes', async () => {
  for (const blocked of [false, true]) {
    const { f, programmer } = await setup({ runtimeHash: 'aabbccddeeff0011' }, blocked ? { canInstall: () => false } : {});
    await programmer.install();
    assert.equal(f.writes.some(x => [1, 2, 255].includes(x[0])), false);
    if (blocked) assert.equal(f.requests.length, 0);
    else { assert.equal(programmer.getState().usbRequired, true); assert.match(programmer.getState().message, /USB/); }
    await programmer.dispose();
  }
});
test('post-transfer connection exhaustion offers reset; a later retry verifies without replaying firmware', async () => {
  let fails = true;
  const { f, programmer } = await setup();
  const connect = f.device.gatt.connect.bind(f.device.gatt);
  f.device.gatt.connect = async () => {
    if (f.state.packets && fails) throw new DOMException('Rebooting', 'NetworkError');
    return connect();
  };
  await programmer.install(); assert.equal(programmer.getState().status, 'recovery');
  assert.match(programmer.getState().message, /리셋/);
  const packets = f.state.packets;
  fails = false; await programmer.install();
  assert.equal(programmer.getState().status, 'success'); assert.equal(f.state.packets, packets);
  assert.equal(f.writes.filter(p => p[0] === 2).length, 1);
  await programmer.dispose();
});
test('interrupted transfer cannot be retried or accepted from its early matching header', async () => {
  const { f, programmer } = await setup({ disconnectAtPacket: 8 });
  await programmer.install(); assert.equal(programmer.getState().usbRequired, true);
  const packets = f.state.packets; await programmer.install(); assert.equal(f.state.packets, packets);
  assert.equal(programmer.getState().installedThisSession, false); await programmer.dispose();
});
test('cancelled chooser and a firmware already present do not write', async () => {
  for (const options of [{ cancel: true }, { programHash: artifact.partial.programHash }]) {
    const { f, programmer } = await setup(options); await programmer.install();
    assert.equal(programmer.getState().status, options.cancel ? 'cancelled' : 'success');
    assert.equal(f.writes.some(p => [1, 2, 255].includes(p[0])), false); await programmer.dispose();
  }
});

test('cancelling connection recovery stops retries and never sends firmware', async () => {
  const { f, programmer, events } = await setup({}, { retryDelaysMs: [2000, 4000, 8000] });
  f.device.gatt.connect = async () => { throw new DOMException('Not ready', 'NetworkError'); };
  const installing = programmer.install();
  while (!events.some(event => event.kind === 'connection-retry-wait')) await new Promise(resolve => setTimeout(resolve, 1));
  programmer.cancel(); await installing;
  assert.equal(programmer.getState().status, 'cancelled');
  assert.equal(events.filter(event => event.kind === 'connection-retry-start').length, 1);
  assert.equal(f.writes.length, 0); await programmer.dispose();
});

test('handoff unsubscribe failure retains the installed device for measurement recovery', async () => {
  const { f, programmer } = await setup({ programHash: artifact.partial.programHash });
  await programmer.install();
  f.control.stopNotifications = async () => { throw new DOMException('Disconnected', 'NetworkError'); };
  assert.equal(await programmer.takeConnection(), f.device);
  assert.equal(f.device.gatt.connected, false);
  assert.equal(programmer.getState().installedThisSession, true);
  await programmer.dispose();
});

test('cancelling file preparation ignores a late download and allows a fresh preparation', async () => {
  const file = await readFile(new URL(artifact.partial.url));
  let finish;
  const programmer = createBluetoothProgrammer({ firmwareId: artifact.id, canInstall: () => true,
    bluetooth: { requestDevice() { assert.fail('preparation must not open a chooser'); } },
    fetchFile: () => new Promise(resolve => { finish = () => resolve(new Response(file)); }) });
  const preparing = programmer.prepare(); programmer.cancel(); finish(); await preparing;
  assert.equal(programmer.getState().status, 'cancelled');
  assert.equal(programmer.getState().canInstall, false);
  const retry = programmer.prepare(); finish(); await retry;
  assert.equal(programmer.getState().status, 'ready'); await programmer.dispose();
});
test('current releases share a wireless runtime; stale identities allow compatible measurement but not installation', () => {
  for (const [id, current] of Object.entries(firmwareManifest)) {
    assert.equal(current.partial.runtimeHash, artifact.partial.runtimeHash);
    const old = staleFirmware.find(item => item.id === current.sensorId + '-uart');
    assert.equal(getFirmwareIdentity(old.id, old.version).sha256, old.sha256);
    assert.throws(() => getFirmwareArtifact(old.id, old.version), { code: 'unknown-firmware' });
    const context = getExperiment(current.partial.id);
    context.firmware = { ...context.firmware, id: old.id, version: old.version, sha256: old.sha256 };
    assert.equal(getSensorRuntime(context).definition.firmware.version, old.version);
    context.firmware.startCommand = 'untrusted';
    assert.equal(getSensorRuntime(context).definition.firmware.startCommand, old.startCommand);
    context.firmware.version = 999;
    assert.throws(() => getSensorRuntime(context));
    delete context.firmware.version;
    assert.throws(() => getSensorRuntime(context));
  }
});

test('Chrome backoff uses 2/4/8 seconds and cancellation during a wait prevents another attempt', async () => {
  for (const cancel of [false, true]) {
    const delays = []; let calls = 0, stopped = false;
    await assert.rejects(retryConnection(async () => { calls++; throw new DOMException('lost', 'NetworkError'); }, {
      phase: 'test', check: () => { if (stopped) throw new Error('cancelled'); }, cleanup: () => {},
      pause: async ms => { delays.push(ms); if (cancel) stopped = true; },
    }), cancel ? /cancelled/ : /lost/);
    assert.deepEqual(delays, cancel ? [2000] : [2000, 4000, 8000]);
    assert.equal(calls, cancel ? 1 : 4);
  }
});
