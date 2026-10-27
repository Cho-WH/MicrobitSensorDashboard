// Attempt, deadline, retry and chooser cases adapted from G/tests/connection.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockPreparation } from '../../src/catalog/sensors/magnetometer/preparation.js';
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

test('measurement handoff retries only connection preparation and sends the trusted start once after recovery', async () => {
  const f = fixture('temperature'), device = { name: 'installed micro:bit', gatt: { connected: true } };
  let attempts = 0;
  f.ble.connect = async () => { if (++attempts < 3) throw new DOMException('Rebooting', 'NetworkError'); };
  const pending = f.connect({ device, reuseConnection: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 1); assert.equal(f.ble.commands.length, 0);
  await f.timers.advance(2000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 2); assert.equal(f.ble.commands.length, 0);
  await f.timers.advance(4000); await pending;
  assert.equal(attempts, 3); assert.equal(f.ble.requests, 0);
  assert.deepEqual(f.ble.commands, ['start']);
  assert.equal(f.transport.getState().status, 'connected');
  await f.transport.disconnect();
});

test('BMP280 sends at most five bme commands and rejects invalid channels for its three-second first-reading deadline', async () => {
  const f = fixture(); await f.connect();
  f.ble.handlers[0]('25,0,0'); f.ble.handlers[0]('abc,0,1000');
  await f.timers.advance(2999);
  assert.deepEqual(f.ble.commands, Array(5).fill('bme')); assert.equal(f.transport.getState().status, 'connected');
  await f.timers.advance(1);
  assert.equal(f.transport.getState().status, 'disconnected'); assert.equal(f.timers.tasks.size, 0);
  assert.match(f.transport.getState().message, /온도/);
});

test('magnetic handshake handles silence, old numeric firmware and write failure; timeout cleans up and permits a fresh reconnect', async () => {
  for(const scenario of ['silent','numeric-only','write-failure','calibrating-only']) {
    const f=fixture('magnetometer'), originalSend=f.ble.sendStartCommand;
    if(scenario==='write-failure') f.ble.sendStartCommand=async function(command){this.commands.push(command);throw new Error('write failed');};
    await f.connect();const oldNotify=f.ble.handlers[0];
    assert.deepEqual(f.ble.commands,['prepare']);
    if(scenario==='numeric-only')oldNotify('1,2,3,4');
    if(scenario==='calibrating-only')oldNotify('@mag,2,calibrating');
    await f.timers.advance(9999);
    assert.equal(f.transport.getState().status,'connected');assert.equal(f.transport.getState().confirmed,false);
    assert.equal(f.inputs.length,0);
    await f.timers.advance(1);await Promise.resolve();
    const failed=f.transport.getState();
    assert.equal(failed.status,'disconnected');assert.equal(failed.busy,false);
    assert.equal(failed.devicePreparation,null);assert.equal(failed.calibration,'unknown');
    assert.equal(failed.canReconnect,true);assert.match(failed.message,/프로그램.*응답/);
    assert.equal(f.timers.tasks.size,0);assert.equal(f.ble.cleanups,1);
    oldNotify('@mag,2,choice');oldNotify('1,2,3,4');
    assert.equal(f.transport.getState().status,'disconnected');assert.equal(f.inputs.length,0);
    f.ble.sendStartCommand=originalSend;
    await f.connect({reuseDevice:true});oldNotify('@mag,2,choice');
    assert.equal(f.transport.getState().devicePreparation.phase,'handshake');
    f.ble.handlers[1]('@mag,2,choice');await f.timers.advance(180000);
    assert.equal(f.transport.getState().devicePreparation.phase,'choice');assert.equal(f.timers.tasks.size,0);
    assert.equal(f.ble.requests,1);assert.deepEqual(f.ble.commands,['prepare','prepare']);
    await f.transport.disconnect();
  }
});

test('calibration acknowledgements gate readings, cannot be forged by wrong-order statuses, and never become samples', async () => {
  const f=fixture('magnetometer');await f.connect();const notify=f.ble.handlers[0];
  notify('@mag,2,choice');notify('@mag,2,calibrated');notify('@mag,2,skipped');
  assert.equal(f.transport.getState().calibration,'unknown');
  await f.transport.performAction('calibrate');await f.transport.performAction('skip');
  assert.deepEqual(f.ble.commands,['prepare','calibrate']);
  notify('@mag,2,calibrating');notify('1,2,3,4');await f.timers.advance(119000);
  assert.equal(f.inputs.length,0);assert.equal(f.transport.getState().status,'connected');
  notify('@mag,2,calibrated');assert.equal(f.transport.getState().calibration,'device-reported');
  assert.equal(f.transport.getState().confirmed,false);
  for(let i=0;i<3;i++){notify('1,2,3,4');await f.timers.advance(500);}
  assert.equal(f.transport.getState().confirmed,true);assert.equal(f.inputs.length,3);
  const oldNotify=notify;await f.transport.disconnect();await f.connect({reuseDevice:true});
  oldNotify('@mag,2,calibrated');oldNotify('1,2,3,4');
  assert.equal(f.transport.getState().devicePreparation.phase,'handshake');assert.equal(f.transport.getState().calibration,'unknown');
  await f.transport.disconnect();assert.equal(f.timers.tasks.size,0);
});

test('reconnecting to a calibrated board uses fresh completion and still requires fresh readings', async () => {
  const f=fixture('magnetometer');await f.connect();const oldNotify=f.ble.handlers[0];
  oldNotify('@mag,2,choice');await f.transport.performAction('calibrate');oldNotify('@mag,2,calibrating');
  await f.transport.disconnect();await f.connect({reuseDevice:true});
  oldNotify('@mag,2,calibrating');oldNotify('@mag,2,calibrated');
  assert.equal(f.transport.getState().devicePreparation.phase,'handshake');
  const notify=f.ble.handlers[1];notify('@mag,2,calibrating');
  assert.equal(f.transport.getState().devicePreparation.phase,'handshake');
  assert.equal(f.transport.getState().calibration,'unknown');
  assert.equal(f.ble.requests,1);assert.deepEqual(f.ble.commands,['prepare','calibrate','prepare']);
  notify('1,2,3,4');await f.timers.advance(1000);
  assert.equal(f.transport.getState().status,'connected');assert.equal(f.inputs.length,0);
  notify('@mag,2,calibrated');
  assert.equal(f.transport.getState().calibration,'device-reported');assert.equal(f.transport.getState().confirmed,false);
  for(let i=0;i<3;i++){notify('1,2,3,4');await f.timers.advance(500);}
  assert.equal(f.transport.getState().confirmed,true);
  await f.transport.disconnect();
});

test('early completion survives notification setup and repeated completion cannot extend the reading deadline', async () => {
  const ble=fakeBle();
  ble.startNotifications=async handler=>{ble.handlers.push(handler);handler('@mag,2,calibrated');};
  const f=fixture('magnetometer',ble);await f.connect();
  assert.equal(f.transport.getState().devicePreparation.phase,'receiving');
  assert.equal(f.transport.getState().calibration,'device-reported');
  await f.timers.advance(4999);ble.handlers[0]('@mag,2,calibrated');
  await f.timers.advance(1);await Promise.resolve();
  assert.equal(f.transport.getState().status,'disconnected');
  assert.equal(f.timers.tasks.size,0);
});

test('missing action acknowledgement, calibration completion or first reading closes the attempt', async () => {
  for(const boundary of ['ack','calibration','reading','write']){
    const f=fixture('magnetometer');await f.connect();const notify=f.ble.handlers[0];notify('@mag,2,choice');
    if(boundary==='write')f.ble.sendStartCommand=async()=>{throw new Error('write failed');};
    await f.transport.performAction(boundary==='reading'?'skip':'calibrate');
    if(boundary==='calibration')notify('@mag,2,calibrating');
    if(boundary==='reading')notify('@mag,2,skipped');
    await f.timers.advance(boundary==='calibration'?120000:5000);await Promise.resolve();
    assert.equal(f.transport.getState().status,'disconnected',boundary);assert.equal(f.transport.getState().confirmed,false);
    assert.equal(f.transport.getState().calibration,'unknown');assert.equal(f.timers.tasks.size,0);
  }
});

test('a first packet and a burst do not confirm reception; three fresh required-channel packets spanning a second do', async () => {
  const f = fixture('magnetometer'); await f.connect();
  f.ble.handlers[0]('@mag,2,choice');await f.transport.performAction('skip');f.ble.handlers[0]('@mag,2,skipped');
  for (let i = 0; i < 3; i++) f.ble.handlers[0]('1,2,3,4');
  assert.equal(f.transport.getState().firstReading, true); assert.equal(f.transport.getState().confirmed, false);
  await f.timers.advance(500); f.ble.handlers[0]('1,2,3,4');
  await f.timers.advance(500); f.ble.handlers[0]('1,2,3,4');
  assert.equal(f.transport.getState().confirmed, true); assert.equal(f.transport.getState().calibration, 'skipped');
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

test('cancel finishes even when GATT setup never returns; late completion cannot disturb the next connection', async () => {
  for (const stage of ['connect', 'startNotifications']) {
    const ble = fakeBle(), original = ble[stage]; let finish;
    ble[stage] = () => new Promise(resolve => { finish = resolve; });
    const f = fixture('bmp280', ble), connecting = f.connect();
    await new Promise(resolve => setImmediate(resolve));
    await f.transport.disconnect(); await connecting;
    assert.equal(f.transport.getState().busy, false);
    assert.equal(f.transport.getState().status, 'disconnected');
    ble[stage] = original; await f.connect();
    finish(); await new Promise(resolve => setImmediate(resolve));
    ble.handlers.at(-1)('25,,1000');
    assert.equal(f.transport.getState().status, 'connected');
    assert.equal(f.transport.getState().firstReading, true);
    await f.transport.disconnect();
  }
});

test('cancelling installation recovery interrupts backoff and permits a fresh connection', async () => {
  const f = fixture();
  f.ble.connect = async () => { throw new DOMException('Rebooting', 'NetworkError'); };
  const connecting = f.connect({ device: { name: 'installed board' } });
  await new Promise(resolve => setImmediate(resolve));
  await f.transport.disconnect(); await connecting;
  assert.equal(f.transport.getState().busy, false);
  f.ble.connect = async () => {};
  await f.connect(); await f.timers.advance(2000);
  assert.equal(f.transport.getState().status, 'connected');
  await f.transport.disconnect();
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

test('mock preparation cancels pending completion on disconnect and never streams during calibration',async()=>{
  const timers=new Timers(),lines=[];let streaming=false;
  const mock=createMockPreparation({timers,emit:line=>lines.push(line),startStreaming:()=>streaming=true,stopStreaming:()=>streaming=false});
  mock.command('prepare');mock.command('calibrate');mock.command('skip');assert.equal(streaming,false);
  await timers.advance(1799);assert.equal(streaming,false);mock.dispose();await timers.advance(10000);
  assert.deepEqual(lines,['@mag,2,choice','@mag,2,calibrating']);assert.equal(streaming,false);assert.equal(timers.tasks.size,0);
});
