import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fullPrograms } from '../../dev/bluetooth-install/firmware/full-programs.js';
import { verifyFullImage, appStart, appLimit } from '../../dev/bluetooth-install/full-image.js';
import { createSecureDfu, crc32, parseDfuResponse } from '../../dev/bluetooth-install/secure-dfu.js';
import { createDiagnostics, fullDfuProblem } from '../../dev/bluetooth-install/diagnostics.js';
import { bluetoothFixture } from '../fixtures/bluetooth-diagnostics.mjs';
import { secureDfuFixture } from '../fixtures/secure-dfu.mjs';
const images = await Promise.all(fullPrograms.map(async target => ({ target,
  data: new Uint8Array(await readFile(new URL('../../dev/bluetooth-install/firmware/' + target.file, import.meta.url))),
  init: new Uint8Array(await readFile(new URL('../../dev/bluetooth-install/firmware/' + target.initFile, import.meta.url))),
})));
const image = images[0];
test('full images include runtime and program, exclude system/bootloader; init has mandatory reversed SHA256', async () => {
  for (const item of images) {
    const checked = await verifyFullImage(item.target, item.data, item.init);
    assert.equal(item.target.start, appStart); assert.ok(item.target.end <= appLimit);
    assert.ok(item.data.length > 180000);
    const v = new DataView(item.init.buffer);
    assert.equal(new TextDecoder().decode(item.init.subarray(0, 12)), 'microbit_app');
    assert.equal(v.getUint32(16, true), item.data.length); assert.equal(v.getUint32(20, true), 32);
    assert.deepEqual(item.init.subarray(24), new Uint8Array(createHash('sha256').update(item.data).digest()).reverse());
    const header = item.data.subarray(0x49000 - appStart + 16, 0x49000 - appStart + 32);
    assert.equal(Buffer.from(header).toString('hex'), item.target.runtimeHash + item.target.programHash);
    assert.notEqual(checked.data, item.data);
  }
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});
test('wrong image, init or unknown target causes no Bluetooth connection', async () => {
  for (const bad of [{ ...image, data: image.data.slice(4) }, { ...image, init: new Uint8Array(56) }, { ...image, target: { id: 'other' } }]) {
    const f = secureDfuFixture(crc32), client = createSecureDfu();
    await assert.rejects(client.flash(f.device, bad)); assert.equal(f.state.connects, 0);
  }
});
test('full transfer sends every byte from zero with CRC before each execute and no partial commands', async () => {
  const f = secureDfuFixture(crc32), events = [], client = createSecureDfu({ onEvent: e => events.push(e) });
  const result = await client.flash(f.device, image);
  assert.deepEqual(Uint8Array.from(f.state.data[1]), image.init);
  assert.deepEqual(Uint8Array.from(f.state.data[2]), image.data);
  assert.equal(result.verified, false); assert.equal(result.sent, image.data.length);
  for (let i = 0; i < f.state.commands.length; i++) if (f.state.commands[i][0] === 4) assert.equal(f.state.commands[i - 1][0], 3);
  assert.equal(events.filter(e => e.kind === 'dfu-finalizing').length, 1);
  assert.equal(f.device.gatt.connected, false);
});
test('bad CRC/offset and rejected execute stop before next object; timeout and mid-stream disconnect terminate', async () => {
  for (const options of [{ badCrc: true }, { badOffset: true }, { rejectExecute: true }, { silent: 6 }, { disconnectPacket: 4 }, { maxSize: 0 }]) {
    const f = secureDfuFixture(crc32, options), client = createSecureDfu({ timeoutMs: 80 });
    await assert.rejects(client.flash(f.device, image));
    assert.equal(f.device.gatt.connected, false);
    if (options.badCrc || options.badOffset) assert.equal(f.state.commands.some(p => p[0] === 4), false);
  }
});
test('cancellation stops writes; final reset disconnect remains unconfirmed', async () => {
  const f = secureDfuFixture(crc32), client = createSecureDfu();
  await assert.rejects(client.flash(f.device, image, { progress() { client.disconnect(); } }));
  assert.ok(f.state.data[2].length < image.data.length);
  const g = secureDfuFixture(crc32, { disconnectFinal: true, bytes: image.data.length }), events = [];
  await assert.rejects(createSecureDfu({ onEvent: e => events.push(e) }).flash(g.device, image));
  assert.equal(events.filter(e => e.kind === 'dfu-finalizing').length, 1);
  assert.equal(g.device.gatt.connected, false);
});
test('DFU entry freshly checks known V2 trial and records bonded control access/refusal without flash writes', async () => {
  for (const options of [{}, { dfuDenied: true }, { dfuRejected: true }, { mode: 1 }, { runtimeHash: '0000000000000001' }]) {
    const f = bluetoothFixture({ mode: 0, runtimeHash: image.target.runtimeHash, programHash: image.target.programHash, fullDfu: true, ...options });
    const events = [], client = createDiagnostics({ onEvent: e => events.push(e) });
    await client.connect(f.device);
    if (Object.keys(options).length) await assert.rejects(client.enterFullDfu()); else await client.enterFullDfu();
    assert.equal(f.writes.some(p => p[0] === 1 || p[0] === 2), false);
    assert.equal(f.device.gatt.connected, false);
    if (options.dfuDenied) assert.equal(f.writes.some(p => p[0] === 'dfu-entry'), false);
    if (!Object.keys(options).length) assert.ok(events.some(e => e.kind === 'dfu-entry-kind' && e.bonded));
  }
  assert.ok(fullDfuProblem(null));
  assert.throws(() => parseDfuResponse(Uint8Array.of(0x60, 4, 5), 4));
});
