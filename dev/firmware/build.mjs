// Build verified candidates with the same open-link profile as the official releases.
// Publication is explicit and separate from compilation.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { inside, readJson, normalizeText, createPlans, prepareToolchain, buildCandidate, parseArgs } from './build-support.mjs';
import { createUniversalHexFlashDataSource } from '../../public/vendor/microbit-usb-1.0.0.js';
import { getFirmwareArtifact } from '../../src/device/firmware.js';

async function main() {
  const input = process.argv.slice(2), fetchRuntime = input.includes('--fetch-runtime');
  if (input.filter(arg => arg === '--fetch-runtime').length > 1) throw new Error('Use --fetch-runtime only once.');
  const root = fileURLToPath(new URL('./', import.meta.url)), repository = fileURLToPath(new URL('../../', import.meta.url));
  const config = await readJson(inside(root, 'targets.json')), template = await readJson(inside(root, 'pxt-template.json'));
  const plans = createPlans(config, template, repository);
  const selection = parseArgs(input.filter(arg => arg !== '--fetch-runtime'), [...plans.keys()], config.releases);
  if (selection.list) {
    for (const plan of plans.values()) console.log(plan.key + (config.releases.includes(plan.key) ? ' [release]' : ' [example]') + ': ' + plan.artifact + '.hex');
    return;
  }
  const pinned = selection.check ? getFirmwareArtifact(plans.get(selection.targets[0]).id, plans.get(selection.targets[0]).version) : null;
  const runtime = await prepareToolchain(root, config.toolchain);
  createRequire(import.meta.url)('pxt-core');
  const compile = (project, fetch) => {
    const child = spawnSync(process.execPath, ['--require', inside(root, 'runtime-provider.cjs'), inside(root, 'node_modules/pxt/pxt'), 'build', '--install', '--force'],
      { cwd: project, stdio: 'inherit', timeout: 660000,
        env: { ...process.env, SENSOR_LAB_FETCH_RUNTIME: fetch ? '1' : '0',
          KS_FORCE_CLOUD: 'yes', PXT_COMPILE_SWITCHES: '', PXT_FORCE_GITHUB_PROXY: '' } });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error('Firmware build failed (' + (child.status ?? child.signal) + '); published files were not changed.');
  };
  for (const target of selection.targets) {
    const plan = plans.get(target);
    const { output, record } = await buildCandidate(plan, { root, toolchain: config.toolchain, runtime,
      async compile(project) {
        if (fetchRuntime) {
          compile(project, true);
          Object.assign(runtime, await prepareToolchain(root, config.toolchain));
        }
        compile(project, false);
      },
      readV2: hex => createUniversalHexFlashDataSource(hex)('V2'),
      unpack: hex => globalThis.pxt.cpp.unpackSourceFromHexAsync(Buffer.from(hex)),
      pinned: pinned ? { artifact: pinned, hex: normalizeText(await readFile(new URL(pinned.url))),
        source: normalizeText(await readFile(new URL(pinned.url.replace(/\.hex$/, '.ts')))) } : null,
    });
    console.log((pinned ? 'Pinned artifact matches: ' : 'Firmware candidate ready: ') + output + '\nSHA-256 ' + record.hexSha256);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
