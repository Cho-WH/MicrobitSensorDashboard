import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { inside, readJson, prepareToolchain, buildCandidate, parseArgs } from './build-support.mjs';
import { createPairingTrial } from './pairing-trial.mjs';
import { createUniversalHexFlashDataSource } from '../../public/vendor/microbit-usb-1.0.0.js';
import { firmwareManifest } from '../../src/device/firmware.js';

async function main() {
  const args = process.argv.slice(2);
  const selected = args.filter(arg => arg !== '--fetch-runtime');
  if (args.filter(arg => arg === '--fetch-runtime').length > 1 || selected.includes('--check')) throw new Error('Usage: node dev/firmware/build-pairing-trial.mjs [target|--all|--list] [--fetch-runtime]');
  const root = fileURLToPath(new URL('./', import.meta.url)), repository = fileURLToPath(new URL('../../', import.meta.url));
  const config = await readJson(inside(root, 'targets.json')), template = await readJson(inside(root, 'pxt-template.json'));
  const selection = parseArgs(selected.length ? selected : ['temperature'], Object.keys(config.targets));
  if (selection.list) { console.log(Object.keys(config.targets).join('\n')); return; }
  await prepareToolchain(root, config.toolchain); // Verify installed pinned tools and unchanged baseline cache first.
  createRequire(import.meta.url)('pxt-core');
  const runtime = { files: [] };
  const compile = (project, fetchRuntime) => {
    const child = spawnSync(process.execPath, ['--require', inside(root, 'trial-runtime.cjs'), inside(root, 'node_modules/pxt/pxt'), 'build', '--install', '--force'],
      { cwd: project, stdio: 'inherit', timeout: 660000,
        env: { ...process.env, SENSOR_LAB_OFFLINE_BUILD: '0', SENSOR_LAB_FETCH_TRIAL_RUNTIME: fetchRuntime ? '1' : '0',
          KS_FORCE_CLOUD: 'yes', PXT_COMPILE_SWITCHES: '', PXT_FORCE_GITHUB_PROXY: '' } });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`Trial build failed (${child.status ?? child.signal}); published firmware was not changed.`);
  };
  for (const target of selection.targets) {
    const plan = createPairingTrial(config, template, repository, target);
    const { output, record } = await buildCandidate(plan, { root, toolchain: config.toolchain, runtime,
      async compile(project) {
        if (args.includes('--fetch-runtime')) compile(project, true);
        Object.assign(runtime, await prepareToolchain(root, config.toolchain, 'runtime-cache-pairing'));
        // Every candidate is rebuilt through hash-checked offline inputs.
        compile(project, false);
      },
      readV2: hex => createUniversalHexFlashDataSource(hex)('V2'),
      unpack: hex => globalThis.pxt.cpp.unpackSourceFromHexAsync(Buffer.from(hex)),
    });
    const published = firmwareManifest[plan.id];
    record.trial = { name: plan.artifact, baseline: published ? `${published.id}-v${published.version}` : null,
      changedSetting: 'yotta.config.microbit-dal.bluetooth.pairing_mode', from: 0, to: 1, installMethod: 'USB', supportedBoard: 'V2' };
    await writeFile(inside(output, `${plan.artifact}.build.json`), JSON.stringify(record, null, 2) + '\n');
    console.log(`USB trial ready: ${output}\nSHA-256 ${record.hexSha256}`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
