import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { firmwareManifest, getFirmwareArtifact } from '../../src/device/firmware.js';
import { createUniversalHexFlashDataSource } from '../../public/vendor/microbit-usb-1.0.0.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
test('built-in temperature examples retain start/stop, zero readings, field order and nominal 1-second sampling', async () => {
  for (const [name, expected] of [['temperature', '0'], ['temperature-light', '0,123']]) {
    const source = await readFile(new URL(`../../firmware/examples/${name}.js`, import.meta.url), 'utf8');
    const hooks = {}, lines = [], pauses = []; let command = '';
    runInNewContext(source, {
      bluetooth: { startUartService() {}, onBluetoothConnected: cb => hooks.connect = cb, onBluetoothDisconnected: cb => hooks.disconnect = cb,
        onUartDataReceived: (_delimiter, cb) => hooks.uart = cb,
        uartReadUntil: () => command, uartWriteLine: line => lines.push(line) },
      serial: { delimiters: () => '\n' }, Delimiters: { NewLine: 1 },
      basic: { forever: cb => hooks.loop = cb, pause: ms => pauses.push(ms), showIcon() {}, clearScreen() {} },
      IconNames: { Yes: 1 }, input: { temperature: () => 0, lightLevel: () => 123 }, convertToText: String,
    });
    hooks.connect?.(); hooks.loop(); assert.deepEqual(lines, []);
    command = ' START '; hooks.uart(); hooks.loop();
    assert.deepEqual(lines, [expected]); assert.equal(pauses.at(-1), 1000);
    command = 'stop'; hooks.uart(); hooks.loop(); assert.equal(lines.length, 1);
  }
});
test('all pinned HEX artifacts match their specified digest and the official V2 reader', async () => {
  for (const artifact of Object.values(firmwareManifest)) {
    const bytes = await readFile(new URL(artifact.url));
    const hex = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n');
    assert.equal(digest(hex), artifact.sha256, artifact.id);
    assert.equal(artifact.digestMode, 'utf8-crlf-to-lf');
    assert.match(await createUniversalHexFlashDataSource(hex)('V2'), /^:/);
    assert.equal(artifact.hardwareVerified, false);
    assert.ok(Object.isFrozen(artifact)); assert.ok(Object.isFrozen(artifact.boards));
  }
});

test('new built-in published source, build record and manifest agree on version, digest and protocol', async () => {
  for (const id of ['temperature-uart', 'light-level-uart', 'accelerometer-uart']) {
    const artifact = getFirmwareArtifact(id), root = new URL('../../', import.meta.url);
    const record = JSON.parse(await readFile(new URL(artifact.source.buildRecord, root), 'utf8'));
    const source = (await readFile(new URL(artifact.source.path, root), 'utf8')).replace(/\r\n/g, '\n');
    assert.equal(await readFile(new URL(artifact.url.replace(/\.hex$/, '.ts')), 'utf8'), source);
    assert.equal(record.id, artifact.id); assert.equal(record.version, artifact.version);
    assert.equal(record.sourceSha256, digest(source)); assert.equal(record.hexSha256, artifact.sha256);
    assert.deepEqual(record.protocol, { codecId: artifact.codecId, startCommand: artifact.startCommand, sampleIntervalMs: artifact.sampleIntervalMs });
    assert.equal(record.embeddedSourceMatches, true); assert.equal(record.embeddedConfigMatches, true);
    assert.equal(record.officialV2Reader, true); assert.equal(record.hardwareVerified, false);
  }
});

async function builtInFirmware(name, duringPause = () => {}) {
  const hooks = {}, lines = [], pauses = [], ranges = [];
  let command = '', lightCalls = 0;
  const fixture = { hooks, lines, pauses, ranges, send(value) { command = value; hooks.uart(); }, get lightCalls() { return lightCalls; } };
  runInNewContext(await readFile(new URL(`../../firmware/examples/${name}.js`, import.meta.url), 'utf8'), {
    bluetooth: { startUartService() {}, onBluetoothConnected: cb => hooks.connect = cb, onBluetoothDisconnected: cb => hooks.disconnect = cb,
      onUartDataReceived: (_delimiter, cb) => hooks.uart = cb, uartReadUntil: () => command, uartWriteLine: line => lines.push(line) },
    serial: { delimiters: () => '\n' }, Delimiters: { NewLine: 1 },
    basic: { clearScreen() {}, forever: cb => hooks.loop = cb, pause: ms => { pauses.push(ms); duringPause(fixture, ms); } },
    input: { temperature: () => 0, lightLevel: () => { lightCalls++; return lightCalls === 1 ? 0 : lightCalls === 2 ? 123 : 0; },
      acceleration: axis => [0, -12, -1000, 1000][axis], setAccelerometerRange: value => ranges.push(value) },
    Dimension: { X: 0, Y: 1, Z: 2, Strength: 3 }, AcceleratorRange: { EightG: 8 }, convertToText: String,
  });
  return fixture;
}

test('new built-in firmware needs a fresh start after each connection and preserves field order and interval', async () => {
  for (const [name, expected, ms] of [['temperature','0',1000], ['light-level','123',100], ['accelerometer','0,-12,-1000,1000',100]]) {
    const f = await builtInFirmware(name);
    f.send('start'); f.hooks.loop(); assert.equal(f.lines.length, 0);
    f.hooks.connect(); f.hooks.loop(); assert.equal(f.lines.length, 0);
    f.send(' START '); f.hooks.loop(); assert.equal(f.lines[0], expected); assert.equal(f.pauses.at(-1), ms);
    if (name === 'light-level') { assert.equal(f.lightCalls, 2); f.hooks.loop(); assert.equal(f.lines.at(-1), '0'); }
    if (name === 'accelerometer') assert.deepEqual(f.ranges, [8]);
    const count = f.lines.length;
    f.send('stop'); f.hooks.loop(); assert.equal(f.lines.length, count);
    f.send('start'); f.hooks.disconnect(); f.hooks.connect(); f.hooks.loop(); assert.equal(f.lines.length, count);
    f.send('start'); f.hooks.loop(); assert.equal(f.lines.length, count + 1);
  }
});

test('light warmup cannot revive an old start after stop or disconnect and reconnect', async () => {
  for (const event of ['stop', 'reconnect']) {
    let interrupted = false;
    const f = await builtInFirmware('light-level', (current, ms) => {
      if (ms !== 100 || interrupted) return; interrupted = true;
      if (event === 'stop') current.send('stop'); else { current.hooks.disconnect(); current.hooks.connect(); }
    });
    f.hooks.connect(); f.send('start'); f.hooks.loop(); assert.equal(f.lines.length, 0);
    f.send('start'); f.hooks.loop(); assert.equal(f.lines.length, 1);
  }
});

test('magnetic build record matches the checked-in source, package lock, HEX and frozen runtime images', async () => {
  const source = (await readFile(new URL('../../firmware/examples/magnetometer.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const record = JSON.parse(await readFile(new URL('../../public/firmware/magnetometer-build.json', import.meta.url), 'utf8'));
  const published = await readFile(new URL('../../public/firmware/magnetometer-uart-v1.ts', import.meta.url), 'utf8');
  const lock = JSON.parse(await readFile(new URL('../../dev/firmware/package-lock.json', import.meta.url), 'utf8'));
  assert.equal(source, published); assert.equal(digest(source), record.sourceSha256);
  assert.equal(record.hexSha256, getFirmwareArtifact('magnetometer-uart').sha256);
  assert.equal(record.embeddedSourceMatches, true); assert.equal(record.hardwareVerified, false);
  assert.equal(lock.packages['node_modules/pxt-microbit'].version, '9.1.1');
  assert.equal(lock.packages['node_modules/pxt-core'].version, '13.0.1');
  for (const runtime of record.runtimeFiles) {
    const bytes = await readFile(new URL(`../../dev/firmware/runtime-cache/${runtime.file}`, import.meta.url));
    assert.equal(digest(bytes), runtime.sha256);
  }
});

test('magnetic source waits for start and calibration, sends X/Y/Z/strength, stops on other commands and resets on disconnect', async () => {
  const source = await readFile(new URL('../../firmware/examples/magnetometer.js', import.meta.url), 'utf8');
  for (const skipCalibration of [false, true]) {
    const hooks = {}, calls = [], lines = []; let command = '', linked = false;
    const context = {
      bluetooth: { onUartDataReceived: (_delimiter, cb) => hooks.uart = cb, uartReadUntil: () => command,
        onBluetoothConnected: cb => hooks.connect = cb, onBluetoothDisconnected: cb => hooks.disconnect = cb,
        startUartService: () => calls.push('service'), uartWriteLine: line => { calls.push('sample'); lines.push(line); } },
      serial: { delimiters: () => '\n' }, Delimiters: { NewLine: 1 },
      input: { buttonIsPressed: () => skipCalibration, calibrateCompass: () => calls.push('calibrate'),
        setAccelerometerRange: () => {}, magneticForce: axis => [0, -12, 4, 12.649110640673518][axis] },
      Button: { A: 0, B: 1 }, Dimension: { X: 0, Y: 1, Z: 2, Strength: 3 }, AcceleratorRange: { EightG: 1 },
      control: { deviceName: () => 'hello', reset: () => calls.push('reset') }, convertToText: String,
      basic: { showString: () => { if (!linked) { linked = true; hooks.connect(); } }, showIcon: () => {},
        clearScreen: () => {}, pause: () => {}, forever: cb => hooks.loop = cb }, IconNames: { Yes: 1 },
    };
    runInNewContext(source, context); hooks.loop(); assert.equal(lines.length, 0);
    command = ' START '; hooks.uart(); hooks.loop();
    assert.equal(lines[0], '0,-12,4,12.649110640673518');
    assert.equal(calls.includes('calibrate'), !skipCalibration);
    if (!skipCalibration) assert.ok(calls.indexOf('calibrate') < calls.indexOf('sample'));
    command = 'stop'; hooks.uart(); hooks.loop(); assert.equal(lines.length, 1);
    hooks.disconnect(); assert.equal(calls.at(-1), 'reset');
  }
});
