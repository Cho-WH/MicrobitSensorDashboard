// UART discovery/reconnect cases adapted from G/tests/bluetooth.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBleClient, createLineFramer } from '../../src/device/ble-client.js';
import { getBluetoothSupport, isAppleMobile } from '../../src/device/browser-support.js';

test('Bluetooth capability checks stay silent and distinguish security, policy and missing API', () => {
  const bluetooth = {
    requestDevice() { assert.fail('support detection must not open a chooser'); },
    getAvailability() { assert.fail('hardware availability is not a browser support verdict'); },
  };
  assert.equal(getBluetoothSupport({ bluetooth, secure: true }), 'supported');
  assert.equal(getBluetoothSupport({ bluetooth: null, secure: true }), 'unsupported');
  assert.equal(getBluetoothSupport({ bluetooth: null, secure: false }), 'insecure');
  assert.equal(getBluetoothSupport({ bluetooth, secure: true, policy: { allowsFeature: () => false } }), 'blocked');
  assert.equal(getBluetoothSupport({ bluetooth, secure: true, policy: { allowsFeature() { throw new Error('old API'); } } }), 'supported');
  const client = createBleClient({ bluetooth });
  assert.equal(client.getSupport(), 'supported'); assert.equal(client.isSupported(), true);
});

test('Apple mobile hint includes iPad desktop mode without treating a Mac as iOS', () => {
  assert.equal(isAppleMobile({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' }), true);
  assert.equal(isAppleMobile({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0)' }), true);
  assert.equal(isAppleMobile({ platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isAppleMobile({ platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(isAppleMobile({ userAgent: 'Mozilla/5.0 (Linux; Android 15)' }), false);
});

const encode = text => new TextEncoder().encode(text);
test('UTF-8 streaming handles split code points, CRLF, multiple lines and DataView offsets', () => {
  const lines = [], errors = [], frame = createLineFramer({ onLine: line => lines.push(line), onError: e => errors.push(e) });
  const input = encode('가나다,0\r\n25,0,1000\n26,0,1001\n');
  for (const byte of input) frame.push(Uint8Array.of(byte));
  const offset = encode('garbage27,0,1002\nignored');
  frame.push(new DataView(offset.buffer, 7, 10));
  assert.deepEqual(lines, ['가나다,0', '25,0,1000', '26,0,1001', '27,0,1002']);
  assert.deepEqual(errors, []);
});

test('only an oversized frame is discarded, and valid lines in a large notification survive', () => {
  const lines = [], errors = [], frame = createLineFramer({ onLine: l => lines.push(l), onError: e => errors.push(e.reasonCode) });
  frame.push(encode('x'.repeat(1024) + '\n'));
  frame.push(encode('x'.repeat(1025)));
  frame.push(encode('tail\nvalid\r\n'));
  frame.push(encode(('1,2,3,4\n').repeat(300)));
  assert.equal(lines[0].length, 1024);
  assert.equal(lines[1], 'valid'); assert.equal(lines.length, 302);
  assert.deepEqual(errors, ['frame-too-long']);
});

test('limits count UTF-8 bytes; invalid frames and reconnect resets recover at the next line', () => {
  const lines = [], errors = [], frame = createLineFramer({ onLine: l => lines.push(l), onError: e => errors.push(e.reasonCode) });
  frame.push(encode('가'.repeat(342) + '\nnext\n'));
  frame.push(Uint8Array.of(0xc3, 0x28, 10));
  frame.push(encode('ready\n'));
  frame.push(Uint8Array.of(0xe3)); frame.reset(); frame.push(encode('fresh\n'));
  assert.deepEqual(lines, ['next', 'ready', 'fresh']);
  assert.deepEqual(errors, ['frame-too-long', 'invalid-utf8']);
});

function deviceFixture() {
  class Observable extends EventTarget {
    callbacks = new Map();
    addEventListener(type, listener, options) { this.callbacks.set(type, listener); super.addEventListener(type, listener, options); }
  }
  const writes = [], rx = new Observable();
  Object.assign(rx, { uuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', properties: { notify: true },
    getDescriptors: async () => [], startNotifications: async () => {}, stopNotifications: async () => {} });
  const tx = { uuid: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', properties: { write: true },
    getDescriptors: async () => [], writeValue: async value => writes.push(new TextDecoder().decode(value)) };
  const device = new Observable(); device.name = 'micro:bit test';
  device.gatt = {
    connected: false,
    async getPrimaryService() { return { getCharacteristics: async () => [rx, tx] }; },
    async connect() { this.connected = true; return this; },
    disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
  };
  return { device, rx, tx, writes, send(text) { rx.value = new DataView(encode(text).buffer); rx.dispatchEvent(new Event('characteristicvaluechanged')); } };
}

test('UART property discovery, direct reconnection and queued callbacks preserve connection ownership', async () => {
  const f = deviceFixture(), lines = []; let choosers = 0, disconnects = 0;
  const ble = createBleClient({ bluetooth: { requestDevice() { choosers++; return Promise.resolve(f.device); } } });
  const selecting = ble.requestDevice(); assert.equal(choosers, 1);
  await ble.connect(await selecting); ble.setDisconnectedListener(() => disconnects++);
  await ble.startNotifications(line => lines.push(line));
  await ble.sendStartCommand('start'); assert.deepEqual(f.writes, ['start\n']);
  await assert.rejects(ble.sendStartCommand('start\nbme'), /한 줄/);
  f.send('25,0,10'); f.send('00\r\n26,0,1001\n');
  const oldNotification = f.rx.callbacks.get('characteristicvaluechanged');
  const oldDisconnected = f.device.callbacks.get('gattserverdisconnected');
  f.send('unfinished'); await ble.disconnect();
  await ble.connect(f.device); await ble.startNotifications(line => lines.push(line));
  // Same device/characteristic objects are reused: identity checks alone are insufficient.
  oldNotification({ target: f.rx }); oldDisconnected({ target: f.device });
  f.send('27,0,1002\n');
  assert.deepEqual(lines, ['25,0,1000', '26,0,1001', '27,0,1002']);
  assert.equal(ble.getContext().device, f.device);
  f.device.gatt.disconnect();
  assert.equal(disconnects, 1); assert.equal(ble.getContext().device, null);
  await ble.disconnect();
});

test('UART hands off a live GATT only after unsubscribing and retires old callbacks', async () => {
  const f = deviceFixture(), lines = [], bluetooth = { requestDevice() {} };
  const old = createBleClient({ bluetooth }), next = createBleClient({ bluetooth });
  await f.device.gatt.connect();
  f.device.gatt.connect = () => { assert.fail('handoff must not reconnect'); };
  await old.connect(f.device, { reuseConnection: true }); await old.startNotifications(line => lines.push(line));
  const notify = f.rx.callbacks.get('characteristicvaluechanged'), disconnected = f.device.callbacks.get('gattserverdisconnected');
  let finish;
  f.rx.stopNotifications = () => new Promise(resolve => { finish = resolve; });
  let released = false;
  const releasing = old.releaseConnection().then(device => { released = true; return device; });
  f.send('old\n'); await Promise.resolve(); assert.equal(released, false);
  finish(); assert.equal(await releasing, f.device);
  await next.connect(f.device, { reuseConnection: true }); await next.startNotifications(line => lines.push(line));
  await old.disconnect(); notify({ target: f.rx }); disconnected({ target: f.device });
  f.send('fresh\n');
  assert.deepEqual(lines, ['fresh']); assert.equal(f.device.gatt.connected, true);
  await next.disconnect(); assert.equal(f.device.gatt.connected, false);
  await assert.rejects(old.connect(f.device, { reuseConnection: true }), { name: 'NetworkError' });
  await old.disconnect();
});

test('UART discovery timeout ignores late results and leaves the next connection usable', async () => {
  for (const stage of ['service', 'characteristics', 'descriptors']) {
    const f = deviceFixture(), ble = createBleClient({ bluetooth: { requestDevice() {} } });
    const original = f.device.gatt.getPrimaryService;
    const descriptors = f.rx.getDescriptors;
    let finish;
    const pending = () => new Promise(resolve => { finish = resolve; });
    f.device.gatt.getPrimaryService = stage === 'service' ? pending
      : stage === 'characteristics' ? async () => ({ getCharacteristics: pending }) : original;
    if (stage === 'descriptors') f.rx.getDescriptors = pending;
    await assert.rejects(ble.connect(f.device, { serviceDiscoveryTimeoutMs: 15 }), { code: 'timeout' });
    assert.equal(f.device.gatt.connected, false);
    f.device.gatt.getPrimaryService = original; f.rx.getDescriptors = descriptors;
    await ble.connect(f.device, { serviceDiscoveryTimeoutMs: 15 });
    const currentService = ble.getContext().service;
    finish(stage === 'service' ? { getCharacteristics: async () => [] } : []);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(ble.getContext().service, currentService);
    await ble.sendStartCommand('start');
    assert.deepEqual(f.writes, ['start\n']);
    await ble.disconnect();
  }
});

test('UART subscription cleanup failure never claims a successful handoff', async () => {
  const f = deviceFixture(), ble = createBleClient({ bluetooth: { requestDevice() {} } });
  await ble.connect(f.device);
  f.rx.stopNotifications = async () => { throw new Error('unsubscribe failed'); };
  await assert.rejects(ble.releaseConnection(), /unsubscribe failed/);
  assert.equal(ble.getContext().device, null);
  f.device.gatt.disconnect(); // The orchestrator owns failure cleanup during transfer.
});
