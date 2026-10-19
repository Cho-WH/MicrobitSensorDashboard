import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { catalog, getExperiment } from '../src/catalog/index.js';
import { validateChannels } from '../src/domain/contracts.js';
import { entryRoutes } from '../src/app/routes.js';
import { renderEntry } from './entry-pages.mjs';
const ids = new Set();
for (const sensor of catalog.sensors) {
  const key = `${sensor.id}@${sensor.version}`;
  if (ids.has(key)) throw new Error('Duplicate definition: ' + key);
  ids.add(key); validateChannels(sensor.channels); getExperiment(sensor.id);
}
for (const activity of catalog.activities) for (const sensorId of activity.sensorIds) getExperiment(sensorId, activity.id);
await mkdir('dist', { recursive: true });
for (const file of ['index.html','lab.html','styles.css','LICENSE','README.md','THIRD_PARTY_NOTICES.md','js','src','public','vendor','firmware','docs']) await cp(file, 'dist/' + file, { recursive: true });
const source = await readFile('lab.html', 'utf8');
for (const entry of entryRoutes) {
  await mkdir('dist/' + entry.path, { recursive:true });
  await writeFile('dist/' + entry.path + 'index.html', renderEntry(source, entry));
}
await writeFile('dist/catalog.json', JSON.stringify({ sensors:catalog.sensors.map(({id,version})=>({id,version})),activities:catalog.activities.map(({id,version})=>({id,version})) }, null, 2));
if (!source.includes('src/app/bootstrap.js')) throw new Error('Missing lab entry point');
console.log('M2 static app built in dist/ (legacy dashboard + sensor/activity entries).');
