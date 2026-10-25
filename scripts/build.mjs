import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, getExperiment } from '../src/catalog/index.js';
import { validateChannels } from '../src/domain/contracts.js';
import { entryRoutes } from '../src/app/routes.js';
import { renderEntry } from './entry-pages.mjs';
import { bundleStyles, styleEntry } from './styles.mjs';
const ids = new Set();
for (const sensor of catalog.sensors) {
  const key = `${sensor.id}@${sensor.version}`;
  if (ids.has(key)) throw new Error('Duplicate definition: ' + key);
  ids.add(key); validateChannels(sensor.channels); getExperiment(sensor.id);
}
for (const activity of catalog.activities) for (const sensorId of activity.sensorIds) getExperiment(sensorId, activity.id);
const root = fileURLToPath(new URL('..', import.meta.url)), output = resolve(root, 'dist');
// Only the fixed, generated output directory may be cleared, never the checkout.
if (dirname(output) !== resolve(root) || basename(output) !== 'dist') throw new Error('Unsafe build output path');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['lab.html','LICENSE','README.md','THIRD_PARTY_NOTICES.md','src','public','vendor','firmware','docs']) await cp(resolve(root,file), resolve(output,file), { recursive: true });
await writeFile(resolve(output, styleEntry), await bundleStyles(root));
const source = await readFile(resolve(root,'lab.html'), 'utf8');
await writeFile(resolve(output,'index.html'), source);
for (const entry of entryRoutes) {
  await mkdir(resolve(output,entry.path), { recursive:true });
  await writeFile(resolve(output,entry.path,'index.html'), renderEntry(source, entry));
}
await writeFile(resolve(output,'catalog.json'), JSON.stringify({ sensors:catalog.sensors.map(({id,version})=>({id,version})),activities:catalog.activities.map(({id,version})=>({id,version})) }, null, 2));
if (!source.includes('src/app/bootstrap.js')) throw new Error('Missing lab entry point');
console.log('Sensor Lab built in dist/ (home + sensor/activity entries).');
