import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { firmwareManifest, getFirmwareArtifact } from '../../src/device/firmware.js';
import { createUniversalHexFlashDataSource } from '../../public/vendor/microbit-usb-1.0.0.js';

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
    assert.equal(artifact.digestMode, 'utf8-crlf-to-lf');
    assert.match(await createUniversalHexFlashDataSource(hex)('V2'), /^:/);
    assert.ok(Object.isFrozen(artifact)); assert.ok(Object.isFrozen(artifact.boards));
  }
});

test('published firmware source, build record, lockfile and runtime agree with the manifest', async () => {
  const lock = JSON.parse(await readFile(new URL('../../dev/firmware/package-lock.json', import.meta.url), 'utf8'));
  const runtimeHashes = new Map();
  for (const id of ['magnetometer-uart', 'temperature-uart', 'light-level-uart', 'accelerometer-uart']) {
    const artifact = getFirmwareArtifact(id), root = new URL('../../', import.meta.url);
    const record = JSON.parse(await readFile(new URL(artifact.source.buildRecord, root), 'utf8'));
    const source = (await readFile(new URL(artifact.source.path, root), 'utf8')).replace(/\r\n/g, '\n');
    assert.equal(await readFile(new URL(artifact.url.replace(/\.hex$/, '.ts')), 'utf8'), source);
    assert.equal(record.id, artifact.id); assert.equal(record.version, artifact.version);
    assert.equal(record.sourceSha256, digest(source)); assert.equal(record.hexSha256, artifact.sha256);
    assert.deepEqual(record.protocol, { codecId: artifact.codecId, startCommand: artifact.startCommand, sampleIntervalMs: artifact.sampleIntervalMs });
    assert.equal(record.embeddedSourceMatches, true); assert.equal(record.embeddedConfigMatches, true);
    assert.equal(record.officialV2Reader, true);
    assert.equal(typeof record.hardwareVerified, 'boolean'); assert.equal(record.hardwareVerified, artifact.hardwareVerified);
    assert.equal(record.target, `pxt-microbit@${lock.packages['node_modules/pxt-microbit'].version}`);
    assert.equal(record.compiler, `pxt-core@${lock.packages['node_modules/pxt-core'].version}`);
    for (const runtime of record.runtimeFiles) {
      if (!runtimeHashes.has(runtime.file)) runtimeHashes.set(runtime.file, digest(await readFile(new URL(`dev/firmware/runtime-cache/${runtime.file}`, root))));
      assert.equal(runtimeHashes.get(runtime.file), runtime.sha256);
    }
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

async function magneticFirmware(duringCalibration=()=>{}) {
  const hooks={}, lines=[], pauses=[];let command='', calibrations=0, resets=0;
  const f={hooks,lines,pauses,send(value){command=value;hooks.uart();},get calibrations(){return calibrations;},get resets(){return resets;}};
  runInNewContext(await readFile(new URL('../../firmware/examples/magnetometer.js',import.meta.url),'utf8'),{
    bluetooth:{onUartDataReceived:(_,cb)=>hooks.uart=cb,uartReadUntil:()=>command,
      onBluetoothConnected:cb=>hooks.connect=cb,onBluetoothDisconnected:cb=>hooks.disconnect=cb,
      startUartService(){},uartWriteLine:line=>lines.push(line)},
    serial:{delimiters:()=> '\n'},Delimiters:{NewLine:1},
    input:{calibrateCompass(){calibrations++;duringCalibration(f);},setAccelerometerRange(){},magneticForce:axis=>[0,-12,4,13][axis]},
    Dimension:{X:0,Y:1,Z:2,Strength:3},AcceleratorRange:{EightG:8},convertToText:String,
    control:{reset(){resets++;}},basic:{clearScreen(){},pause:ms=>pauses.push(ms),forever:cb=>hooks.loop=cb},
  });return f;
}

test('magnetic firmware acknowledges choice before calibration and only samples after completion or explicit skip', async()=>{
  for(const action of ['calibrate','skip']) {
    const f=await magneticFirmware(current=>{
      assert.equal(current.lines.at(-1),'@mag,2,calibrating');
      current.hooks.loop();assert.ok(current.lines.every(line=>line.startsWith('@mag')));
      current.send('skip'); // Cannot interrupt a running calibration with a second choice.
    });
    f.send('prepare');f.hooks.loop();assert.equal(f.lines.length,0);
    f.hooks.connect();f.send('start');f.hooks.loop();assert.equal(f.lines.length,0);
    f.send(' PREPARE ');f.hooks.loop();assert.deepEqual(f.lines,['@mag,2,choice']);
    f.send(action);f.send(action);f.hooks.loop();
    assert.deepEqual(f.lines,action==='calibrate'?['@mag,2,choice','@mag,2,calibrating','@mag,2,calibrated','0,-12,4,13']:['@mag,2,choice','@mag,2,skipped','0,-12,4,13']);
    assert.equal(f.calibrations,action==='calibrate'?1:0);assert.equal(f.pauses.at(-1),100);
    const count=f.lines.length;f.send('stop');f.hooks.loop();assert.equal(f.lines.length,count);
    f.hooks.disconnect();assert.equal(f.resets,1);f.hooks.connect();f.hooks.loop();assert.equal(f.lines.length,count);
  }
});

test('stopped or disconnected calibration cannot later report completion or resume sampling',async()=>{
  for(const interrupt of ['stop','disconnect']){
    const f=await magneticFirmware(current=>{if(interrupt==='stop')current.send('stop');else{current.hooks.disconnect();current.hooks.connect();}});
    f.hooks.connect();f.send('prepare');f.send('calibrate');f.hooks.loop();
    assert.deepEqual(f.lines,['@mag,2,choice','@mag,2,calibrating']);
    f.send('prepare');f.send('skip');f.hooks.loop();assert.equal(f.lines.at(-1),'0,-12,4,13');
  }
});
