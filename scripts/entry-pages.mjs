// Real directory entry pages also work on static hosts and project subpaths.
export function renderEntry(source, entry) {
  const depth = entry.path.split('/').filter(Boolean).length;
  return source.replace('<head>', `<head><base href="${'../'.repeat(depth)}">`)
    .replace(/(<meta property="og:url" content=")([^"]+)(">)/,
      (_, open, base, close) => `${open}${new URL(entry.path,base).href}${close}`)
    .replace(/(<link rel="canonical" href=")([^"]+)(">)/,
      (_, open, base, close) => `${open}${new URL(entry.path,base).href}${close}`);
}

// The generated app config and social metadata share one deployment destination.
export function renderPublicMetadata(source, base) {
  const image = new URL('public/assets/branding/sensor-lab-social.png', base).href;
  return source.replace(/(<meta property="og:url" content=")[^"]+(">)/, (_, open, close) => open + base + close)
    .replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]+(">)/g, (_, open, close) => open + image + close)
    .replace(/<link rel="canonical" href="[^"]+">/, '')
    .replace('</head>', `<link rel="canonical" href="${base}"></head>`);
}
