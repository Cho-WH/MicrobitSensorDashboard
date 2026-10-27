import { readFile, cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pinned upstream subsets cover all supported characters, including student input.
// Never derive this list from today's UI copy or fetch a CDN during a build.
const source = fileURLToPath(new URL('../node_modules/pretendard/dist/web/variable/', import.meta.url));
export const fontDirectory = 'public/vendor/pretendard';
export const fontStylesheet = `${fontDirectory}/pretendardvariable-dynamic-subset.css`;
export const readFontStyles = () => readFile(resolve(source, 'pretendardvariable-dynamic-subset.css'), 'utf8');
export function readFontAsset(path) {
  if (path === '/' + fontStylesheet) return readFontStyles();
  const match = /^\/public\/vendor\/pretendard\/woff2-dynamic-subset\/([\w.-]+\.woff2)$/.exec(path);
  return match ? readFile(resolve(source, 'woff2-dynamic-subset', match[1])) : null;
}
export async function copyFontAssets(output) {
  const target = resolve(output, fontDirectory);
  await mkdir(target, { recursive: true });
  await cp(resolve(source, 'pretendardvariable-dynamic-subset.css'), resolve(target, 'pretendardvariable-dynamic-subset.css'));
  await cp(resolve(source, 'woff2-dynamic-subset'), resolve(target, 'woff2-dynamic-subset'), { recursive: true });
}
