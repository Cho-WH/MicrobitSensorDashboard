// Pinned PXT 13.0.1 provider for the current open-link firmware profile.
// Network fetching is an explicit, separate step. Ordinary firmware builds are offline.
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { readRuntime } = require('./runtime-cache.cjs');
require('pxt-core');
const cache = join(__dirname, 'runtime-cache-pairing');
const official = globalThis.pxt.hexloader.getHexInfoAsync;
globalThis.pxt.hexloader.getHexInfoAsync = async (host, extension) => {
  if (process.env.SENSOR_LAB_FETCH_RUNTIME !== '1') return readRuntime(cache, extension.sha);
  if (!/^[a-f0-9]{64}$/.test(extension.sha)) throw new Error('Invalid native compile key');
  // Bypass mutable host caches while retaining the official cloud compiler path.
  const cleanHost = { cacheGetAsync: async () => null, cacheStoreAsync: async () => {} };
  const result = await official(cleanHost, extension);
  if (!result?.hex?.length || !result.hex[0].startsWith(':')) throw new Error('Official cloud compiler returned no HEX');
  const bytes = Buffer.from(result.hex.join('\n'));
  const file = { compileSha: extension.sha, file: `${extension.sha}.hex`,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    retrievedAt: new Date().toISOString(), variant: extension.appVariant ?? 'default' };
  mkdirSync(cache, { recursive: true });
  let manifest = { target: 'pxt-microbit@9.1.1', pxt: 'pxt-core@13.0.1',
    source: 'Microsoft MakeCode official cloud compilation; pairing_mode=1 only', files: [] };
  try { manifest = JSON.parse(readFileSync(join(cache, 'manifest.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const previous = manifest.files.find(item => item.compileSha === file.compileSha);
  if (previous && previous.sha256 !== file.sha256) throw new Error('Official runtime changed for a frozen key; review before replacing');
  writeFileSync(join(cache, file.file), bytes);
  if (!previous) manifest.files.push(file);
  writeFileSync(join(cache, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Captured official runtime ${file.variant}: ${file.compileSha}`);
  return readRuntime(cache, extension.sha);
};
