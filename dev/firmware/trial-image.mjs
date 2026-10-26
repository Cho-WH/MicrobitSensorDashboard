// Read-only verifier shared by compatibility reporting and the existing trial exporter.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createUniversalHexFlashDataSource } from '../../public/vendor/microbit-usb-1.0.0.js';
import { hash, normalizeText, readJson } from './build-support.mjs';
import { createPairingTrial } from './pairing-trial.mjs';

const require = createRequire(new URL('../usb-library/package.json', import.meta.url));
if (require('nrf-intel-hex/package.json').version !== '1.4.0') throw new Error('Use the pinned USB library dependencies.');
const MemoryMap = require('nrf-intel-hex');
const magic = Buffer.from('708e3b92c615a841c49866c975ee5197', 'hex');
// This inspector is for the existing B profile, not arbitrary firmware/address layouts.
export const trialProfile = Object.freeze({ runtimeHash: '5f21a4c8e2b240e5', runtimeStart: 0x1c000, start: 0x49000, limit: 0x73000 });

export async function readTrialImage(id, name = id) {
  const config = await readJson(new URL('targets.json', import.meta.url));
  const template = await readJson(new URL('pxt-template.json', import.meta.url));
  const plan = createPairingTrial(config, template, fileURLToPath(new URL('../../', import.meta.url)), id);
  const base = new URL(`built/artifacts/${plan.key}/${plan.artifact}`, import.meta.url);
  const hex = normalizeText(await readFile(new URL(base + '.hex')));
  const record = await readJson(new URL(base + '.build.json'));
  if (hash(hex) !== record.hexSha256 || record.configSha256 !== hash(plan.config)
    || record.sourceSha256 !== hash(normalizeText(await readFile(plan.sourcePath)))
    || !record.embeddedConfigMatches || !record.embeddedSourceMatches || record.trial?.to !== 1) {
    throw new Error('Rebuild the verified pairing trial first: ' + id);
  }
  for (const [file, path] of Object.entries(plan.additionalPaths)) {
    if (record.sourceFiles?.find(source => source.name === file)?.sha256 !== hash(normalizeText(await readFile(path)))) throw new Error('Rebuild changed trial source: ' + file);
  }
  const map = MemoryMap.fromHex(await createUniversalHexFlashDataSource(hex)('V2'));
  const { start, limit, runtimeStart } = trialProfile, header = map.slicePad(start, 32);
  if (!Buffer.from(header.slice(0, 16)).equals(magic)) throw new Error('Unexpected PXT start: ' + id);
  const runtimeHash = Buffer.from(header.slice(16, 24)).toString('hex');
  if (runtimeHash !== trialProfile.runtimeHash) throw new Error('Unexpected trial runtime: ' + id);
  const runtime = Buffer.from(map.slicePad(runtimeStart, start - runtimeStart));
  let end = start;
  for (const [address, bytes] of map) if (address < limit && address + bytes.length > start) end = Math.max(end, Math.min(address + bytes.length, limit));
  end = Math.ceil(end / 64) * 64;
  if (end <= start || end > limit) throw new Error('Invalid MakeCode region: ' + id);
  const bytes = map.slicePad(start, end - start);
  const program = { id, name, file: `${plan.artifact}.bin`, start, end, runtimeHash,
    programHash: Buffer.from(header.slice(24, 32)).toString('hex'), sha256: hash(bytes),
    hexSha256: record.hexSha256, runtimeSha256: hash(runtime), bytes: bytes.length };
  return { map, program, bytes, runtime, record };
}
