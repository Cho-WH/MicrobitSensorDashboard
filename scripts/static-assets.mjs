import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';

// Non-bundled resources use the same /assets/ cache contract as JS and CSS.
export async function buildStaticAssets(root, output) {
  const urls = {};
  async function files(directory) {
    const result = [];
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) result.push(...await files(path));
      else result.push(path);
    }
    return result.sort();
  }
  async function emit(path, bytes) {
    await mkdir(dirname(resolve(output, path)), { recursive: true });
    await writeFile(resolve(output, path), bytes);
  }
  const independent = [
    ...(await files('public/activities')).filter(path => /\.(png|svg|jpe?g|webp)$/.test(path)),
    ...(await files('public/assets')).filter(path => /\.(png|svg|jpe?g|webp)$/.test(path)),
    ...(await files('public/firmware')).filter(path => /\.(hex|bin)$/.test(path)),
    ...(await files('public/vendor')).filter(path => path.endsWith('.svg')),
    'vendor/qrcodegen.js', 'vendor/simple-qrcode.js',
    'src/catalog/sensors/magnetometer/calibration.png',
    'src/catalog/sensors/magnetometer/preparation.css',
  ];
  for (const path of independent) {
    const bytes = await readFile(resolve(root, path));
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const extension = extname(path);
    const target = `assets/static/${basename(path, extension)}-${hash}${extension}`;
    await emit(target, bytes);
    urls[path] = target;
  }
  // The two 3D entry points share native modules with relative imports. Version
  // this small dependency tree together, preserving those URLs and one Three.js
  // module identity. Image/firmware changes do not invalidate the 3D tree.
  const sceneFiles = [
    ...(await files('public/assets/devices')).filter(path => path.endsWith('.js')),
    ...(await files('public/viewers/wiring')).filter(path => /\.(html|css|js)$/.test(path)),
    'public/viewers/devices/viewer.css',
    'public/vendor/three-r180.js',
    'src/catalog/sensors/bmp280/wiring.js', 'src/catalog/sensors/ds18b20/wiring.js',
    'src/catalog/sensors/magnetometer/calibration-scene.js',
  ].sort();
  const scene = await Promise.all(sceneFiles.map(async path => [path, await readFile(resolve(root, path))]));
  const digest = createHash('sha256');
  for (const [path, bytes] of scene) digest.update(path).update('\0').update(bytes).update('\0');
  const directory = `assets/scene-${digest.digest('hex').slice(0, 16)}`;
  for (const [path, bytes] of scene) await emit(`${directory}/${path}`, bytes);
  for (const path of ['public/viewers/wiring/index.html', 'src/catalog/sensors/magnetometer/calibration-scene.js'])
    urls[path] = `${directory}/${path}`;
  return urls;
}

export function rewriteHtmlAssets(html, assets) {
  return html.replace(/\b(src|href)="([^"?#]+)([?#][^"]*)?"/g, (match, attribute, path, suffix = '') =>
    assets[path] ? `${attribute}="${assets[path]}${suffix}"` : match);
}

// bundleStyles rebases all relative URLs to assets/style.css before this step.
export function rewriteStyleAssets(css, assets) {
  return css.replace(/url\(\s*(['"]?)(\.\.\/[^\s'"()?#]+)([?#][^\s'"()]*)?\1\s*\)/g,
    (match, quote, path, suffix = '') => assets[path.slice(3)]
      ? `url(${quote}../${assets[path.slice(3)]}${suffix}${quote})` : match);
}
