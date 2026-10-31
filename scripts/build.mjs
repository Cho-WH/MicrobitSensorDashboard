import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { transform } from 'esbuild';
import { catalog, getExperiment } from '../src/catalog/index.js';
import { validateChannels } from '../src/domain/contracts.js';
import { entryRoutes } from '../src/app/routes.js';
import { renderEntry, renderPublicMetadata } from './entry-pages.mjs';
import { bundleStyles, styleEntry } from './styles.mjs';
import { renderFontPreload } from './fonts.mjs';
import { bundleJavaScript } from './javascript.mjs';
import { buildStaticAssets, rewriteHtmlAssets, rewriteStyleAssets } from './static-assets.mjs';
import { publicBaseUrl } from '../src/app/deployment.js';
import { normalizePublicBase } from '../src/sharing/tool-link.js';
const publicBase = normalizePublicBase(process.env.PUBLIC_BASE_URL ?? publicBaseUrl);
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
const modulePreloads = {};
const assets = await buildStaticAssets(root, output, modulePreloads);
const scripts = await bundleJavaScript(root, output, publicBase, assets, modulePreloads);
let template = rewriteHtmlAssets(renderFontPreload(await readFile(resolve(root,'lab.html'), 'utf8')), assets);
// Classic global dependencies follow the same immutable-address contract as ESM.
for (const [, entry] of template.matchAll(/<script defer src="([^"]+)"><\/script>/g)) {
  if (entry === 'src/app/bootstrap.js') continue;
  const bytes = await readFile(resolve(root,entry));
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0,12);
  const asset = `assets/${basename(entry,'.js')}-${hash}.js`;
  await writeFile(resolve(output,asset), bytes);
  template = template.replace(`src="${entry}"`, `src="${asset}"`);
}
for (const entry of [styleEntry, 'src/ui/guide.css']) {
  const css = await bundleStyles(root, entry, 'assets/style.css');
  const { code } = await transform(rewriteStyleAssets(css, assets), { loader:'css', minify:true });
  const hash = createHash('sha256').update(code).digest('hex').slice(0,12);
  const asset = `assets/${basename(entry,'.css')}-${hash}.css`;
  await writeFile(resolve(output,asset), code);
  template = template.replace(`href="${entry}"`, `href="${asset}"`);
}
// Only content-addressed resources are immutable. HTML/unversioned files revalidate.
// Intel HEX is ASCII text. Declaring its real MIME type enables Cloudflare's
// negotiated text compression; firmware bytes and SHA-256 checks stay unchanged.
await writeFile(resolve(output,'_headers'), '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/public/vendor/lab-fonts/*.woff2\n  Cache-Control: public, max-age=31536000, immutable\n/assets/static/*.hex\n  Content-Type: text/plain; charset=utf-8\n/public/firmware/*.hex\n  Content-Type: text/plain; charset=utf-8\n');
if (!template.includes('<script defer src="src/app/bootstrap.js"></script>')) throw new Error('Missing lab entry point');
const source = renderPublicMetadata(template.replace('<script defer src="src/app/bootstrap.js"></script>',
  scripts.preloads.map(href => `<link rel="modulepreload" href="${href}">`).join('') + `<script type="module" src="${scripts.entry}"></script>`), publicBase);
await writeFile(resolve(output,'src/app/deployment.js'), `export const publicBaseUrl = ${JSON.stringify(publicBase)};\n`);
await writeFile(resolve(output,'lab.html'), source);
await writeFile(resolve(output,'index.html'), source);
for (const entry of entryRoutes) {
  await mkdir(resolve(output,entry.path), { recursive:true });
  await writeFile(resolve(output,entry.path,'index.html'), renderEntry(source, entry));
}
await writeFile(resolve(output,'catalog.json'), JSON.stringify({ sensors:catalog.sensors.map(({id,version})=>({id,version})),activities:catalog.activities.map(({id,version})=>({id,version})) }, null, 2));
console.log('Sensor Lab built in dist/ (home + sensor/activity entries).');
