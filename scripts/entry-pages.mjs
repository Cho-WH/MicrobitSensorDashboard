// Real directory entry pages also work on static hosts and project subpaths.
export function renderEntry(source, entry) {
  const depth = entry.path.split('/').filter(Boolean).length;
  return source.replace('<head>', `<head><base href="${'../'.repeat(depth)}">`);
}
