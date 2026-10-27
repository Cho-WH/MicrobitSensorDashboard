// Read only native images whose compile keys, lengths and hashes are pinned.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
function readRuntime(root, sha) {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const file = manifest.files.find(item => item.compileSha === sha);
  if (!/^[a-f0-9]{64}$/.test(sha) || !file || file.file !== `${sha}.hex`) {
    throw new Error(`No verified native runtime for ${sha}. Review the common PXT configuration and runtime-cache before building.`);
  }
  const bytes = readFileSync(join(root, file.file));
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Runtime cache changed: ${file.file}`);
  return { hex: bytes.toString('utf8').split(/\r?\n/) };
}
module.exports = { readRuntime };
