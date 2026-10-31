// Development keeps source URLs. The static build supplies content-addressed paths.
const assets = {};
const root = new URL('../../', import.meta.url);

/** Resolve trusted application assets, preserving subdirectory hosting and queries. */
export function assetUrl(path, base) {
  const url = new URL(path, base);
  if (!url.href.startsWith(root.href)) return url;
  const key = url.pathname.slice(root.pathname.length);
  if (!Object.hasOwn(assets, key)) return url;
  const mapped = new URL(assets[key], root);
  mapped.search = url.search;
  mapped.hash = url.hash;
  return mapped;
}
