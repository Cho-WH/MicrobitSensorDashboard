import { displayMock, sensorDisplaySource } from '../helpers/sensor-display.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { decodeBmp280 } from '../../src/catalog/sensors/bmp280/codec.js';

const driver = ts.transpile(await readFile(new URL('../../firmware/drivers/bmp280.ts', import.meta.url), 'utf8'), { target: ts.ScriptTarget.ES2020 });
const bmpMain = await readFile(new URL('../../firmware/examples/bmp280.js', import.meta.url), 'utf8');
const analogMain = await readFile(new URL('../../firmware/examples/analog-raw.js', import.meta.url), 'utf8');
const coefficients = [27504, 26435, -1000, 36477, -10685, 3024, 2855, 140, -7, 15500, -14600, 6000];

// Synthetic register vectors, evaluated independently with Bosch's int64 formula.
// BMP280 DS001-26 §3.11.3/§8; these are arithmetic checks, not sensor accuracy data.
const vectors = [
  [350000, 500000, -28.47, 79212.3515625],
  [400000, 480000, -12.64, 84426.8828125],
  [519888, 415148, 25.08, 100653.25390625],
  [650000, 520000, 65.66, 87694.875],
];

function fixture({ address = 0x76, identity = 0x58, duringPause = () => {} } = {}) {
  const registers = Buffer.alloc(256), reads = [], writes = [], lines = [], pauses = [], analogReads = [], hooks = {};
  let command = '', selectedRegister = 0;
  registers[0xD0] = identity;
  coefficients.forEach((value, index) => registers.writeUInt16LE(value & 65535, 0x88 + index * 2));
  function setRaw(register, value) { registers[register] = value >> 12; registers[register + 1] = (value >> 4) & 255; registers[register + 2] = (value & 15) << 4; }
  setRaw(0xFA, 519888); setRaw(0xF7, 415148);
  const f = { registers, reads, writes, lines, pauses, analogReads, hooks, setRaw, send(value) { command = value; hooks.uart(); } };
  const screen = displayMock();
  f.context = createContext({
    ...screen,
    Math, convertToText: String, AnalogPin: { P0: 0, P1: 1, P2: 2 }, NumberFormat: { UInt8BE: 1 },
    pins: {
      createBuffer: size => Buffer.alloc(size),
      i2cWriteNumber(device, register, format, repeated) { assert.equal(repeated, true); selectedRegister = register; },
      i2cReadBuffer(device, length) {
        reads.push({ device, register: selectedRegister, length });
        return device === address ? Buffer.from(registers.subarray(selectedRegister, selectedRegister + length)) : Buffer.alloc(length);
      },
      i2cWriteBuffer(device, bytes) { writes.push({ device, register: bytes[0], value: bytes[1] }); },
      analogReadPin(pin) { analogReads.push(pin); return [0, 512, 1023][pin]; },
    },
    bluetooth: { startUartService() {}, onBluetoothConnected: cb => hooks.connect = cb, onBluetoothDisconnected: cb => hooks.disconnect = cb,
      onUartDataReceived: (_, cb) => hooks.uart = cb, uartReadUntil: () => command, uartWriteLine: line => lines.push(line) },
    serial: { delimiters: () => '\n' }, Delimiters: { NewLine: 1 },
    basic: { ...screen.basic, forever: cb => hooks.loop = cb, pause: ms => { pauses.push(ms); duringPause(f, ms); } },
  });
  runInContext(sensorDisplaySource + driver, f.context);
  return f;
}

test('BMP280 compensation agrees with independent fixed-point vectors across negative and positive temperatures', () => {
  const f = fixture();
  assert.equal(f.reads.length, 0, 'loading the driver must not initialize an external sensor');
  for (const [rawT, rawP, expectedT, expectedP] of vectors) {
    const [temperature, pressure] = f.context.bmp280Compensate(rawT, rawP, coefficients);
    assert.ok(Math.abs(temperature - expectedT) < 0.01, `${rawT}: ${temperature}`);
    assert.ok(Math.abs(pressure - expectedP) < 0.2, `${rawT}: ${pressure} vs ${expectedP}`);
  }
  const sample = f.context.bmp280Compensate(519888, 415148, coefficients);
  assert.ok(Math.abs(sample[0] - 25.08247793081682) < 1e-9);
  // Celsius is returned directly, without the old caller's compensating /256 /100.
  assert.equal(Math.round(sample[0] * 100) / 100, 25.08);
  for (const [rawT, rawP, c] of [[0x80000, 415148, coefficients], [519888, 0x80000, coefficients], [-1, 415148, coefficients], [519888, 1048576, coefficients], [519888, 415148, []], [519888, 415148, coefficients.map((x,i) => i === 3 ? 0 : x)]]) {
    assert.equal(f.context.bmp280Compensate(rawT, rawP, c).length, 0);
  }
});

test('BMP280 selects the address before calibration and reads both channels in one coherent burst', () => {
  for (const options of [{ address: 0x76, identity: 0x58 }, { address: 0x77, identity: 0x60 }]) {
    const f = fixture(options);
    assert.equal(f.context.bmp280Initialize(), true);
    assert.deepEqual(f.reads.filter(r => r.register === 0x88), [{ device: options.address, register: 0x88, length: 24 }]);
    f.reads.length = 0;
    const result = f.context.bmp280ReadSample();
    assert.deepEqual(f.reads, [{ device: options.address, register: 0xF7, length: 6 }]);
    assert.ok(Math.abs(result[0] - 25.08247793081682) < 1e-9, 'signed calibration words must be decoded correctly');
    assert.ok(Math.abs(result[1] - 100653.25390625) < 0.2);
    assert.equal(f.writes.some(w => w.register === 0xF2), false, 'humidity registers are unused');
  }
});

test('missing identity, corrupt coefficients and NVM timeout cannot create a valid sample', () => {
  const missing = fixture({ identity: 0 }); assert.equal(missing.context.bmp280Initialize(), false); assert.equal(missing.writes.length, 0);
  const corrupt = fixture(); corrupt.registers.fill(0, 0x88, 0xA0); assert.equal(corrupt.context.bmp280Initialize(), false);
  const busy = fixture(); busy.registers[0xF3] = 1; assert.equal(busy.context.bmp280Initialize(), false); assert.ok(busy.pauses.length <= 11);
  for (const f of [corrupt, busy]) assert.equal(f.writes.some(w => w.register === 0xF4), false);
});

test('BMP280 candidate preserves wire columns, missing humidity and fresh-start lifecycle', () => {
  const f = fixture(); runInContext(bmpMain, f.context);
  f.send('bme'); f.hooks.loop(); assert.equal(f.reads.length, 0);
  f.hooks.connect(); f.hooks.loop(); assert.equal(f.lines.length, 0);
  f.send(' BME '); f.hooks.loop();
  const sample = decodeBmp280(f.lines[0]);
  assert.ok(Math.abs(sample.values.temperatureC - 25.08247793081682) < 1e-9);
  assert.ok(Math.abs(sample.values.pressureHpa - 1006.5325390625) < 0.002);
  assert.equal(sample.rawExtra.humidityValidity, 'unsupported'); assert.equal(sample.rawExtra.humidityToken, '');
  assert.equal(f.pauses.at(-1), 100);
  f.setRaw(0xFA, 0x80000); f.hooks.loop();
  assert.deepEqual(decodeBmp280(f.lines.at(-1)).validity, { temperatureC: 'missing', pressureHpa: 'missing' });
  const count = f.lines.length;
  f.send('stop'); f.hooks.loop(); f.hooks.disconnect(); f.hooks.connect(); f.hooks.loop(); assert.equal(f.lines.length, count);
});

test('a late sensor initialization cannot resume a stopped or replaced request', () => {
  for (const interrupt of ['stop', 'reconnect']) {
    let interrupted = false;
    const f = fixture({ duringPause(current, ms) {
      if (ms !== 2 || interrupted) return;
      interrupted = true;
      if (interrupt === 'stop') current.send('stop');
      else { current.hooks.disconnect(); current.hooks.connect(); current.send('bme'); }
    } });
    runInContext(bmpMain, f.context); f.hooks.connect(); f.send('bme'); f.hooks.loop();
    assert.equal(f.lines.length, 0);
    f.send('bme'); f.hooks.loop(); assert.equal(f.lines.length, 1);
  }
});

test('analog foundation preserves zero and full scale, channel order and fresh-start behavior', () => {
  const f = fixture(); runInContext(analogMain, f.context);
  f.send('start'); f.hooks.loop(); f.hooks.connect(); f.hooks.loop(); assert.equal(f.analogReads.length, 0);
  f.send(' START '); f.hooks.loop();
  assert.deepEqual(f.lines, ['0,512,1023']); assert.deepEqual(f.analogReads, [0,1,2]); assert.equal(f.pauses.at(-1), 100);
  f.send('stop'); f.hooks.loop(); f.hooks.disconnect(); f.hooks.connect(); f.hooks.loop(); assert.equal(f.lines.length, 1);
  f.send('start'); f.hooks.loop(); assert.equal(f.lines.length, 2);
});
