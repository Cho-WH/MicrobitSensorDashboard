import { writeFile } from 'node:fs/promises';
import { readJson } from './build-support.mjs';
import { readTrialImage, trialProfile } from './trial-image.mjs';

const { targets } = await readJson(new URL('targets.json', import.meta.url));
const programs = [];
let commonRuntime;
for (const id of Object.keys(targets)) {
  const { program, runtime, record } = await readTrialImage(id);
  if (commonRuntime && !runtime.equals(commonRuntime)) throw new Error('Runtime bytes differ: ' + id);
  commonRuntime = runtime;
  programs.push({ ...program, firmwareId: record.id, firmwareVersion: record.version, protocol: record.protocol, hardwareVerified: false });
}
const report = { profile: trialProfile, runtimeSha256: programs[0].runtimeSha256, runtimeBytesIdentical: true,
  verification: 'Static build/file compatibility only; not board installation or sensor accuracy.', programs };
await writeFile(new URL('built/artifacts/common-runtime-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.table(programs.map(p => ({ target: p.id, bytes: p.bytes, runtime: p.runtimeHash, program: p.programHash })));
console.log(`All ${programs.length} candidates have identical runtime bytes. Report: dev/firmware/built/artifacts/common-runtime-report.json`);
