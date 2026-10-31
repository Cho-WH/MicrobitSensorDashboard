import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export async function bundleJavaScript(root, output, publicBase, assets = {}, modulePreloads = {}) {
  const result = await build({
    absWorkingDir: root, entryPoints: ['src/app/bootstrap.js'], outdir: resolve(output, 'assets'),
    bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022',
    minify: true, metafile: true, entryNames: '[name]-[hash]', chunkNames: '[name]-[hash]',
    legalComments: 'linked',
    plugins: [{ name: 'source-relative-urls', setup(builder) {
      builder.onLoad({ filter: /\.js$/ }, async ({ path }) => {
        const sourcePath = relative(root, path).split(sep).join('/');
        let contents = sourcePath === 'src/app/deployment.js'
          ? `export const publicBaseUrl = ${JSON.stringify(publicBase)};`
          : await readFile(path, 'utf8');
        if (sourcePath === 'src/app/asset-url.js')
          contents = contents.replace('const assets = {};', `const assets = ${JSON.stringify(assets)};`)
            .replace('const modulePreloads = {};', `const modulePreloads = ${JSON.stringify(modulePreloads)};`);
        // All emitted chunks live in assets/. Preserve each source module's URL
        // so firmware, viewers, QR helpers and illustrations work under any base path.
        contents = contents.replaceAll('import.meta.url',
          `new URL(${JSON.stringify('../' + sourcePath)}, import.meta.url).href`);
        return { contents, loader: 'js' };
      });
    } }],
  });
  const entries = Object.entries(result.metafile.outputs);
  const resource = path => relative(output, resolve(root, path)).split(sep).join('/');
  const entry = entries.find(([, info]) => info.entryPoint === 'src/app/bootstrap.js');
  const startup = entries.find(([, info]) => info.entryPoint === 'src/app/startup.js');
  if (!entry || !startup) throw new Error('Missing bundled app entry');
  // Discover static dependencies together; keep USB, MathJax and other dynamic imports lazy.
  const preloads = new Set();
  function visit(path) {
    if (preloads.has(path)) return;
    preloads.add(path);
    for (const dependency of result.metafile.outputs[path]?.imports ?? [])
      if (!dependency.external && dependency.kind === 'import-statement') visit(dependency.path);
  }
  visit(startup[0]);
  return { entry: resource(entry[0]), preloads: [...preloads].map(resource) };
}
