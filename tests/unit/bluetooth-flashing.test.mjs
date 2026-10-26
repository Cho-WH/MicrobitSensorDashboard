import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDiagnostics } from '../../dev/bluetooth-install/diagnostics.js';
import { trialPrograms } from '../../dev/bluetooth-install/firmware/programs.js';
import { verifyTrialProgram, blockPackets, loadTrialProgram } from '../../dev/bluetooth-install/partial-flash.js';
import { bluetoothFixture } from '../fixtures/bluetooth-diagnostics.mjs';
const target = trialPrograms[0];
const original = new Uint8Array(await readFile(new URL('../../dev/bluetooth-install/firmware/' + target.file, import.meta.url)));
function setup(options = {}, overrides = {}) {
  const f = bluetoothFixture({ flash: true, disconnectOnFinish: true, fixedFrame: true, mode: 0, runtimeHash: target.runtimeHash, ...options });
  const events = [];
  const client = createDiagnostics({ bluetooth: f.bluetooth, timeoutMs: 100, support: () => 'supported', onEvent: e => events.push(e), ...overrides });
  return { f, events, client };
}

test('pinned binary integrity is checked before any GATT request and copies caller data', async () => {
  const { f, client } = setup(); await client.connect(f.device);
  const corrupt = original.slice(); corrupt[64] ^= 1;
  await assert.rejects(client.flash(target.id, corrupt), /파일 검증/);
  assert.deepEqual(f.writes, []);
  await assert.rejects(verifyTrialProgram('unregistered', original), /등록/);
  await assert.rejects(verifyTrialProgram(target.id, original.slice(1)), /크기/);
  await assert.rejects(loadTrialProgram(target.id, async () => ({ ok: false })), /읽지/);
  const mutable = original.slice(), checked = verifyTrialProgram(target.id, mutable); mutable.fill(0);
  assert.deepEqual((await checked).data, original);
});

test('fresh mode, runtime and region gates reject incompatible devices without firmware writes', async () => {
  for (const options of [{ mode: 1 }, { model: 'BBC micro:bit V1' }, { protocol: 2 },
    { runtimeHash: '11f3cd7e54807276' }, { programStart: 0x48000 }, { programEnd: 0x49100 }]) {
    const { f, client } = setup(options); await client.connect(f.device);
    await assert.rejects(client.flash(target.id, original));
    assert.equal(f.writes.some(p => p[0] === 1 || p[0] === 2), false);
  }
  const { f, client } = setup(); await client.connect(f.device); await client.diagnose();
  f.state.mode = 1;
  await assert.rejects(client.flash(target.id, original), /설치 모드/);
  assert.equal(f.writes.some(p => p[0] === 1 || p[0] === 2), false);
});

test('transfer preserves every byte/address across sequence wrap and only reports unverified send', async () => {
  const { f, client, events } = setup(); await client.connect(f.device);
  const running = client.flash(target.id, original);
  await assert.rejects(client.diagnose(), /이전 작업/);
  const result = await running;
  assert.equal(result.verified, false); assert.equal(result.sent, original.length);
  assert.equal(f.state.batches.length, original.length / 64);
  assert.deepEqual(new Uint8Array(f.state.batches.flatMap(b => b.payload)), original);
  f.state.batches.forEach((b, index) => assert.equal(b.address, target.start + index * 64));
  const packets = f.writes.filter(p => p[0] === 1);
  assert.equal(packets[255][3], 255); assert.equal(packets[256][3], 0);
  assert.deepEqual(f.writes.at(-1), [2]);
  assert.equal(events.some(e => e.kind === 'flash-finish-requested'), true);
  assert.equal(client.connected, false); assert.equal(client.report, null);
  assert.throws(() => blockPackets(original, 0, 0x1c000, 0), /영역/);
});

test('explicit NACK retries the same address with the next sequence; retries are bounded', async () => {
  for (const options of [{ nackOnce: true }, { earlyNack: true }]) {
    const { f, client } = setup(options); await client.connect(f.device);
    const result = await client.flash(target.id, original);
    assert.equal(result.retries, 1);
    const packets = f.writes.filter(p => p[0] === 1);
    assert.deepEqual(packets[4].slice(0, 3), packets[0].slice(0, 3)); assert.equal(packets[4][3], 4);
    assert.deepEqual(new Uint8Array(f.state.batches.flatMap(b => b.payload)), original);
  }
  const { f, client } = setup({ nackAlways: true }); await client.connect(f.device);
  await assert.rejects(client.flash(target.id, original), /반복/);
  assert.equal(f.state.packets, 12); assert.equal(f.writes.some(p => p[0] === 2), false);
});

test('lost or malformed ACK and mid-block disconnect stop without EOT or unsafe timeout retry', async () => {
  for (const options of [{ silentAck: true }, { badAck: true }, { disconnectAtPacket: 2 }]) {
    const { f, client } = setup(options, { timeoutMs: 25 }); await client.connect(f.device);
    await assert.rejects(client.flash(target.id, original));
    assert.ok(f.state.packets <= 4); assert.equal(f.writes.some(p => p[0] === 2), false);
    f.notify([1, 0xff]); assert.equal(client.connected, false);
  }
});

test('missing final device event fails without resending firmware or reporting success', async () => {
  const { f, client, events } = setup({ disconnectOnFinish: false }, { timeoutMs: 25 });
  await client.connect(f.device);
  await assert.rejects(client.flash(target.id, original), /해제 이벤트 대기 시간 초과/);
  assert.equal(f.writes.filter(p => p[0] === 2).length, 1);
  assert.equal(events.some(e => e.kind === 'flash-sent'), false);
  assert.equal(f.device.gatt.connected, false);
});

test('cancellation after a block prevents further writes; final disconnect requires later verification', async () => {
  const { f, client } = setup(); await client.connect(f.device);
  await assert.rejects(client.flash(target.id, original, { progress: () => client.disconnect() }));
  assert.equal(f.state.packets, 4); assert.equal(f.writes.some(p => p[0] === 2), false);
  const final = setup({ disconnectOnFinish: true }); await final.client.connect(final.f.device);
  const sent = await final.client.flash(target.id, original);
  assert.equal(sent.verified, false);
  assert.equal(final.events.some(e => e.kind === 'flash-finish-requested'), true);
  assert.equal(final.events.some(e => e.kind === 'flash-device-disconnected'), true);
  assert.equal(final.events.some(e => e.kind === 'flash-sent'), true);
  await final.client.connect(final.f.device);
  const report = await final.client.diagnose();
  assert.equal(report.status.mode, 1); assert.equal(report.regions[2].hash, target.programHash);
  final.client.disconnect();
});
