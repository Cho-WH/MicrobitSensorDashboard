import { guideImages } from './guide-image-assets.js';
// Development uses checked-in derivatives. The static build supplies hashed paths.
const assets = {};
const modulePreloads = {};
const root = new URL('../../', import.meta.url);

/** Resolve trusted application assets, preserving subdirectory hosting and queries. */
export function assetUrl(path, base) {
  const url = new URL(path, base);
  if (!url.href.startsWith(root.href)) return url;
  const source = url.pathname.slice(root.pathname.length);
  const key = guideImages[source]?.file ?? source;
  if (!Object.hasOwn(assets, key) && key === source) return url;
  const mapped = new URL(assets[key] ?? key, root);
  mapped.search = url.search;
  mapped.hash = url.hash;
  return mapped;
}

const preparedModules = new Set();
/** Fetch/compile without evaluating a scene or allocating a WebGL context. */
export function preloadAssetModules(path, base) {
  const url = new URL(path, base);
  if (!url.href.startsWith(root.href)) return;
  const key = url.pathname.slice(root.pathname.length);
  for (const path of modulePreloads[key] ?? [key]) {
    const href = new URL(path, root).href;
    if (preparedModules.has(href)) continue;
    const link = document.createElement('link');
    if (!link.relList.supports('modulepreload')) return;
    preparedModules.add(href);
    link.rel = 'modulepreload'; link.href = href; link.fetchPriority = 'low';
    link.addEventListener('error', () => { preparedModules.delete(href); link.remove(); }, { once: true });
    document.head.append(link);
  }
}

let imageByUrl;
/** Responsive versions of registered guide artwork, including built asset URLs. */
export function guideImageSources(src) {
  imageByUrl ??= new Map(Object.entries(guideImages).map(([path, image]) => [assetUrl(path, root).href, image]));
  const image = imageByUrl.get(new URL(src, root).href);
  if (!image) return { src, width: undefined, height: undefined, srcset: '' };
  const full = assetUrl(image.file, root).href;
  return { src: full, width: image.width, height: image.height,
    srcset: image.smallWidth < image.width ? `${assetUrl(image.small, root).href} ${image.smallWidth}w, ${full} ${image.width}w` : '' };
}
