import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { displayMock, sensorDisplaySource } from '../helpers/sensor-display.mjs';
const driver = ts.transpile(await readFile(new URL('../../firmware/drivers/mlx90393.ts', import.meta.url), 'utf8'), { target: ts.ScriptTarget.ES2020 });
const main = await readFile(new URL('../../firmware/examples/mlx90393.js', import.meta.url), 'utf8');
function fixture({ address = 0x18, nack = false, stuck = false } = {}) {
  const registers = [0x007C, 0, 0], hooks = {}, lines = [], screen = displayMock();
  let response = [], command = '', now = 0;
  const buffer = bytes => Object.assign(Uint8Array.from(bytes), { getNumber: (_, i) => (bytes[i] * 256 + bytes[i + 1] + 32768) % 65536 - 32768 });
  const f = { registers, hooks, lines, counts: [100, -200, 300], duringPause() {}, send: text => { command = text; hooks.uart(); }, now: () => now };
  f.context = createContext({ ...screen, Math, parseInt, convertToText: String, NumberFormat: { Int16BE: 1 },
    input: { runningTime: () => now },
    pins: { createBuffer: n => buffer(Array(n).fill(0)), createBufferFromArray: bytes => buffer(bytes),
      i2cWriteBuffer(addr, bytes) {
        if (nack || addr !== address) return -1;
        const op = bytes[0];
        if (op === 0x50) { const n = registers[bytes[1] >> 2]; response = [0, n >> 8, n & 255]; }
        else if (op === 0x60) { registers[bytes[3] >> 2] = bytes[1] * 256 + bytes[2]; response = [0]; }
        else if (op === 0x3F) response = [0x20];
        else if (op === 0x4F) response = [3, 180, 164, ...f.counts.flatMap(n => [(n & 65535) >> 8, n & 255])];
        else response = [0];
        return 0;
      }, i2cReadBuffer: (_, n) => buffer(stuck ? Array(n).fill(0) : response) },
    bluetooth: { startUartService() {}, onBluetoothConnected: cb => hooks.connect = cb, onBluetoothDisconnected: cb => hooks.disconnect = cb,
      onUartDataReceived: (_, cb) => hooks.uart = cb, uartReadUntil: () => command, uartWriteLine: s => lines.push(s) },
    serial: { delimiters: () => '\n' }, Delimiters: { NewLine: 1 },
    basic: { ...screen.basic, forever: cb => hooks.loop = cb, pause: ms => { now += ms; f.duringPause(ms); } },
  });
  runInContext(sensorDisplaySource + driver + main, f.context); return f;
}
test('driver finds both address families, confirms register recipes and preserves signed raw counts', () => {
  for (const address of [0x18, 0x0C]) {
    const f = fixture({ address });
    assert.equal(f.context.mlxInitialize(false), true);
    assert.equal(f.registers[0] & 127, 0x7C); assert.equal(f.registers[2] & 8191, 0x1A);
    assert.deepEqual([...f.context.mlxMeasure()], [100, -200, 300]);
    assert.equal(f.context.mlxInitialize(true), true);
    assert.equal(f.registers[2] & 8191, 0x2BA);
    f.registers[0] = 0x7C;
    assert.deepEqual([...f.context.mlxMeasure()], []);
  }
  assert.equal(fixture({ nack: true }).context.mlxInitialize(false), false);
  assert.equal(fixture({ stuck: true }).context.mlxInitialize(false), false);
});
test('firmware sends no old conversion after stop/configure/disconnect and includes conversion in 100ms cadence', () => {
  for (const interrupt of [f => f.send('stop'), f => f.send('configure,wide,2'), f => f.hooks.disconnect()]) {
    const f = fixture(); f.hooks.connect(); f.send('prepare'); f.send('configure,normal,1');
    f.duringPause = ms => { if (ms === 62) interrupt(f); };
    f.hooks.loop(); assert.equal(f.lines.some(s => s.startsWith('mlx,')), false);
  }
  const f = fixture(); f.hooks.connect(); f.send('configure,normal,1');
  f.hooks.loop(); const start = f.now(); f.hooks.loop();
  assert.equal(f.now() - start, 100);
  assert.ok(f.lines.includes('@mlx,1,applied,normal,1'));
  assert.ok(f.lines.includes('mlx,1,normal,1,100,-200,300'));
});
