import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute, sep } from 'node:path';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const normalizeText = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n');
export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const identifier = /^[a-z][a-z0-9-]*$/;

export function inside(root, path) {
  const target = resolve(root, path), local = relative(root, target);
  if (!local || isAbsolute(local) || local === '..' || local.startsWith('..' + sep)) throw new Error(`Path must stay inside ${root}: ${path}`);
  return target;
}

export function parseArgs(args, targetNames) {
  let target, all = false, list = false, check = false;
  for (const arg of args) {
    if (arg === '--all') all = true;
    else if (arg === '--list') list = true;
    else if (arg === '--check') check = true;
    else if (!arg.startsWith('-') && !target) target = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if ((all && target) || (list && (all || target || check)) || (all && check)) throw new Error('Use a target [--check], --all, or --list separately.');
  if (list) return { targets: [], list, check };
  const targets = all ? targetNames : [target ?? 'magnetometer'];
  for (const name of targets) if (!targetNames.includes(name)) throw new Error(`Unknown firmware target: ${name}. Use --list.`);
  return { targets, list, check };
}

/** Generates the same magnetic pxt.json bytes as before, from shared UART settings. */
export function createPlans(config, template, repository) {
  const seen = new Set(), plans = new Map();
  for (const [key, target] of Object.entries(config.targets)) {
    if (!identifier.test(key) || typeof target.id !== 'string' || !identifier.test(target.id)
      || typeof target.name !== 'string' || !identifier.test(target.name)
      || !Number.isInteger(target.version) || target.version < 1 || typeof target.description !== 'string' || !target.description
      || typeof target.source !== 'string' || typeof target.protocol?.codecId !== 'string' || !target.protocol.codecId
      || typeof target.protocol?.startCommand !== 'string' || !target.protocol.startCommand || /[\r\n]/.test(target.protocol.startCommand)
      || !Number.isFinite(target.protocol.sampleIntervalMs) || target.protocol.sampleIntervalMs <= 0) throw new Error(`Invalid firmware target: ${key}`);
    const artifact = `${target.id}-v${target.version}`;
    if (seen.has(artifact)) throw new Error(`Duplicate firmware artifact: ${artifact}`);
    seen.add(artifact);
    const sourcePath = inside(repository, target.source);
    if (!/\.(js|ts)$/.test(sourcePath)) throw new Error(`Expected a JS/TS source: ${target.source}`);
    const pxt = { name: target.name, description: target.description, dependencies: template.dependencies, files: template.files,
      targetVersions: { target: config.toolchain.target, pxt: config.toolchain.compiler }, preferredEditor: template.preferredEditor, yotta: template.yotta };
    // This profile is deliberately limited to the pinned, bundled UART runtime.
    if (JSON.stringify(pxt.dependencies) !== JSON.stringify({ core: '*', bluetooth: '*' }) || JSON.stringify(pxt.files) !== '["main.ts"]') throw new Error('Only the bundled core + bluetooth / main.ts profile is supported.');
    plans.set(key, { key, ...structuredClone(target), artifact, sourcePath, config: JSON.stringify(pxt, null, 4) + '\n' });
  }
  return plans;
}

/** Validate the complete cache before invoking the compiler. */
export async function prepareToolchain(root, toolchain) {
  for (const [name, version] of [['pxt', toolchain.cli], ['pxt-microbit', toolchain.target], ['pxt-core', toolchain.compiler]]) {
    const installed = await readJson(inside(root, `node_modules/${name}/package.json`));
    if (installed.version !== version) throw new Error(`Expected ${name}@${version}; run npm ci --ignore-scripts in dev/firmware.`);
  }
  const runtime = await readJson(inside(root, 'runtime-cache/manifest.json'));
  if (runtime.target !== `pxt-microbit@${toolchain.target}` || runtime.pxt !== `pxt-core@${toolchain.compiler}` || !runtime.files.length) throw new Error('Native runtime/toolchain version mismatch.');
  for (const file of runtime.files) {
    if (!/^[a-f0-9]{64}$/.test(file.compileSha) || file.file !== `${file.compileSha}.hex`) throw new Error('Invalid native runtime filename.');
    const input = inside(root, `runtime-cache/${file.file}`), bytes = await readFile(input);
    if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error(`Runtime cache changed: ${file.file}`);
  }
  await writeFile(inside(root, 'node_modules/pxtcli.json'), JSON.stringify({ targetdir: 'pxt-microbit' }));
  return runtime;
}

export async function verifyHex(hex, source, config, { readV2, unpack }) {
  if (!(await readV2(hex)).startsWith(':')) throw new Error('Official V2 HEX reader did not produce flash data.');
  const embedded = await unpack(hex);
  if (!embedded?.source) throw new Error('HEX has no embedded source.');
  const files = JSON.parse(embedded.source);
  if (files['main.ts'] !== source) throw new Error('Embedded HEX source does not match the selected source.');
  // PXT serializes its embedded pxt.json; compare content rather than indentation.
  const actual = JSON.parse(files['pxt.json']), expected = JSON.parse(config);
  for (const key of ['name', 'description', 'dependencies', 'files', 'targetVersions', 'preferredEditor', 'yotta']) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) throw new Error(`Embedded HEX configuration mismatch: ${key}`);
  }
}

export function checkPinned(plan, hex, source, artifact, publishedHex, publishedSource) {
  if (artifact.id !== plan.id || artifact.version !== plan.version || artifact.sha256 !== hash(hex)
    || artifact.codecId !== plan.protocol.codecId || artifact.startCommand !== plan.protocol.startCommand
    || artifact.sampleIntervalMs !== plan.protocol.sampleIntervalMs || publishedHex !== hex || publishedSource !== source) {
    throw new Error('Build differs from the pinned firmware or protocol. Review it as a new version; public files were not changed.');
  }
}

export function buildRecord(plan, toolchain, runtime, source, hex) {
  return { id: plan.id, version: plan.version, target: `pxt-microbit@${toolchain.target}`, compiler: `pxt-core@${toolchain.compiler}`, cli: `pxt@${toolchain.cli}`,
    targetCommit: toolchain.targetCommit, source: plan.source, sourceSha256: hash(source), configSha256: hash(plan.config),
    hexSha256: hash(hex), digestMode: 'utf8-crlf-to-lf', bytes: Buffer.byteLength(hex), runtimeFiles: runtime.files,
    protocol: plan.protocol, embeddedSourceMatches: true, embeddedConfigMatches: true, officialV2Reader: true, hardwareVerified: false };
}

/** The compiler may fail or return stale/mismatched output; only verified results become candidates. */
export async function buildCandidate(plan, { root, toolchain, runtime, compile, readV2, unpack, pinned = null }) {
  const source = normalizeText(await readFile(plan.sourcePath));
  const project = inside(root, `built/projects/${plan.key}`), output = inside(root, `built/artifacts/${plan.key}`);
  await mkdir(project, { recursive: true });
  await writeFile(inside(project, 'main.ts'), source);
  await writeFile(inside(project, 'pxt.json'), plan.config);
  const binary = inside(project, 'built/binary.hex');
  await rm(binary, { force: true });
  await compile(project);
  const hex = normalizeText(await readFile(binary));
  await verifyHex(hex, source, plan.config, { readV2, unpack });
  if (pinned) checkPinned(plan, hex, source, pinned.artifact, pinned.hex, pinned.source);
  const record = buildRecord(plan, toolchain, runtime, source, hex);
  await mkdir(output, { recursive: true });
  await writeFile(inside(output, `${plan.artifact}.hex`), hex);
  await writeFile(inside(output, `${plan.artifact}.ts`), source);
  await writeFile(inside(output, `${plan.artifact}.build.json`), JSON.stringify(record, null, 2) + '\n');
  return { output, record };
}
