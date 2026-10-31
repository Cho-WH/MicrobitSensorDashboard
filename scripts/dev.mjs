import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryRoutes } from '../src/app/routes.js';
import { renderEntry } from './entry-pages.mjs';
import { bundleStyles, styleEntry } from './styles.mjs';
import { renderFontPreload } from './fonts.mjs';
export function serve({ root = resolve(fileURLToPath(new URL('..', import.meta.url))), port = 8080, host = '127.0.0.1' } = {}) {
  const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.csv':'text/csv','.woff2':'font/woff2' };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'), path = decodeURIComponent(url.pathname);
      if (path === '/' + styleEntry) {
        const content = await bundleStyles(root);
        res.writeHead(200, { 'Content-Type':types['.css'], 'Cache-Control':'no-store' });
        res.end(content); return;
      }
      const entry = entryRoutes.find(route => path === '/' + route.path || path === '/' + route.path + 'index.html' || path === '/' + route.path.slice(0, -1));
      if (entry) {
        if (path === '/' + entry.path.slice(0, -1)) { res.writeHead(308, { Location: '/' + entry.path + url.search }); res.end(); return; }
        const source = await readFile(resolve(root, 'lab.html'), 'utf8');
        res.writeHead(200, { 'Content-Type':types['.html'], 'Cache-Control':'no-store' });
        res.end(renderEntry(renderFontPreload(source), entry)); return;
      }
      const filename = resolve(root, '.' + path);
      if (filename !== root && !filename.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      if (path.split('/').some(p => p.startsWith('.'))) { res.writeHead(403); res.end(); return; }
      const target = (await stat(filename)).isDirectory() ? resolve(filename, 'index.html') : filename;
      const content = target === resolve(root,'lab.html') ? renderFontPreload(await readFile(target,'utf8')) : await readFile(target);
      res.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream', 'Cache-Control':'no-store' }); res.end(content);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  return new Promise(resolve => server.listen(port, host, () => {
    console.log(`http://localhost:${server.address().port}/${process.argv.includes('--browser-tests') ? 'tests/browser/' : 'lab.html'}`); resolve(server);
  }));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await serve({ port: Number(process.env.PORT ?? 8080), host: process.env.LAB_HOST ?? '127.0.0.1' });
