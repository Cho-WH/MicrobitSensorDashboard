import { writeFile } from 'node:fs/promises';
import { readJson, parseArgs } from './build-support.mjs';
import { readFirmwareImage, firmwareProfile } from './firmware-image.mjs';

const config = await readJson(new URL('targets.json', import.meta.url));
const releases = parseArgs([], Object.keys(config.targets), config.releases).targets;
const programs = [];
let commonRuntime;
for (const id of releases) {
  const { program, runtime, record } = await readFirmwareImage(id);
  if (commonRuntime && !runtime.equals(commonRuntime)) throw new Error('Runtime bytes differ: ' + id);
  commonRuntime = runtime;
  programs.push({ ...program, firmwareId: record.id, firmwareVersion: record.version, protocol: record.protocol, hardwareVerified: false });
}
const report = { profile: firmwareProfile, runtimeSha256: programs[0].runtimeSha256, runtimeBytesIdentical: true,
  verification: 'Static build/file compatibility only; not board installation or sensor accuracy.', programs };
await writeFile(new URL('built/artifacts/common-runtime-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.table(programs.map(p => ({ target: p.id, bytes: p.bytes, runtime: p.runtimeHash, program: p.programHash })));
console.log(`All ${programs.length} candidates have identical runtime bytes. Report: dev/firmware/built/artifacts/common-runtime-report.json`);
