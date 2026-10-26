// Small experiment: two programs, one explicit open SDK profile, separate outputs.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { inside, readJson, prepareToolchain, buildCandidate, hash, createPlans } from './build-support.mjs';
import { createUniversalHexFlashDataSource } from '../../public/vendor/microbit-usb-1.0.0.js';
import { createInitPacket, verifyFullImage, appStart, appLimit } from '../bluetooth-install/full-image.js';

const root = fileURLToPath(new URL('./', import.meta.url));
const repository = fileURLToPath(new URL('../../', import.meta.url));
const output = new URL('../bluetooth-install/firmware/unbonded/', import.meta.url);
const MemoryMap = createRequire(new URL('../usb-library/package.json', import.meta.url))('nrf-intel-hex');

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--fetch-runtime')) throw new Error('Usage: node dev/firmware/build-unbonded-trial.mjs [--fetch-runtime]');
  const config = await readJson(inside(root, 'targets.json'));
  const template = await readJson(inside(root, 'pxt-template.json'));
  Object.assign(template.yotta.config['microbit-dal'].bluetooth, { pairing_mode: 1, security_mode: 1 });
  await prepareToolchain(root, config.toolchain);
  createRequire(import.meta.url)('pxt-core');
  const plans = createPlans(config, template, repository), runtime = { files: [] }, programs = [];
  let commonRuntime;
  const compile = (project, fetchRuntime) => {
    const child = spawnSync(process.execPath, ['--require', inside(root, 'trial-runtime.cjs'), inside(root, 'node_modules/pxt/pxt'), 'build', '--install', '--force'], {
      cwd: project, stdio: 'inherit', timeout: 660000,
      env: { ...process.env, SENSOR_LAB_OFFLINE_BUILD: '0', SENSOR_LAB_UNBONDED_TRIAL: '1',
        SENSOR_LAB_FETCH_TRIAL_RUNTIME: fetchRuntime ? '1' : '0', KS_FORCE_CLOUD: 'yes', PXT_COMPILE_SWITCHES: '', PXT_FORCE_GITHUB_PROXY: '' },
    });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`Unbonded trial compilation failed (${child.status ?? child.signal})`);
  };
  for (const [id, name] of [['temperature', '온도 비본딩 시험본 C'], ['light-level', '밝기 비본딩 시험본 C']]) {
    const plan = { ...plans.get(id), key: `${id}-unbonded-trial`, artifact: `${id}-unbonded-trial-v1` };
    const result = await buildCandidate(plan, { root, toolchain: config.toolchain, runtime,
      async compile(project) {
        if (args.includes('--fetch-runtime') && !programs.length) compile(project, true);
        Object.assign(runtime, await prepareToolchain(root, config.toolchain, 'runtime-cache-unbonded'));
        compile(project, false);
      },
      readV2: hex => createUniversalHexFlashDataSource(hex)('V2'),
      unpack: hex => globalThis.pxt.cpp.unpackSourceFromHexAsync(Buffer.from(hex)),
    });
    const generated = await readJson(inside(root, `built/projects/${plan.key}/built/codal.json`));
    if (generated.definitions.YOTTA_CFG_MICROBIT_DAL_BLUETOOTH_SECURITY_MODE !== 1)
      throw new Error('Generated SDK security mode is not 1');
    result.record.trial = { profile: 'unbonded-c', bluetooth: template.yotta.config['microbit-dal'].bluetooth,
      firstInstall: 'USB', supportedBoard: 'V2', expectedDfuEntry: '8ec90003-f315-4f60-9fb8-838830daea50' };
    await writeFile(inside(result.output, `${plan.artifact}.build.json`), JSON.stringify(result.record, null, 2) + '\n');
    const hex = await readFile(inside(result.output, `${plan.artifact}.hex`), 'utf8');
    const map = MemoryMap.fromHex(await createUniversalHexFlashDataSource(hex)('V2'));
    const magic = Buffer.from('708e3b92c615a841c49866c975ee5197', 'hex');
    let programStart;
    for (let address = appStart; address < 0x73000; address += 0x400) {
      if (Buffer.from(map.slicePad(address, 16)).equals(magic)) { programStart = address; break; }
    }
    if (!programStart) throw new Error('PXT program header not found');
    const header = map.slicePad(programStart, 32), native = Buffer.from(map.slicePad(appStart, programStart - appStart));
    if (commonRuntime && !commonRuntime.equals(native)) throw new Error('The two candidate runtimes differ');
    commonRuntime = native;
    let end = appStart;
    for (const [address, block] of map) if (address < appLimit && address + block.length > appStart)
      end = Math.max(end, Math.min(address + block.length, appLimit));
    end = Math.ceil(end / 4) * 4;
    const data = map.slicePad(appStart, end - appStart), init = await createInitPacket(data);
    const target = { id, name, file: `${id}.bin`, initFile: `${id}.dat`, start: appStart, end, bytes: data.length,
      sha256: hash(data), initSha256: hash(init), hexSha256: result.record.hexSha256,
      programStart, runtimeHash: Buffer.from(header.slice(16, 24)).toString('hex'),
      programHash: Buffer.from(header.slice(24, 32)).toString('hex'), runtimeSha256: hash(native),
      usbHex: `/dev/firmware/built/artifacts/${plan.key}/${plan.artifact}.hex` };
    await verifyFullImage(target, data, init);
    await mkdir(output, { recursive: true });
    await writeFile(new URL(target.file, output), data);
    await writeFile(new URL(target.initFile, output), init);
    programs.push(target);
    console.log(`READY ${id}: runtime=${target.runtimeHash}, program=${target.programHash}, bytes=${data.length}\nUSB ${target.usbHex}`);
  }
  await writeFile(new URL('programs.js', output), '// Generated by build-unbonded-trial.mjs; experiment C only.\nexport const unbondedPrograms = ' + JSON.stringify(programs, null, 2) + ';\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
