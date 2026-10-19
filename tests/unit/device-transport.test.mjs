// Attempt, deadline, retry and chooser cases adapted from G/tests/connection.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../../src/device/transport.js';
import { catalog, getExperiment, getSensorRuntime } from '../../src/catalog/index.js';

class Timers {
  now = 0; sequence = 0; tasks = new Map();
  setTimeout = (fn, delay) => { const id = ++this.sequence; this.tasks.set(id, { fn, at: this.now + delay }); return id; };
  clearTimeout = id => this.tasks.delete(id);
  async advance(ms) {
    const until = this.now + ms;
    while (true) {
      const due = [...this.tasks].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.tasks.delete(due[0]); this.now = due[1].at; await due[1].fn();
    }
    this.now = until;
  }
}
function fakeBle() {
  return { requests: 0, commands: [], handlers: [], listener: null, cleanups: 0,
    isSupported: () => true,
    requestDevice() { this.requests++; return Promise.resolve({ name: 'test micro:bit' }); },
    connect: async () => {},
    async startNotifications(handler) { this.handlers.push(handler); },
    setDisconnectedListener(listener) { this.listener = listener; },
    async sendStartCommand(command) { this.commands.push(command); },
    async disconnect() { this.cleanups++; },
  };
}
function fixture(sensor = 'bmp280', ble = fakeBle()) {
  const timers = new Timers(), inputs = [], states = [], context = getExperiment(sensor);
  const transport = createTransport({ ble, timers, clock: { utc: () => 1700000000000 + timers.now, mono: () => timers.now } });
  return { ble, timers, inputs, states, context, transport,
    connect: options => transport.connect(context, input => inputs.push(input), state => states.push(state), options) };
}

test('BMP280 sends at most five bme commands and rejects invalid channels for its three-second first-reading deadline', async () => {
  const f = fixture(); await f.connect();
  f.ble.handlers[0]('25,0,0'); f.ble.handlers[0]('abc,0,1000');
  await f.timers.advance(2999);
  assert.deepEqual(f.ble.commands, Array(5).fill('bme')); assert.equal(f.transport.getState().status, 'connected');
  await f.timers.advance(1);
  assert.equal(f.transport.getState().status, 'disconnected'); assert.equal(f.timers.tasks.size, 0);
  assert.match(f.transport.getState().message, /온도/);
});

test('magnetometer sends start once and leaves two minutes for device calibration without claiming completion', async () => {
  const f = fixture('magnetometer'); await f.connect(); await f.timers.advance(3000);
  assert.deepEqual(f.ble.commands, ['start']); assert.equal(f.transport.getState().status, 'connected');
  assert.equal(f.transport.getState().calibration, 'unknown');
  await f.timers.advance(116999); assert.equal(f.transport.getState().status, 'connected');
  await f.timers.advance(1); assert.equal(f.transport.getState().status, 'disconnected');
  assert.deepEqual(f.ble.commands, ['start']); assert.equal(f.timers.tasks.size, 0);
});

test('a first packet and a burst do not confirm reception; three fresh required-channel packets spanning a second do', async () => {
  const f = fixture('magnetometer'); await f.connect();
  for (let i = 0; i < 3; i++) f.ble.handlers[0]('1,2,3,4');
  assert.equal(f.transport.getState().firstReading, true); assert.equal(f.transport.getState().confirmed, false);
  await f.timers.advance(500); f.ble.handlers[0]('1,2,3,4');
  await f.timers.advance(500); f.ble.handlers[0]('1,2,3,4');
  assert.equal(f.transport.getState().confirmed, true); assert.equal(f.transport.getState().calibration, 'unknown');
  await f.timers.advance(5000); assert.equal(f.transport.getState().confirmed, false);
  assert.equal(f.transport.getState().status, 'connected');
  assert.equal(f.transport.getState().firstReading, true); await f.transport.disconnect();
});

test('an input during notification setup avoids unnecessary starts and a framing error becomes a standard parse error', async () => {
  const ble = fakeBle(); ble.startNotifications = async handler => { ble.handlers.push(handler); handler('25,0,1000'); };
  const f = fixture('bmp280', ble); await f.connect();
  assert.equal(ble.commands.length, 0); assert.equal(f.transport.getState().firstReading, true);
  ble.handlers[0]({ type: 'frame-error', reasonCode: 'frame-too-long' });
  assert.equal(f.inputs.at(-1).type, 'parse-error'); assert.equal(f.inputs.at(-1).reasonCode, 'frame-too-long');
  assert.equal(f.transport.getState().confirmed, false); await f.transport.disconnect();
});

test('readiness expires when the background freshness timer is delayed', async () => {
  const f=fixture();await f.connect();
  for(let i=0;i<3;i++){f.timers.now=i*500;f.ble.handlers[0]('25,0,1000');}
  const received=f.transport.getState().lastReceivedAt;
  assert.equal(f.transport.getState().confirmed,true);
  f.timers.now+=5000; // Suspended timers, as in an inactive browser tab.
  assert.equal(f.transport.getState().confirmed,false);
  assert.equal(f.transport.getState().lastReceivedAt,received);
  assert.equal(f.transport.getState().canReconnect,true);
  await f.transport.disconnect();
});

test('direct reconnect reuses the chosen device and late notification/disconnect callbacks cannot affect its new attempt', async () => {
  const f = fixture(); await f.connect();
  const oldHandler = f.ble.handlers[0], oldDisconnect = f.ble.listener;
  oldHandler('25,0,1000'); await f.transport.disconnect(); await f.connect({ reuseDevice: true });
  oldHandler('99,0,1099'); oldDisconnect(); f.ble.handlers[1]('26,0,1001');
  assert.equal(f.ble.requests, 1);
  assert.deepEqual(f.inputs.map(input => input.values.temperatureC), [25, 26]);
  assert.notEqual(f.inputs[0].attemptId, f.inputs[1].attemptId);
  assert.equal(f.transport.getState().status, 'connected'); await f.transport.disconnect();
  f.transport.forgetDevice(); await f.connect({ reuseDevice: true }); assert.equal(f.ble.requests, 1);
});

test('selection starts in the click call, cancellation closes its gate immediately and blocks a second chooser', async () => {
  const ble = fakeBle(); let resolveChooser;
  ble.requestDevice = () => { ble.requests++; return new Promise(resolve => { resolveChooser = resolve; }); };
  const f = fixture('bmp280', ble), connecting = f.connect();
  assert.equal(ble.requests, 1);
  const closing = f.transport.disconnect();
  assert.equal(f.transport.getState().status, 'disconnected'); assert.equal(f.transport.getState().busy, true);
  f.connect(); assert.equal(ble.requests, 1);
  resolveChooser({ name: 'late micro:bit' }); await Promise.all([connecting, closing]);
  assert.equal(ble.handlers.length, 0); assert.equal(f.transport.getState().busy, false); assert.equal(f.timers.tasks.size, 0);
});

test('cancelling pending GATT setup cleans up before another connection and suppresses notification setup', async () => {
  const ble = fakeBle(); let finishGatt;
  ble.connect = () => new Promise(resolve => { finishGatt = resolve; });
  const f = fixture('bmp280', ble), connecting = f.connect(); await Promise.resolve();
  const closing = f.transport.disconnect(); f.connect();
  assert.equal(ble.requests, 1); finishGatt(); await Promise.all([connecting, closing]);
  assert.equal(ble.handlers.length, 0); assert.ok(ble.cleanups >= 1);
  ble.connect = async () => {}; await f.connect(); assert.equal(ble.requests, 2); await f.transport.disconnect();
});

test('cancelled chooser allows retry and untrusted metadata cannot replace the registered command or waiting policy', async () => {
  const f = fixture(); const originalRequest = f.ble.requestDevice;
  f.ble.requestDevice = () => Promise.reject(new DOMException('cancelled', 'NotFoundError'));
  await f.connect(); assert.equal(f.transport.getState().busy, false); assert.match(f.transport.getState().message, /취소/);
  f.ble.requestDevice = originalRequest;
  f.context.firmware.startCommand = 'arbitrary'; f.context.connectionPolicy.firstReadingTimeoutMs = 1;
  await f.connect(); assert.deepEqual(f.ble.commands, ['bme']);
  await f.timers.advance(2); assert.equal(f.transport.getState().status, 'connected'); await f.transport.disconnect();
  f.context.sensor.version = 999;
  assert.throws(() => f.connect(), { code: 'unsupported-sensor-runtime' });
  assert.equal(f.ble.requests, 1);
});

test('registered sensor mock data passes exactly the matching decoder and never supplies executable serialized policy', () => {
  for (const { id } of catalog.sensors) {
    const runtime = getSensorRuntime(getExperiment(id)), reading = runtime.decode(runtime.mockLine(1000));
    assert.equal(reading.type, 'reading'); assert.ok(Object.values(reading.validity).every(v => v === 'valid'));
    assert.deepEqual(Object.keys(reading.values), runtime.definition.channels.map(c => c.id));
  }
});
