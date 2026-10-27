import { displayMock, sensorDisplaySource } from '../helpers/sensor-display.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import MemoryMap from 'nrf-intel-hex';
import { runInNewContext } from 'node:vm';
import { firmwareManifest, getFirmwareArtifact } from '../../src/device/firmware.js';
import { createUniversalHexFlashDataSource } from '../../public/vendor/microbit-usb-1.0.0.js';
import { verifyProgram } from '../../src/device/partial-flash.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
test('legacy temperature-light example retains start/stop, zero readings, field order and 1-second sampling', async () => {
  const source = await readFile(new URL('../../firmware/examples/temperature-light.js', import.meta.url), 'utf8');
  const hooks = {}, lines = [], pauses = []; let command = '';
  runInNewContext(source, {
    bluetooth: { startUartService() {}, onUartDataReceived: (_delimiter, cb) => hooks.uart = cb,
      uartReadUntil: () => command, uartWriteLine: line => lines.push(line) },
    serial: { delimiters: () => '\n' }, Delimiters: { NewLine: 1 },
    basic: { forever: cb => hooks.loop = cb, pause: ms => pauses.push(ms), showIcon() {}, clearScreen() {} },
    IconNames: { Yes: 1 }, input: { temperature: () => 0, lightLevel: () => 123 }, convertToText: String,
  });
  hooks.loop(); assert.deepEqual(lines, []);
  command = ' START '; hooks.uart(); hooks.loop();
  assert.deepEqual(lines, ['0,123']); assert.equal(pauses.at(-1), 1000);
  command = 'stop'; hooks.uart(); hooks.loop(); assert.equal(lines.length, 1);
});
test('all pinned HEX artifacts match their specified digest and the official V2 reader', async () => {
  for (const artifact of Object.values(firmwareManifest)) {
    const bytes = await readFile(new URL(artifact.url));
    const hex = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n');
    assert.equal(digest(hex), artifact.sha256, artifact.id);
    assert.equal(artifact.version, 1);
    assert.equal(artifact.id, 'sensor-lab-' + artifact.sensorId);
    assert.equal(artifact.digestMode, 'utf8-crlf-to-lf');
    const v2 = await createUniversalHexFlashDataSource(hex)('V2');
    assert.match(v2, /^:/);
    const map = MemoryMap.fromHex(v2), partial = artifact.partial;
    const binary = new Uint8Array(await readFile(new URL(partial.url)));
    await verifyProgram(partial, binary);
    assert.deepEqual(binary, map.slicePad(partial.start, partial.bytes));
    assert.equal(digest(map.slicePad(0x1c000, partial.start - 0x1c000)), partial.runtimeSha256);
    assert.equal(partial.runtimeSha256, firmwareManifest['sensor-lab-temperature'].partial.runtimeSha256);
    assert.ok(Object.isFrozen(artifact)); assert.ok(Object.isFrozen(artifact.boards));
  }
});

test('retired pre-V1 identities cannot be resolved as installable artifacts', () => {
  for (const sensor of ['temperature', 'light-level', 'accelerometer', 'magnetometer', 'bmp280']) {
    for (const version of [null, 1, 2, 3, 4, 5])
      assert.throws(() => getFirmwareArtifact(sensor + '-uart', version), { code: 'unknown-firmware' });
  }
});

test('published firmware source, build record, lockfile and runtime agree with the manifest', async () => {
  const lock = JSON.parse(await readFile(new URL('../../dev/firmware/package-lock.json', import.meta.url), 'utf8'));
  const runtimeHashes = new Map();
  for (const id of Object.keys(firmwareManifest)) {
    const artifact = getFirmwareArtifact(id), root = new URL('../../', import.meta.url);
    const record = JSON.parse(await readFile(new URL(artifact.source.buildRecord, root), 'utf8'));
    const source = (await readFile(new URL(artifact.source.path, root), 'utf8')).replace(/\r\n/g, '\n');
    const downloadSource = (await readFile(new URL(artifact.url.replace(/\.hex$/, '.ts')), 'utf8')).replace(/\r\n/g, '\n');
    assert.equal(digest(downloadSource), record.downloadSourceSha256 ?? record.sourceSha256);
    for (const extra of record.sourceFiles ?? []) assert.equal(digest((await readFile(new URL(extra.source, root), 'utf8')).replace(/\r\n/g, '\n')), extra.sha256);
    assert.equal(record.id, artifact.id); assert.equal(record.version, artifact.version);
    assert.equal(record.sourceSha256, digest(source)); assert.equal(record.hexSha256, artifact.sha256);
    assert.deepEqual(record.protocol, { codecId: artifact.codecId, startCommand: artifact.startCommand, sampleIntervalMs: artifact.sampleIntervalMs });
    assert.equal(record.embeddedSourceMatches, true); assert.equal(record.embeddedConfigMatches, true);
    assert.equal(record.officialV2Reader, true);
    assert.equal(typeof record.hardwareVerified, 'boolean'); assert.equal(record.hardwareVerified, artifact.hardwareVerified);
    assert.equal(record.target, `pxt-microbit@${lock.packages['node_modules/pxt-microbit'].version}`);
    assert.equal(record.compiler, `pxt-core@${lock.packages['node_modules/pxt-core'].version}`);
    for (const runtime of record.runtimeFiles) {
      if (!runtimeHashes.has(runtime.file)) runtimeHashes.set(runtime.file, digest(await readFile(new URL(`dev/firmware/runtime-cache-pairing/${runtime.file}`, root))));
      assert.equal(runtimeHashes.get(runtime.file), runtime.sha256);
    }
  }
});

async function builtInFirmware(name, duringPause = () => {}) {
  const screen = displayMock();
  const hooks = {}, lines = [], pauses = [], ranges = [];
  let command = '', lightCalls = 0;
  const fixture = { screen, hooks, lines, pauses, ranges, send(value) { command = value; hooks.uart(); }, get lightCalls() { return lightCalls; } };
  runInNewContext(sensorDisplaySource + await readFile(new URL(`../../firmware/examples/${name}.js`, import.meta.url), 'utf8'), {
    ...screen,
    bluetooth: { startUartService() {}, onBluetoothConnected: cb => hooks.connect = cb, onBluetoothDisconnected: cb => hooks.disconnect = cb,
      onUartDataReceived: (_delimiter, cb) => hooks.uart = cb, uartReadUntil: () => command, uartWriteLine: line => lines.push(line) },
    serial: { delimiters: () => '\n' }, Delimiters: { NewLine: 1 },
    basic: { ...screen.basic, forever: cb => { if (!hooks.display) hooks.display = cb; else hooks.loop = cb; }, pause: ms => { pauses.push(ms); duringPause(fixture, ms); } },
    input: { ...screen.input, temperature: () => 0, lightLevel: () => { lightCalls++; return lightCalls === 1 ? 0 : lightCalls === 2 ? 123 : 0; },
      acceleration: axis => [0, -12, -1000, 1000][axis], setAccelerometerRange: value => ranges.push(value) },
    Dimension: { X: 0, Y: 1, Z: 2, Strength: 3 }, AcceleratorRange: { EightG: 8 }, convertToText: String,
  });
  return fixture;
}

test('new built-in firmware needs a fresh start after each connection and preserves field order and interval', async () => {
  for (const [name, expected, ms] of [['temperature','0',1000], ['light-level','123',100], ['accelerometer','0,-12,-1000,1000',100]]) {
    const f = await builtInFirmware(name);
    f.send('start'); f.hooks.loop(); assert.equal(f.lines.length, 0);
    f.hooks.display(); assert.equal(f.screen.scrolls.length, 1, 'an offline command must not hide device identification');
    f.hooks.connect(); f.hooks.loop(); assert.equal(f.lines.length, 0);
    f.send(' START '); f.hooks.loop(); assert.equal(f.lines[0], expected); assert.equal(f.pauses.at(-1), ms);
    f.hooks.display(); assert.equal(f.screen.pixels.some(Boolean), name !== 'light-level');
    if (name === 'light-level') { assert.equal(f.lightCalls, 2); f.hooks.loop(); assert.equal(f.lines.at(-1), '0'); }
    if (name === 'accelerometer') assert.deepEqual(f.ranges, [8]);
    const count = f.lines.length;
    f.send('stop'); f.hooks.loop(); assert.equal(f.lines.length, count);
    f.hooks.display(); assert.ok(f.screen.pixels.every(x => x === 0));
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

async function magneticFirmware(duringCalibration=()=>{}) {
  const screen = displayMock();
  const hooks={}, lines=[], pauses=[];let command='', calibrations=0, resets=0;
  const f={screen,hooks,lines,pauses,send(value){command=value;hooks.uart();},get calibrations(){return calibrations;},get resets(){return resets;}};
  runInNewContext(sensorDisplaySource + await readFile(new URL('../../firmware/examples/magnetometer.js',import.meta.url),'utf8'),{
    ...screen,
    bluetooth:{onUartDataReceived:(_,cb)=>hooks.uart=cb,uartReadUntil:()=>command,
      onBluetoothConnected:cb=>hooks.connect=cb,onBluetoothDisconnected:cb=>hooks.disconnect=cb,
      startUartService(){},uartWriteLine:line=>lines.push(line)},
    serial:{delimiters:()=> '\n'},Delimiters:{NewLine:1},
    input:{...screen.input,calibrateCompass(){calibrations++;duringCalibration(f);},setAccelerometerRange(){},magneticForce:axis=>[0,-12,4,13][axis]},
    Dimension:{X:0,Y:1,Z:2,Strength:3},AcceleratorRange:{EightG:8},convertToText:String,
    control:{...screen.control,reset(){resets++;}},basic:{...screen.basic,pause:ms=>pauses.push(ms),forever:cb=>{if(!hooks.display)hooks.display=cb;else hooks.loop=cb;}},
  });return f;
}

test('magnetic firmware acknowledges choice before calibration and only samples after completion or explicit skip', async()=>{
  for(const action of ['calibrate','skip']) {
    const f=await magneticFirmware(current=>{
      assert.equal(current.lines.at(-1),'@mag,2,calibrating');
      current.screen.led.plot(4,4); current.hooks.display();
      assert.deepEqual(current.screen.pixels,[...Array(24).fill(0),1]);
      current.hooks.loop();assert.ok(current.lines.every(line=>line.startsWith('@mag')));
      current.send('skip'); // Cannot interrupt a running calibration with a second choice.
    });
    f.send('prepare');f.hooks.loop();assert.equal(f.lines.length,0);
    f.hooks.connect();f.send('start');f.hooks.loop();assert.equal(f.lines.length,0);
    f.send(' PREPARE ');f.hooks.loop();assert.deepEqual(f.lines,['@mag,2,choice']);
    f.send(action);f.send(action);
    f.hooks.loop();
    assert.deepEqual(f.lines,action==='calibrate'?['@mag,2,choice','@mag,2,calibrating','@mag,2,calibrated','0,-12,4,13']:['@mag,2,choice','@mag,2,skipped','0,-12,4,13']);
    assert.equal(f.calibrations,action==='calibrate'?1:0);assert.equal(f.pauses.at(-1),100);
    const count=f.lines.length;f.send('stop');f.hooks.loop();assert.equal(f.lines.length,count);
    f.hooks.disconnect();assert.equal(f.resets,0);f.hooks.connect();f.hooks.loop();assert.equal(f.lines.length,count);
  }
});

test('stopped or disconnected calibration cannot automatically report completion or resume sampling',async()=>{
  for(const interrupt of ['stop','disconnect']){
    const f=await magneticFirmware(current=>{if(interrupt==='stop')current.send('stop');else{current.hooks.disconnect();current.hooks.connect();}});
    f.hooks.connect();f.send('prepare');f.send('calibrate');f.hooks.loop();
    assert.deepEqual(f.lines,['@mag,2,choice','@mag,2,calibrating']);
    f.send('prepare');assert.equal(f.lines.at(-1),'@mag,2,calibrated');
    f.hooks.loop();assert.equal(f.lines.at(-1),'0,-12,4,13');
  }
});

test('magnetic firmware does not answer prepare during calibration and retains completion for the next request',async()=>{
  const f=await magneticFirmware(current=>{
    for(let i=0;i<2;i++) {
      current.hooks.disconnect();current.hooks.connect();
      const count=current.lines.length;
      current.hooks.loop();assert.equal(current.lines.length,count);
      current.send('prepare');
      current.send('calibrate');current.send('skip');current.hooks.loop();
      assert.equal(current.lines.length,count);
    }
  });
  f.hooks.connect();f.send('prepare');f.send('calibrate');
  assert.deepEqual(f.lines,['@mag,2,choice','@mag,2,calibrating']);
  f.send('prepare');
  assert.equal(f.calibrations,1);assert.equal(f.resets,0);
  assert.equal(f.lines.at(-1),'@mag,2,calibrated');
  f.hooks.loop();assert.equal(f.lines.at(-1),'0,-12,4,13');
});

test('calibration completed offline is retained across connections and stop until a new boot',async()=>{
  const f=await magneticFirmware(current=>current.hooks.disconnect());
  f.hooks.connect();f.send('prepare');f.send('calibrate');
  f.hooks.connect();f.hooks.loop();
  assert.deepEqual(f.lines,['@mag,2,choice','@mag,2,calibrating']);
  for(let i=0;i<2;i++) {
    f.send('prepare');assert.equal(f.lines.at(-1),'@mag,2,calibrated');
    f.hooks.loop();assert.equal(f.lines.at(-1),'0,-12,4,13');
    f.send('stop');f.hooks.disconnect();f.hooks.connect();
  }
  assert.equal(f.calibrations,1);
  const rebooted=await magneticFirmware();rebooted.hooks.connect();rebooted.send('prepare');
  assert.deepEqual(rebooted.lines,['@mag,2,choice']);
});

test('skipping calibration does not retain a completed calibration on reconnect',async()=>{
  const f=await magneticFirmware();f.hooks.connect();f.send('prepare');f.send('skip');
  f.hooks.disconnect();f.hooks.connect();f.send('prepare');
  assert.equal(f.lines.at(-1),'@mag,2,choice');assert.equal(f.calibrations,0);
});
