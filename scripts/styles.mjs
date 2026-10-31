import { readFile } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';

export const styleEntry = 'src/ui/luminous.css';

// The app entry is an ordered list of local, unconditional imports. Expand that
// small contract identically in development and static builds; do not minify or
// reorder rules. Unsupported imports fail instead of silently changing cascade.
export async function bundleStyles(root, entry = styleEntry, target = entry) {
  const workspace = resolve(root), output = resolve(workspace, target);
  function local(path) {
    if (!path.startsWith(workspace + sep)) throw new Error('Stylesheet outside app: ' + path);
    return path;
  }
  async function expand(path, parents = []) {
    local(path);
    if (parents.includes(path)) throw new Error('CSS import cycle: ' + path);
    let css = await readFile(path, 'utf8');
    // Only the leading import list is expanded. Component CSS remains authored
    // CSS, including media/container queries, variables and print rules.
    let prefix = '', rest = css;
    const head = /^(?:\s+|\/\*[\s\S]*?\*\/)*@import\s+url\(\s*(['"])([^'"]+)\1\s*\)\s*;/;
    while (head.test(rest)) {
      const match = head.exec(rest), target = match[2];
      if (/^(?:[a-z]+:|\/|#)/i.test(target) || /[?#]/.test(target)) throw new Error('Unsupported CSS import: ' + target);
      prefix += await expand(resolve(dirname(path), target), [...parents, path]);
      rest = rest.slice(match[0].length);
    }
    if (/@import\b/.test(rest.replace(/\/\*[\s\S]*?\*\//g, ''))) throw new Error('Unsupported CSS import in ' + path);
    rest = rest.replace(/url\(\s*(['"]?)([^\s'"()]+)\1\s*\)/g, (match, quote, url) => {
      if (/^(?:[a-z]+:|\/|#)/i.test(url)) return match;
      const split = url.search(/[?#]/), asset = split < 0 ? url : url.slice(0, split), suffix = split < 0 ? '' : url.slice(split);
      const rebased = relative(dirname(output), local(resolve(dirname(path), asset))).split(sep).join('/');
      return `url(${quote}${rebased}${suffix}${quote})`;
    });
    return prefix + `\n/* ${relative(workspace, path).split(sep).join('/')} */\n` + rest + '\n';
  }
  return expand(resolve(workspace, entry));
}
