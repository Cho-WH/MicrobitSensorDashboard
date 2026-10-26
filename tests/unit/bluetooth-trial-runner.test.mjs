import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDiagnostics } from '../../dev/bluetooth-install/diagnostics.js';
import { createBleClient } from '../../src/device/ble-client.js';
import { createTrialRunner } from '../../dev/bluetooth-install/trial-runner.js';
import { trialPrograms } from '../../dev/bluetooth-install/firmware/programs.js';
import { verifyTrialProgram } from '../../dev/bluetooth-install/partial-flash.js';
import { bluetoothFixture } from '../fixtures/bluetooth-diagnostics.mjs';
import { retryConnection } from '../../dev/bluetooth-install/connection-retry.js';
const rows = { temperature: '25', 'light-level': '100', accelerometer: '0,0,1000,1000', magnetometer: '1,2,3,4', bmp280: '25,,1000', 'analog-raw': '0,512,1023' };
const temperature = trialPrograms.find(p => p.id === 'temperature');
const autoSamples = Object.fromEntries(trialPrograms.filter(p => rows[p.id]).map(p => [p.programHash, rows[p.id]]));
const loadImage = async id => {
  const p = trialPrograms.find(p => p.id === id);
  return verifyTrialProgram(id, new Uint8Array(await readFile(new URL('../../dev/bluetooth-install/firmware/' + p.file, import.meta.url))));
};
function setup(options = {}, overrides = {}) {
  const f = bluetoothFixture({ runtimeHash: temperature.runtimeHash, programHash: temperature.programHash,
    flash: true, disconnectOnReset: true, disconnectOnFinish: true, autoSamples, ...options });
  const events = [], diagnostic = createDiagnostics({ bluetooth: f.bluetooth, timeoutMs: 100, disconnectTimeoutMs: 10,
    support: () => 'supported', onEvent: e => events.push(e) });
  const runner = createTrialRunner({ diagnostic, createClient: () => createBleClient({ bluetooth: f.bluetooth }), loadImage,
    retryDelaysMs: [1, 2, 4], sampleTimeoutMs: 50, onEvent: e => events.push(e), ...overrides });
  return { f, runner, events, diagnostic };
}
test('built-in round trip verifies five programs and UART samples without extra device choosers', async () => {
  const { f, runner, events } = setup();
  const result = await runner.run(f.device, 'builtin');
  assert.equal(result.status, 'passed', result.error);
  assert.deepEqual(result.steps.map(s => s.id), ['temperature', 'accelerometer', 'magnetometer', 'light-level', 'temperature']);
  assert.ok(result.steps.every(s => s.samples.length === 3));
  assert.equal(result.steps[1].samples[0].values.accelerationZ, 9.80665);
  assert.ok(events.some(e => e.kind === 'trial-calibration-skipped'));
  assert.equal(f.requests.length, 0); assert.equal(f.device.gatt.connected, true);
  assert.equal(result.connectionRetained, true);
  assert.equal(f.writes.filter(p => p[0] === 2).length, 5);
  // Initial connection + two board restarts per image. Role changes add none.
  assert.equal(f.state.connects, 11); assert.equal(f.state.disconnects, 10);
  assert.equal(events.filter(e => e.kind === 'trial-handoff' && e.connected).length, 10);
  assert.equal((await runner.run(f.device, 'quick')).status, 'passed');
  assert.equal(f.state.connects, 15); assert.equal(f.state.disconnects, 14);
});
test('post-flash diagnosis recovers on fourth attempt or exhausts without replaying mode or firmware', async () => {
  for (const failures of [3, 4]) {
    let remaining = 0;
    const { f, runner, diagnostic, events } = setup({}, { onState: s => {
      if (s.stage === '재연결·프로그램 확인' && s.target === 'light-level') remaining = failures;
    } });
    const diagnose = diagnostic.diagnose;
    diagnostic.diagnose = () => {
      if (remaining > 0) { remaining--; throw new DOMException('disconnected during service discovery', 'NetworkError'); }
      return diagnose();
    };
    const result = await runner.run(f.device, 'quick');
    assert.equal(result.status, failures === 3 ? 'passed' : 'failed', result.error);
    assert.equal(events.filter(e => e.kind === 'connection-retry-wait').length, 3);
    assert.equal(f.writes.filter(p => p[0] === 2).length, failures === 3 ? 2 : 1);
    assert.equal(f.writes.filter(p => p[0] === 0xff).length, failures === 3 ? 2 : 1);
    assert.equal(result.connectionRetained, failures === 3);
    diagnostic.disconnect();
  }
});

test('missing reboot events fall back to fresh mode/program verification without repeating commands', async () => {
  const { f, runner, events } = setup({ disconnectOnReset: false, disconnectOnFinish: false });
  const result = await runner.run(f.device, 'quick');
  assert.equal(result.status, 'passed', result.error);
  assert.equal(events.filter(e => e.kind === 'disconnect-wait-fallback').length, 4);
  assert.equal(f.writes.filter(p => p[0] === 0xff).length, 2);
  assert.equal(f.writes.filter(p => p[0] === 2).length, 2);
  assert.equal(result.steps.length, 2);
});

test('service absence is retried before mode change; explicit denial is terminal', async () => {
  for (const name of ['NotFoundError', 'SecurityError']) {
    const { f, runner, events } = setup();
    const get = f.device.gatt.getPrimaryService;
    let failures = 1;
    f.device.gatt.getPrimaryService = async uuid => {
      if (uuid === 'e97dd91d-251d-470a-a062-fa1922dfa9a8' && failures-- > 0)
        throw new DOMException('service unavailable', name);
      return get(uuid);
    };
    const result = await runner.run(f.device, 'quick');
    assert.equal(result.status, name === 'NotFoundError' ? 'passed' : 'failed', result.error);
    assert.equal(events.filter(e => e.kind === 'connection-retry-wait').length, name === 'NotFoundError' ? 1 : 0);
    assert.equal(f.writes.filter(p => p[0] === 0xff).length, name === 'NotFoundError' ? 2 : 0);
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

test('all files and starting identity are checked before reset or program writes', async () => {
  for (const [options, overrides] of [[{ programHash: '0000000000000001' }, {}], [{ runtimeHash: '11f3cd7e54807276' }, {}],
    [{}, { loadImage: async id => { if (id === 'temperature') throw new Error('return image missing'); return loadImage(id); } }]]) {
    const { f, runner } = setup(options, overrides);
    assert.equal((await runner.run(f.device, 'quick')).status, 'failed');
    assert.equal(f.writes.some(p => [1, 2, 0xff].includes(p[0])), false);
  }
});
test('mid-transfer disconnect stops without finish or automatic retransmission', async () => {
  const { f, runner } = setup({ disconnectAtPacket: 9 });
  const result = await runner.run(f.device, 'quick');
  assert.equal(result.status, 'failed'); assert.equal(result.steps.length, 0);
  assert.equal(f.state.packets, 9); assert.equal(f.writes.some(p => p[0] === 2), false);
});
test('a completed transfer with a different observed program never starts measurement', async () => {
  const { f, runner } = setup({ finishProgramHash: temperature.programHash });
  const result = await runner.run(f.device, 'quick');
  assert.equal(result.status, 'failed'); assert.match(result.error, /대상 프로그램/);
  assert.equal(result.steps.length, 0);
  assert.equal(f.writes.some(p => typeof p === 'string'), false);
});
test('missing BMP values and UART silence fail rather than pass or advance to return image', async () => {
  for (const row of [',,', null]) {
    const p = trialPrograms.find(p => p.id === 'bmp280');
    const { f, runner } = setup({ autoSamples: { ...autoSamples, [p.programHash]: row } });
    const result = await runner.run(f.device, 'bmp280');
    assert.equal(result.status, 'failed'); assert.equal(result.steps.length, 0);
    assert.equal(f.writes.filter(p => p[0] === 2).length, 1);
    assert.equal(f.device.gatt.connected, false);
  }
});
test('cancelling in-flight data retires work without finish or retained connection', async () => {
  let runner;
  const setupResult = setup({}, { onState: s => { if (s.stage === '부분 전송' && s.progress > 0) runner.cancel(); } });
  runner = setupResult.runner;
  const result = await runner.run(setupResult.f.device, 'quick');
  assert.equal(result.status, 'cancelled'); assert.equal(runner.running, false);
  assert.equal(setupResult.f.writes.some(p => p[0] === 2), false);
  assert.equal(setupResult.f.device.gatt.connected, false);
});

test('a transient UART setup disconnect retries once before start without repeating firmware writes', async () => {
  let connections = 0;
  const { f, events, runner } = setup({}, { createClient: () => {
    const client = createBleClient({ bluetooth: f.bluetooth }), connect = client.connect;
    client.connect = async device => {
      if (++connections === 1) throw new DOMException('GATT Server is disconnected', 'NetworkError');
      return connect(device);
    };
    return client;
  } });
  const result = await runner.run(f.device, 'quick');
  assert.equal(result.status, 'passed', result.error);
  assert.equal(events.filter(e => e.kind === 'connection-retry-wait' && e.phase === 'partial-uart-prepare').length, 1);
  assert.equal(f.writes.filter(p => p[0] === 2).length, 2);
  assert.equal(f.writes.filter(p => p === 'start\n').length, 2);
});

test('UART permission refusal is not retried; disconnect after start never resends start', async () => {
  for (const phase of ['permission', 'after-start']) {
    let connections = 0;
    const { f, events, runner } = setup({}, { createClient: () => {
      const client = createBleClient({ bluetooth: f.bluetooth }), connect = client.connect, send = client.sendStartCommand;
      client.connect = async device => { connections++; if (phase === 'permission') throw new DOMException('Denied', 'SecurityError'); return connect(device); };
      client.sendStartCommand = async command => {
        await send(command);
        if (phase === 'after-start' && command === 'start') throw new DOMException('GATT Server is disconnected', 'NetworkError');
      };
      return client;
    } });
    const result = await runner.run(f.device, 'quick');
    assert.equal(result.status, 'failed'); assert.equal(connections, 1);
    assert.equal(events.some(e => e.kind === 'connection-retry-wait'), false);
    assert.equal(f.writes.filter(p => p === 'start\n').length, phase === 'permission' ? 0 : 1);
  }
});

test('cancellation while handing off UART subscriptions closes the GATT and cannot advance', async () => {
  let finish;
  const { f, runner } = setup({}, { createClient: () => {
    const client = createBleClient({ bluetooth: f.bluetooth });
    client.releaseConnection = () => new Promise(resolve => { finish = resolve; });
    return client;
  } });
  const running = runner.run(f.device, 'quick');
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  runner.cancel();
  const result = await running;
  finish(f.device); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(result.status, 'cancelled'); assert.equal(f.device.gatt.connected, false);
  assert.equal(f.writes.filter(p => p[0] === 2).length, 1);
});
