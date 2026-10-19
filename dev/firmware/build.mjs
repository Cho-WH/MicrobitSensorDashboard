// Build a local candidate; publishing and the install allowlist remain separate.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createUniversalHexFlashDataSource } from '../../public/vendor/microbit-usb-1.0.0.js';
import { getFirmwareArtifact } from '../../src/device/firmware.js';
import { inside, readJson, normalizeText, parseArgs, createPlans, prepareToolchain, buildCandidate } from './build-support.mjs';

async function main() {
  const root = fileURLToPath(new URL('./', import.meta.url)), repository = fileURLToPath(new URL('../../', import.meta.url));
  const config = await readJson(inside(root, 'targets.json')), template = await readJson(inside(root, 'pxt-template.json'));
  const plans = createPlans(config, template, repository), args = parseArgs(process.argv.slice(2), [...plans.keys()]);
  if (args.list) {
    for (const plan of plans.values()) console.log(`${plan.key}: ${plan.source} → ${plan.artifact}.hex`);
    return;
  }
  const selected = args.targets.map(name => plans.get(name));
  // Reject unregistered --check requests before invoking the compiler.
  const pinned = args.check ? getFirmwareArtifact(selected[0].id, selected[0].version) : null;
  const runtime = await prepareToolchain(root, config.toolchain), require = createRequire(import.meta.url);
  require('pxt-core');
  for (const plan of selected) {
    const { output, record } = await buildCandidate(plan, { root, toolchain: config.toolchain, runtime,
      compile(project) {
        const child = spawnSync(process.execPath, ['--require', inside(root, 'offline.cjs'), inside(root, 'node_modules/pxt/pxt'), 'build', '--install', '--force'],
          { cwd: project, stdio: 'inherit', timeout: 180000, env: { ...process.env, SENSOR_LAB_OFFLINE_BUILD: '1', KS_FORCE_CLOUD: 'yes', PXT_COMPILE_SWITCHES: '', PXT_FORCE_GITHUB_PROXY: '' } });
        if (child.error) throw child.error;
        if (child.status !== 0) throw new Error(`MakeCode build failed for ${plan.key} (${child.status ?? child.signal}). Previous candidate and public files were not changed.`);
      },
      readV2: hex => createUniversalHexFlashDataSource(hex)('V2'),
      unpack: hex => globalThis.pxt.cpp.unpackSourceFromHexAsync(Buffer.from(hex)),
      pinned: pinned ? { artifact: pinned, hex: normalizeText(await readFile(new URL(pinned.url))),
        source: normalizeText(await readFile(inside(repository, `public/firmware/${plan.artifact}.ts`))) } : null,
    });
    console.log(`${pinned ? 'Pinned artifact matches' : 'Candidate generated'}: ${plan.key}\n${output}\nSHA-256 ${record.hexSha256}`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
