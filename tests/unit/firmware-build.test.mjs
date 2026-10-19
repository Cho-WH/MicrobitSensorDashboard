import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { hash, inside, readJson, normalizeText, parseArgs, createPlans, prepareToolchain, buildCandidate } from '../../dev/firmware/build-support.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const config = await readJson(new URL('../../dev/firmware/targets.json', import.meta.url));
const template = await readJson(new URL('../../dev/firmware/pxt-template.json', import.meta.url));
const { readRuntime } = createRequire(import.meta.url)('../../dev/firmware/offline.cjs');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'sensor-lab-firmware-test-'));
  t.after(async () => { inside(tmpdir(), root); await rm(root, { recursive: true, force: true }); });
  return root;
}

test('target selection and common profile preserve the exact published magnetic config and accept a new source target', async () => {
  const plans = createPlans(config, template, repository), names = [...plans.keys()];
  assert.deepEqual(parseArgs([], names).targets, ['magnetometer']);
  assert.deepEqual(parseArgs(['--all'], names).targets, names);
  assert.equal(parseArgs(['--list'], names).list, true);
  assert.equal(parseArgs(['temperature', '--check'], names).check, true);
  for (const args of [['unknown'], ['--publish'], ['--all','temperature'], ['--all','--check'], ['--list','--check']]) assert.throws(() => parseArgs(args, names));
  const old = await readJson(new URL('../../public/firmware/magnetometer-build.json', import.meta.url));
  assert.equal(hash(plans.get('magnetometer').config), old.configSha256);
  const next = structuredClone(config);
  next.targets['test-sensor'] = { ...next.targets.temperature, id: 'test-uart', name: 'test-sensor', source: 'firmware/examples/test-sensor.ts' };
  const added = createPlans(next, template, repository).get('test-sensor');
  assert.equal(added.artifact, 'test-uart-v1'); assert.equal(JSON.parse(added.config).name, 'test-sensor');
  assert.equal(added.sourcePath, join(repository, 'firmware/examples/test-sensor.ts'));
});

test('bad build identities, output collisions, source traversal and remote dependency profiles fail before compilation', () => {
  for (const mutation of [
    target => { target.id = '../escape'; }, target => { target.version = 0; },
    target => { target.source = '../outside.js'; }, target => { target.protocol.startCommand = 'start\nstop'; },
  ]) { const next = structuredClone(config); mutation(next.targets.temperature); assert.throws(() => createPlans(next, template, repository)); }
  const duplicate = structuredClone(config); duplicate.targets.temperature.id = duplicate.targets.magnetometer.id;
  assert.throws(() => createPlans(duplicate, template, repository), /Duplicate/);
  assert.throws(() => createPlans(config, { ...template, dependencies: { core: '*', remote: 'github:some/package' } }, repository), /bundled/);
});

test('native provider returns only hash-verified frozen compile keys, never unrelated cached images', async t => {
  const root = await fixture(t), sha = 'a'.repeat(64), bytes = Buffer.from(':test-native-image\n');
  const entry = { compileSha: sha, file: `${sha}.hex`, sha256: hash(bytes), bytes: bytes.length };
  await writeFile(join(root, 'manifest.json'), JSON.stringify({ files: [entry] }));
  await writeFile(join(root, entry.file), bytes);
  assert.deepEqual(readRuntime(root, sha), { hex: [':test-native-image', ''] });
  assert.throws(() => readRuntime(root, 'b'.repeat(64)), /No verified native runtime/);
  assert.throws(() => readRuntime(root, '../escape'), /No verified native runtime/);
  await writeFile(join(root, entry.file), 'corrupted');
  assert.throws(() => readRuntime(root, sha), /Runtime cache changed/);
});

test('wrong compiler versions or native cache bytes fail before changing compiler configuration', async t => {
  const root = await fixture(t), { toolchain } = config;
  for (const [name, version] of [['pxt',toolchain.cli],['pxt-microbit',toolchain.target],['pxt-core',toolchain.compiler]]) {
    await mkdir(join(root, 'node_modules', name), { recursive: true });
    await writeFile(join(root, 'node_modules', name, 'package.json'), JSON.stringify({ version }));
  }
  const cli = join(root, 'node_modules/pxtcli.json'); await writeFile(cli, 'unchanged');
  await mkdir(join(root, 'runtime-cache'));
  const sha = 'a'.repeat(64), bytes = Buffer.from('native');
  const runtime = { target: `pxt-microbit@${toolchain.target}`, pxt: `pxt-core@${toolchain.compiler}`, files: [{ compileSha: sha, file: `${sha}.hex`, sha256: hash(bytes), bytes: bytes.length }] };
  await writeFile(join(root, 'runtime-cache/manifest.json'), JSON.stringify(runtime));
  await writeFile(join(root, 'runtime-cache', `${sha}.hex`), 'wrong');
  await assert.rejects(prepareToolchain(root, toolchain), /Runtime cache changed/);
  assert.equal(await readFile(cli, 'utf8'), 'unchanged');
  await writeFile(join(root, 'runtime-cache', `${sha}.hex`), bytes);
  await writeFile(join(root, 'node_modules/pxt-core/package.json'), '{"version":"0.0.0"}');
  await assert.rejects(prepareToolchain(root, toolchain), /Expected pxt-core/);
  assert.equal(await readFile(cli, 'utf8'), 'unchanged');
});

test('failed compilation, missing binary, bad HEX, embedded mismatches and changed pinned output preserve the last verified candidate', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'firmware/examples'), { recursive: true });
  await writeFile(join(root, 'firmware/examples/temperature.js'), 'let temperature = 0\r\n');
  const plan = createPlans(config, template, root).get('temperature'), source = 'let temperature = 0\n', hex = ':00000001FF\n';
  const unpack = async () => ({ source: JSON.stringify({ 'main.ts': source, 'pxt.json': plan.config }) });
  const options = { root, toolchain: config.toolchain, runtime: { files: [] }, readV2: async () => hex, unpack,
    compile: async project => { await mkdir(join(project, 'built'), { recursive: true }); await writeFile(join(project, 'built/binary.hex'), hex); } };
  const { output, record } = await buildCandidate(plan, options);
  assert.equal(record.hardwareVerified, false); assert.equal(record.embeddedConfigMatches, true);
  assert.equal(record.hexSha256, hash(hex)); assert.equal(record.sourceSha256, hash(source));
  const paths = ['hex', 'ts', 'build.json'].map(ext => join(output, `${plan.artifact}.${ext}`));
  const before = await Promise.all(paths.map(path => readFile(path, 'utf8')));
  for (const change of [
    { compile: async () => { throw new Error('compiler failed'); } },
    { compile: async () => {} }, // Must not reuse the old project binary.
    { readV2: async () => { throw new Error('invalid HEX'); } },
    { unpack: async () => ({ source: JSON.stringify({ 'main.ts': 'wrong source', 'pxt.json': plan.config }) }) },
    { unpack: async () => ({ source: JSON.stringify({ 'main.ts': source, 'pxt.json': '{}' }) }) },
    { pinned: { artifact: { id: plan.id, version: plan.version, ...plan.protocol, sha256: 'wrong' }, hex, source } },
  ]) {
    await assert.rejects(buildCandidate(plan, { ...options, ...change }));
    assert.deepEqual(await Promise.all(paths.map(path => readFile(path, 'utf8'))), before);
  }
  assert.equal(normalizeText(Buffer.from('zero\r\n')), 'zero\n');
});
