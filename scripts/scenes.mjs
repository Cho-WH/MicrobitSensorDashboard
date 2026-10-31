import { build, transform } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { bundleStyles } from './styles.mjs';

// Separate lazy entries, with one shared Three.js module and no native-module waterfall.
export async function buildScenes(root, output) {
  const wiring = 'public/viewers/wiring/bootstrap.js';
  const calibration = 'src/catalog/sensors/magnetometer/calibration-scene.js';
  const result = await build({
    absWorkingDir: root, entryPoints: { wiring, calibration }, outdir: resolve(output, 'assets/scenes'),
    bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022',
    minify: true, metafile: true, write: false, entryNames: '[name]-[hash]', chunkNames: '[name]-[hash]',
    legalComments: 'linked',
    plugins: [{ name: 'calibration-vendor-boundary', setup(builder) {
      builder.onLoad({ filter: /calibration-scene\.js$/ }, async ({ path }) => {
        const source = await readFile(path, 'utf8');
        const contents = source.replace(/const\s+(\{[\s\S]*?\})\s*=\s*await import\(new URL\(('[^']+'),import\.meta\.url\)\.href\);/g, 'import $1 from $2;');
        if (contents.includes('import(new URL(')) throw new Error('Unresolved calibration dependency');
        return { contents, loader: 'js' };
      });
    } }],
  });
  const resource = path => relative(output, resolve(root, path)).split(sep).join('/');
  async function emit(path, bytes) {
    await mkdir(dirname(resolve(output, path)), { recursive: true });
    await writeFile(resolve(output, path), bytes);
  }
  for (const file of result.outputFiles) await emit(resource(file.path), file.contents);
  const urls = {}, preloads = {};
  for (const source of [wiring, calibration]) {
    const entry = Object.entries(result.metafile.outputs).find(([, info]) => info.entryPoint === source);
    if (!entry) throw new Error('Missing 3D entry: ' + source);
    urls[source] = resource(entry[0]);
    const dependencies = new Set();
    function visit(path) {
      if (dependencies.has(path)) return;
      dependencies.add(path);
      for (const dependency of result.metafile.outputs[path]?.imports ?? [])
        if (!dependency.external) visit(dependency.path);
    }
    // Includes the wiring bootstrap's lazy scene, but never the other demo entry.
    visit(entry[0]);
    preloads[source] = [...dependencies].map(resource);
  }
  const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 16);
  const css = (await transform(await bundleStyles(root, 'public/viewers/wiring/viewer.css'), { loader: 'css', minify: true })).code;
  const cssPath = `assets/scenes/viewer-${hash(css)}.css`;
  await emit(cssPath, css);
  const html = (await readFile(resolve(root, 'public/viewers/wiring/index.html'), 'utf8'))
    .replace('./viewer.css', './' + cssPath.split('/').at(-1))
    .replace('./bootstrap.js', './' + urls[wiring].split('/').at(-1))
    .replace('</head>', preloads[wiring].map(path => `<link rel="modulepreload" href="./${path.split('/').at(-1)}">`).join('') + '</head>');
  const htmlPath = `assets/scenes/wiring-${hash(html)}.html`;
  await emit(htmlPath, html);
  urls['public/viewers/wiring/index.html'] = htmlPath;
  return { urls, preloads };
}
