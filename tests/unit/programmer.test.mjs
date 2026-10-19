// Adapted from G/gay-lussac/tests/programmer.test.mjs at 59c5c149.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { createProgrammer } from '../../src/device/programmer.js';
import { getFirmwareArtifact } from '../../src/device/firmware.js';

const firmware = await readFile(new URL('../../public/firmware/bmp280-uart-v1.hex', import.meta.url));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function fixture(overrides = {}) {
  const calls = [];
  const usb = {
    initialize: async () => { calls.push('initialize'); },
    connect: async () => { calls.push('connect'); },
    getBoardVersion: () => 'V2', getDevice: () => ({ productName: 'test V2' }),
    flash: async (source, options) => {
      calls.push('flash');
      assert.equal(options.partial, false);
      assert.match(await source('V2'), /^:/);
    },
    disconnect: async () => { calls.push('disconnect'); }, dispose: () => { calls.push('dispose'); },
  };
  const programmer = createProgrammer({
    firmwareId: 'bmp280-uart', canInstall: () => true, crypto: webcrypto, supported: () => true,
    fetchFile: async () => new Response(firmware), createConnection: () => usb,
    beforeFlash: async () => { calls.push('stop-ble'); }, ...overrides,
  });
  return { programmer, usb, calls };
}

test('LF, CRLF and mixed line endings prepare and produce identical official V2 flash data', async () => {
  const lf = firmware.toString('utf8').replace(/\r\n/g, '\n');
  let expected;
  for (const text of [lf, lf.replace(/\n/g, '\r\n'), lf.replace('\n', '\r\n')]) {
    const { programmer, usb } = fixture({ fetchFile: async () => new Response(text) });
    usb.flash = async source => {
      const actual = await source('V2');
      expected ??= actual;
      assert.equal(actual, expected);
    };
    await programmer.prepare();
    assert.equal(programmer.getState().status, 'ready', programmer.getState().message);
    await programmer.install();
    assert.equal(programmer.getState().status, 'success');
    await programmer.dispose();
  }
});

test('normalization still rejects changed HEX content, stray CR, whitespace, BOM and invalid UTF-8 before USB access', async () => {
  const lf = firmware.toString('utf8').replace(/\r\n/g, '\n');
  for (const text of [lf.replace(':', ':F'), lf.replace(':', ':\r'), ' ' + lf, '\uFEFF' + lf,
    Buffer.concat([Buffer.from([0xff]), Buffer.from(lf)])]) {
    const { programmer, calls } = fixture({ fetchFile: async () => new Response(text) });
    await programmer.prepare(); await programmer.install();
    assert.equal(programmer.getState().status, 'error');
    assert.equal(programmer.getState().canInstall, false);
    assert.deepEqual(calls, []);
    await programmer.dispose();
  }
});

test('verified real HEX uses official V2 reader; progress 100 does not mean success; concurrent clicks cannot double flash', async () => {
  const { programmer, usb, calls } = fixture();
  const completed = deferred(), flashing = deferred();
  usb.flash = async (source, options) => {
    assert.match(await source('V2'), /^:/);
    assert.equal(options.partial, false);
    calls.push('flash'); options.progress('FullFlashing', 1); flashing.resolve();
    await completed.promise;
  };
  await programmer.prepare();
  assert.equal(programmer.getState().status, 'ready', programmer.getState().message);
  const first = programmer.install();
  assert.equal(calls.at(-1), 'connect', 'USB starts before waiting on preparation or BLE');
  assert.equal(programmer.install(), first);
  await flashing.promise;
  assert.equal(programmer.getState().status, 'flashing');
  assert.equal(programmer.getState().progress, 100);
  assert.equal(programmer.getState().canInstall, false);
  completed.resolve(); await first;
  assert.deepEqual(calls, ['initialize', 'connect', 'stop-ble', 'flash', 'disconnect']);
  assert.equal(programmer.getState().status, 'success');
  await programmer.dispose();
});

test('wrong hash and unsupported browser never open or write to USB', async () => {
  for (const overrides of [{ fetchFile: async () => new Response('damaged HEX') }, { supported: () => false }]) {
    const { programmer, calls } = fixture(overrides);
    await programmer.prepare(); await programmer.install();
    assert.equal(programmer.getState().canInstall, false);
    assert.deepEqual(calls, []);
  }
});

test('cancel, wrong board and cable loss remain unsuccessful; a later attempt can succeed', async () => {
  const { programmer, usb, calls } = fixture();
  await programmer.prepare();
  usb.connect = async () => { throw { code: 'no-device-selected' }; };
  await programmer.install();
  assert.equal(programmer.getState().status, 'cancelled');
  assert.equal(calls.includes('stop-ble'), false);
  usb.connect = async () => {};
  usb.getBoardVersion = () => 'V1';
  await programmer.install();
  assert.equal(programmer.getState().status, 'error');
  assert.equal(calls.includes('flash'), false);
  assert.equal(calls.includes('stop-ble'), false);
  usb.getBoardVersion = () => 'V2';
  usb.flash = async (_source, options) => { options.progress('FullFlashing', 0.5); throw { code: 'device-disconnected' }; };
  await programmer.install();
  assert.equal(programmer.getState().status, 'error');
  assert.equal(programmer.getState().progress, null);
  assert.equal(calls.at(-1), 'disconnect');
  usb.flash = async () => {};
  await programmer.install();
  assert.equal(programmer.getState().status, 'success');
  await programmer.dispose();
});

test('leaving during file preparation prevents a later USB connection', async () => {
  const file = deferred();
  const { programmer, calls } = fixture({ fetchFile: () => file.promise });
  const preparing = programmer.prepare();
  const disposing = programmer.dispose();
  file.resolve(new Response(firmware));
  await Promise.all([preparing, disposing]);
  await programmer.install();
  assert.deepEqual(calls, []);
});

test('only known manifest identities can select firmware, ignoring untrusted file URLs and hashes', async () => {
  let requested;
  const { programmer } = fixture({ program: { url: 'https://example.invalid/untrusted.hex', sha256: '0'.repeat(64) },
    fetchFile: async url => { requested = url; return new Response(firmware); } });
  await programmer.prepare();
  assert.equal(requested, getFirmwareArtifact('bmp280-uart').url);
  assert.equal(programmer.getState().status, 'ready');
  assert.throws(() => fixture({ firmwareId: '__proto__' }), /프로그램 버전/);
  assert.throws(() => fixture({ firmwareId: 'unregistered' }), /프로그램 버전/);
  assert.throws(() => fixture({ version: 2 }), /프로그램 버전/);
  await programmer.dispose();
});

test('recording/save guard prevents USB selection and is checked again immediately before flashing', async () => {
  let safe = false;
  const { programmer, calls } = fixture({ canInstall: () => safe, beforeFlash: async () => { safe = false; } });
  await programmer.prepare(); await programmer.install();
  assert.equal(programmer.getState().status, 'blocked');
  assert.deepEqual(calls, ['initialize']);
  safe = true; await programmer.install();
  assert.equal(programmer.getState().status, 'error');
  assert.match(programmer.getState().message, /기록을 마치고/);
  assert.equal(calls.includes('flash'), false); assert.equal(calls.at(-1), 'disconnect');
  await programmer.dispose();
});

test('dispose while USB selection is open prevents transfer and late success notifications', async () => {
  const connection = deferred(), states = [];
  const { programmer, usb, calls } = fixture({ onState: state => states.push(state.status) });
  usb.connect = () => { calls.push('connect'); return connection.promise; };
  await programmer.prepare(); const installing = programmer.install();
  const disposing = programmer.dispose(); connection.resolve();
  await Promise.all([installing, disposing]);
  assert.equal(calls.includes('flash'), false); assert.equal(states.includes('success'), false);
  assert.equal(programmer.getState().canInstall, false); assert.equal(calls.at(-1), 'dispose');
});

test('a completed flash records only installation evidence, never reported firmware or BLE confirmation', async () => {
  const { programmer } = fixture(); await programmer.prepare(); await programmer.install();
  assert.equal(programmer.getState().installedThisSession, true);
  assert.equal(programmer.getState().reportedFirmware, null);
  assert.deepEqual(programmer.getState().expectedFirmware, { id: 'bmp280-uart', version: 1 });
  await programmer.dispose();
});

test('leaving during a flash waits for the hardware operation, then releases USB without late UI success', async () => {
  const transfer = deferred(), flashing = deferred(), states = [];
  const { programmer, usb, calls } = fixture({ onState: state => states.push(state.status) });
  usb.flash = async () => { calls.push('flash'); flashing.resolve(); await transfer.promise; };
  await programmer.prepare(); const installing = programmer.install(); await flashing.promise;
  let cleaned = false;
  const disposing = programmer.dispose().then(() => { cleaned = true; });
  await Promise.resolve();
  assert.equal(cleaned, false); assert.equal(calls.includes('disconnect'), false);
  transfer.resolve(); await Promise.all([installing, disposing]);
  assert.equal(calls.at(-1), 'dispose'); assert.equal(states.includes('success'), false);
});

