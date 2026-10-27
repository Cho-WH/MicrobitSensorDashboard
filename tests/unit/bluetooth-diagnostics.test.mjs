import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnostics, modeRequestProblem, services, parseRegion, parseStatus } from '../../src/device/bluetooth-protocol.js';
import { bluetoothFixture } from '../fixtures/bluetooth-diagnostics.mjs';

function setup(options, overrides = {}) {
  const f = bluetoothFixture(options), events = [];
  const client = createDiagnostics({ bluetooth: f.bluetooth, support: () => 'supported', timeoutMs: 100,
    onEvent: e => events.push(e), ...overrides });
  return { f, client, events };
}

test('real fixed-width notifications decode only the payload and preserve the runtime guard', async () => {
  const observed = Uint8Array.from('ee01010000000000000000000000000000000000'.match(/../g), v => parseInt(v, 16));
  assert.deepEqual(parseStatus(observed), { protocol: 1, mode: 1 });
  observed.fill(0xa5, 3); // Unused characteristic bytes need not describe the current response.
  assert.deepEqual(parseStatus(observed), { protocol: 1, mode: 1 });
  for (const length of [0, 2, 4, 19, 21]) {
    const bytes = new Uint8Array(length); bytes[0] = 0xee;
    assert.throws(() => parseStatus(bytes), /형식/);
  }
  const { f, client } = setup({ fixedFrame: true });
  await client.connect(f.device);
  const report = await client.diagnose();
  assert.equal(report.regions[1].hash, '11f3cd7e54807276');
  assert.equal(report.regions[1].valid, true);
  assert.match(modeRequestProblem(report, 0, true), /pairing_mode: 0/);
  const region = new Uint8Array(f.control.value.buffer, f.control.value.byteOffset, 20).slice();
  region.fill(0xa5, 18);
  assert.equal(parseRegion(region, 2).hash, report.regions[2].hash);
  assert.throws(() => parseRegion(region, 1), /형식/);
  for (const length of [2, 17, 19, 21]) {
    const bytes = new Uint8Array(length); bytes[1] = 2;
    assert.throws(() => parseRegion(bytes, 2), /형식/);
  }
  assert.deepEqual(f.writes, [[0xee], [0, 1], [0, 2]]);
  client.disconnect();
});
test('chooser is explicit; diagnosis only queries status and regions and decodes offset views', async () => {
  const { f, client } = setup();
  assert.equal(f.requests.length, 0);
  const selected = client.requestDevice(); assert.equal(f.requests.length, 1);
  assert.deepEqual(f.requests[0].optionalServices, Object.values(services));
  await client.connect(await selected);
  const report = await client.diagnose();
  assert.equal(report.status.mode, 1); assert.equal(report.info.model, 'BBC micro:bit V2');
  assert.equal(report.regions[1].start, 0x1c000); assert.equal(report.regions[1].hash, '11f3cd7e54807276');
  assert.deepEqual(f.writes, [[0xee], [0, 1], [0, 2]]);
  assert.match(modeRequestProblem(report, 0, true), /pairing_mode: 0/);
  await assert.rejects(client.reset(0, { candidateConfirmed: true }), /pairing_mode: 0/);
  assert.equal(f.writes.length, 3);
  client.disconnect(); assert.equal(f.device.gatt.connected, false); assert.equal(client.report, null);
});
test('handoff releases diagnostic subscriptions and ownership while keeping the same GATT', async () => {
  const { f, client, events } = setup();
  await client.connect(f.device); await client.diagnose();
  assert.equal(await client.releaseConnection(), f.device);
  assert.equal(client.connected, false); assert.equal(client.report, null);
  assert.equal(f.state.controlSubscribed, false); assert.equal(f.device.gatt.connected, true);
  client.disconnect(); // The retired owner must not close the new owner's GATT.
  f.notify(Uint8Array.of(0xee, 1, 0));
  assert.equal(events.at(-1).kind, 'diagnostic-released');
  await client.connect(f.device, { reuseConnection: true });
  assert.equal((await client.diagnose()).status.mode, 1);
  assert.equal(f.state.connects, 1); assert.equal(f.state.disconnects, 0);
  client.disconnect();
});

test('handoff rejects busy work and failed or cancelled subscription cleanup', async () => {
  for (const mode of ['busy', 'failed', 'cancelled', 'timeout']) {
    const { f, client } = setup({}, { timeoutMs: 15 });
    await client.connect(f.device); const diagnosis = client.diagnose();
    if (mode === 'busy') await assert.rejects(client.releaseConnection(), /진단이 끝난/);
    await diagnosis;
    if (mode === 'busy') { client.disconnect(); continue; }
    let finish;
    f.control.stopNotifications = mode === 'failed' ? async () => { throw new Error('unsubscribe failed'); }
      : () => new Promise(resolve => { finish = resolve; });
    const releasing = client.releaseConnection(), rejected = assert.rejects(releasing);
    if (mode === 'cancelled') client.disconnect();
    await rejected; finish?.();
    assert.equal(client.connected, false); assert.equal(f.device.gatt.connected, false);
    await assert.rejects(client.connect(f.device, { reuseConnection: true }), /연결이 끊겼/);
    assert.equal(f.state.connects, 1);
  }
});

test('candidate reset requires V2 + supported protocol + regions + confirmation; reconnect verifies mode', async () => {
  const { f, client, events } = setup({ runtimeHash: 'aabbccddeeff0011' });
  await client.connect(f.device); const report = await client.diagnose();
  assert.match(modeRequestProblem({ ...report, info: { model: 'BBC micro:bit V1' } }, 0, true), /V2/);
  assert.match(modeRequestProblem({ ...report, status: { protocol: 2, mode: 1 } }, 0, true), /버전/);
  assert.match(modeRequestProblem({ ...report, regions: {} }, 0, true), /영역/);
  await assert.rejects(client.reset(0), /시험본/);
  await client.reset(0, { candidateConfirmed: true });
  assert.deepEqual(f.writes.at(-1), [0xff, 0]); assert.equal(client.report, null);
  assert.equal(events.find(e => e.kind === 'mode-requested').verified, false);
  await client.connect(f.device); assert.equal((await client.diagnose()).status.mode, 0);
  await client.reset(1); assert.deepEqual(f.writes.at(-1), [0xff, 1]);
});
test('service absence and permission denial remain distinct without reset or firmware writes', async () => {
  for (const [options, state] of [[{ missing: services.partial }, 'absent'], [{ denied: services.partial }, 'denied']]) {
    const { f, client } = setup(options);
    await client.connect(f.device); const report = await client.diagnose();
    assert.equal(report.services.partial.state, state); assert.deepEqual(f.writes, []);
    await assert.rejects(client.reset(0, { candidateConfirmed: true })); client.disconnect();
  }
});
test('unsupported protocol is reported without speculative region or reset requests', async () => {
  const { f, client } = setup({ protocol: 2 });
  await client.connect(f.device); const report = await client.diagnose();
  assert.equal(report.status.protocol, 2); assert.deepEqual(report.regions, {});
  await assert.rejects(client.reset(0, { candidateConfirmed: true }), /버전/);
  assert.deepEqual(f.writes, [[0xee]]); client.disconnect();
});
test('invalid or timed-out replies retire the connection instead of accepting late replies', async () => {
  for (const options of [{ badStatus: true }, { silent: true }]) {
    const { f, client } = setup(options, { timeoutMs: 15 });
    await client.connect(f.device);
    await assert.rejects(client.diagnose(), /형식|초과/);
    f.notify(Uint8Array.of(0xee, 1, 0));
    assert.equal(client.connected, false); assert.equal(client.report, null);
    assert.deepEqual(f.writes, [[0xee]]);
  }
});
test('manual disconnect cancels pending work; late old notifications cannot satisfy a new query', async () => {
  const { f, client } = setup({ silent: true });
  let oldListener;
  const add = f.control.addEventListener.bind(f.control);
  f.control.addEventListener = (name, listener) => { oldListener ??= listener; add(name, listener); };
  await client.connect(f.device); const first = client.diagnose();
  while (!f.writes.length) await new Promise(resolve => setTimeout(resolve, 0));
  const rejected = assert.rejects(first, /연결|취소/);
  client.disconnect(); await rejected;
  await client.connect(f.device); const second = client.diagnose();
  while (f.writes.length < 2) await new Promise(resolve => setTimeout(resolve, 0));
  f.control.value = new DataView(Uint8Array.of(0xee, 1, 0).buffer);
  oldListener({ target: f.control });
  await assert.rejects(second, /초과/);
  assert.equal(client.report, null);
});
test('concurrent diagnosis is rejected and reset disconnection is not reported as confirmed success', async () => {
  const { f, client, events } = setup({ runtimeHash: 'aabbccddeeff0011', disconnectOnReset: true });
  await client.connect(f.device);
  const first = client.diagnose(); await assert.rejects(client.diagnose(), /이전 작업/); await first;
  await assert.rejects(client.reset(0, { candidateConfirmed: true }), /연결|취소/);
  assert.equal(events.some(e => e.kind === 'mode-requested'), false);
  assert.equal(client.connected, false);
});
test('invalid memory bounds and zero hashes cannot enable reset', () => {
  const bytes = new Uint8Array(18); bytes[1] = 1;
  assert.equal(parseRegion(bytes, 1).valid, false);
  const view = new DataView(bytes.buffer); view.setUint32(2, 0x1c000); view.setUint32(6, 0x90000); bytes[10] = 1;
  assert.equal(parseRegion(bytes, 1).valid, false);
});

test('discovery has its own deadline; timeout retires the connection and ignores late results', async () => {
  for (const stage of ['service', 'characteristic']) {
    const { f, client, events } = setup({}, { timeoutMs: 500, serviceDiscoveryTimeoutMs: 15 });
    const connect = f.device.gatt.connect.bind(f.device.gatt);
    f.device.gatt.connect = async () => { await new Promise(resolve => setTimeout(resolve, 30)); return connect(); };
    await client.connect(f.device); // The discovery limit must not shorten connect.
    const original = f.server.getPrimaryService.bind(f.server);
    let finish;
    f.server.getPrimaryService = async id => {
      const service = await original(id);
      if (id !== services.info) return service;
      return stage === 'service' ? new Promise(resolve => { finish = () => resolve(service); })
        : { getCharacteristic: () => new Promise(resolve => { finish = () => resolve({}); }) };
    };
    await assert.rejects(client.diagnose(), { code: 'timeout' });
    assert.equal(events.find(e => e.kind === 'trace-timeout').timeoutMs, 15);
    assert.equal(f.device.gatt.connected, false);
    f.server.getPrimaryService = original;
    await client.connect(f.device);
    finish();
    assert.equal((await client.diagnose()).status.mode, 1);
    client.disconnect();
  }
});

test('a late GATT connection is released unless a newer UART owner is using the device', async () => {
  for (const occupied of [false, true]) {
    const { f, client } = setup({}, { timeoutMs: 10, isDeviceInUse: () => occupied });
    let finish;
    f.device.gatt.connect = () => new Promise(resolve => { finish = () => { f.device.gatt.connected = true; resolve(f.server); }; });
    await assert.rejects(client.connect(f.device), /초과/);
    finish(); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(f.device.gatt.connected, occupied);
    f.device.gatt.disconnect();
  }
});
