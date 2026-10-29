import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { displayMock, sensorDisplaySource } from '../helpers/sensor-display.mjs';

const driver = ts.transpile(await readFile(new URL('../../firmware/drivers/ds18b20.ts', import.meta.url), 'utf8'), { target: ts.ScriptTarget.ES2020 });
const main = await readFile(new URL('../../firmware/examples/ds18b20.js', import.meta.url), 'utf8');

// Independent MSB-first 0x31 reference, with bit reversal at the wire boundary.
function reverse(byte) { return Number.parseInt(byte.toString(2).padStart(8, '0').split('').reverse().join(''), 2); }
function checksum(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= reverse(byte);
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x80 ? 0x31 : 0)) & 255;
  }
  return reverse(crc);
}
function scratchpad(celsius, settings = [0xFF, 0x80, 0x7F]) {
  const raw = Math.round(celsius * 16) & 65535;
  const bytes = [raw & 255, raw >> 8, ...settings, 0xFF, 0x0C, 0x10];
  return [...bytes, checksum(bytes)];
}
function fixture({ duringPause = () => {} } = {}) {
  const hooks = {}, lines = [], commands = [], writes = [], pull = new Map();
  const screen = displayMock();
  let time = 0, command = '';
  const f = { hooks, lines, commands, writes, pull, samples: { 1: [[20]], 2: [] }, bits: [],
    send(value) { command = value; hooks.uart(); }, started: new Set([1]),
    time: () => time };
  f.context = createContext({
    ...screen, Math, convertToText: String, DigitalPin: { P1: 1, P2: 2 }, PinPullMode: { PullUp: 1 },
    input: { runningTime: () => time / 1000 },
    control: { ...screen.control, waitMicros: us => { time += us; } },
    pins: {
      setPull: (pin, mode) => pull.set(pin, mode),
      digitalWritePin: (pin, value) => writes.push({ pin, value, time }),
      digitalReadPin: () => f.bits.shift() ?? 1,
    },
    bluetooth: {
      startUartService() {}, onBluetoothConnected: cb => hooks.connect = cb,
      onBluetoothDisconnected: cb => hooks.disconnect = cb,
      onUartDataReceived: (_, cb) => hooks.uart = cb, uartReadUntil: () => command,
      uartWriteLine: line => lines.push(line),
    },
    serial: { delimiters: () => '\n' }, Delimiters: { NewLine: 1 },
    basic: { ...screen.basic, forever: cb => hooks.loop = cb,
      pause: ms => { time += ms * 1000; duringPause(f, ms); } },
  });
  runInContext(sensorDisplaySource + driver, f.context);
  f.loadMain = () => {
    // Model sensor latency separately from the native GPIO timing, which needs hardware.
    f.context.ds18b20BeginConversion = pin => { commands.push(['begin', pin]); return f.started.has(pin); };
    f.context.ds18b20FinishConversion = pin => { commands.push(['finish', pin]); return f.samples[pin].shift() ?? []; };
    runInContext(main, f.context);
  };
  return f;
}

test('DS18B20 CRC matches a known check vector and signed temperatures preserve resolution and limits', () => {
  const f = fixture();
  assert.equal(f.context.ds18b20Crc([...Buffer.from('123456789')]), 0xA1);
  for (const temperature of [-55, -10.125, -0.0625, 0, 0.0625, 25.0625, 85, 125]) {
    assert.deepEqual([...f.context.ds18b20DecodeScratchpad(scratchpad(temperature))], [temperature]);
  }
  for (const temperature of [-55.0625, 125.0625]) assert.equal(f.context.ds18b20DecodeScratchpad(scratchpad(temperature)).length, 0);
});

test('corrupt data, stuck buses, wrong resolution and power-up 85 C cannot become measurements', () => {
  const f = fixture(), valid = scratchpad(24.5);
  for (let bit = 0; bit < 72; bit++) {
    const corrupt = [...valid]; corrupt[bit >> 3] ^= 1 << (bit & 7);
    assert.equal(f.context.ds18b20DecodeScratchpad(corrupt).length, 0);
  }
  const powerUp = [0x50, 0x05, 0x4B, 0x46, 0x7F, 0xFF, 0x0C, 0x10, 0x1C];
  assert.equal(f.context.ds18b20Crc(powerUp), 0, 'power-up temperature is CRC-valid');
  for (const bytes of [powerUp, Array(9).fill(0), Array(9).fill(255), valid.slice(0, 8),
    scratchpad(20, [0xFF, 0x80, 0x1F]), scratchpad(20, [0, 0, 0x7F])]) {
    assert.equal(f.context.ds18b20DecodeScratchpad(bytes).length, 0);
  }
});

test('GPIO primitives transmit and receive bytes least-significant-bit first', () => {
  for (const byte of [0x00, 0xFF, 0xCC, 0x44, 0xBE, 0x80, 0x01]) {
    const f = fixture(); f.context.ds18b20WriteByte(1, byte);
    let reconstructed = 0;
    for (let bit = 0; bit < 8; bit++) {
      const [low, high] = f.writes.slice(bit * 2, bit * 2 + 2);
      reconstructed |= (high.time - low.time < 15 ? 1 : 0) << bit;
    }
    assert.equal(reconstructed, byte);
    f.bits = Array.from({ length: 8 }, (_, bit) => (byte >> bit) & 1);
    assert.equal(f.context.ds18b20ReadByte(1), byte);
  }
});

test('reset rejects absent, stuck-low and unreleased presence responses', () => {
  for (const [bits, expected] of [
    [[1, 1, 0, 1], true], [[1, 1, 1, 1], false], [[0], false], [[1, 1, 0, 0], false],
  ]) {
    const f = fixture(); f.bits = bits;
    assert.equal(f.context.ds18b20Reset(1), expected);
  }
});

test('conversion uses volatile configuration and requires a busy response from an attached probe', () => {
  const f = fixture(), bus = [];
  f.context.ds18b20Reset = () => true;
  f.context.ds18b20WriteByte = (_, byte) => bus.push(byte);
  f.context.ds18b20ReadBit = () => 0;
  assert.equal(f.context.ds18b20BeginConversion(1), true);
  assert.deepEqual(bus, [0xCC, 0x4E, 0xFF, 0x80, 0x7F, 0xCC, 0x44]);
  f.context.ds18b20ReadBit = () => 1;
  assert.equal(f.context.ds18b20BeginConversion(1), false);
  f.context.ds18b20Reset = () => false;
  assert.equal(f.context.ds18b20BeginConversion(1), false);
});

test('finish requires conversion completion and fresh presence before reading a complete CRC-checked scratchpad', () => {
  const f = fixture(), bus = [];
  f.context.ds18b20ReadBit = () => 0;
  assert.equal(f.context.ds18b20FinishConversion(1).length, 0);
  f.context.ds18b20ReadBit = () => 1;
  f.context.ds18b20Reset = () => false;
  assert.equal(f.context.ds18b20FinishConversion(1).length, 0);
  f.context.ds18b20Reset = () => true;
  f.context.ds18b20WriteByte = (_, byte) => bus.push(byte);
  const bytes = scratchpad(-10.125);
  f.context.ds18b20ReadByte = () => bytes.shift();
  assert.deepEqual([...f.context.ds18b20FinishConversion(1)], [-10.125]);
  assert.deepEqual(bus, [0xCC, 0xBE]);
});

test('UART starts only on a connected request, includes conversion time in cadence and never reuses a failed reading', () => {
  const f = fixture(); f.loadMain();
  f.send('start'); f.hooks.loop(); f.hooks.connect(); f.hooks.loop();
  assert.deepEqual(f.commands, []);
  f.samples[1] = [[-0.0625], [], [0]];
  f.send(' START ');
  const start = f.time(); f.hooks.loop();
  assert.equal(f.time() - start, 1000000);
  assert.deepEqual(f.lines, ['-0.0625,']);
  f.hooks.loop(); assert.deepEqual(f.lines, ['-0.0625,']);
  f.hooks.loop(); assert.deepEqual(f.lines, ['-0.0625,', '0,']);
  f.started.clear(); f.hooks.loop(); assert.equal(f.lines.length, 2);
  f.send('stop'); f.hooks.loop(); f.hooks.disconnect(); f.hooks.connect(); f.hooks.loop();
  f.send('unknown'); f.hooks.loop(); assert.equal(f.lines.length, 2);
});

test('stop, reconnect or a replacement start during conversion invalidates the old sample', () => {
  for (const action of ['stop', 'disconnect', 'reconnect', 'start']) {
    let interrupted = false;
    const f = fixture({ duringPause(current, ms) {
      if (ms !== 760 || interrupted) return;
      interrupted = true;
      if (action === 'disconnect' || action === 'reconnect') current.hooks.disconnect();
      if (action === 'reconnect') { current.hooks.connect(); current.send('start'); }
      if (action === 'stop' || action === 'start') current.send(action);
    } });
    f.loadMain(); f.hooks.connect(); f.send('start'); f.hooks.loop();
    assert.deepEqual(f.lines, []);
    assert.ok(!f.commands.some(([type]) => type === 'finish'));
    f.hooks.connect(); f.send('start'); f.hooks.loop();
    assert.deepEqual(f.lines, ['20,']);
  }
});

test('two probes share the conversion wait and preserve fixed columns through independent failures and recovery', () => {
  const f = fixture(); f.started.add(2);
  f.samples = { 1: [[20.0625], [], [0], []], 2: [[-10.125], [21.5], [], []] };
  f.loadMain(); f.hooks.connect(); f.send('start');
  for (let cycle = 0; cycle < 4; cycle++) {
    const start = f.time(); f.hooks.loop();
    assert.equal(f.time() - start, 1000000, 'two probes must not double the conversion wait');
  }
  assert.deepEqual(f.lines, ['20.0625,-10.125', ',21.5', '0,']);
  f.started.delete(1); f.samples[2] = [[22]]; f.hooks.loop();
  assert.equal(f.lines.at(-1), ',22');
  f.started.add(1); f.samples = { 1: [[23]], 2: [[24]] }; f.hooks.loop();
  assert.equal(f.lines.at(-1), '23,24');
});
