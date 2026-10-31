import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { buildScenes } from './scenes.mjs';

// Non-bundled resources use the same /assets/ cache contract as JS and CSS.
export async function buildStaticAssets(root, output, modulePreloads = {}) {
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
    'src/catalog/sensors/magnetometer/calibration.webp',
    'src/catalog/sensors/magnetometer/calibration-640.webp',
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
  const scene = await buildScenes(root, output);
  Object.assign(urls, scene.urls);
  Object.assign(modulePreloads, scene.preloads);
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
