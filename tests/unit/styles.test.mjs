import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleStyles } from '../../scripts/styles.mjs';

test('CSS bundle keeps cascade, conditions and asset paths under a project subpath', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sensor-styles-'));
  try {
    await mkdir(join(root,'ui')); await mkdir(join(root,'parts'));
    await writeFile(join(root,'ui/app.css'), '@import url("../parts/first.css");\n@import url("../parts/last.css");');
    await writeFile(join(root,'parts/first.css'), '.item{color:red;background:url(../assets/picture.svg?version=1#part)}\n@media print{.item{color:black}}');
    await writeFile(join(root,'parts/last.css'), '.item{color:blue;mask:url(#local)}');
    const css = await bundleStyles(root,'ui/app.css');
    assert.ok(css.indexOf('color:red') < css.indexOf('color:blue'));
    assert.match(css, /@media print\{.item\{color:black}}/);
    const asset = css.match(/background:url\(([^)]+)\)/)[1];
    assert.equal(new URL(asset,'https://example.test/lab/ui/app.css').href,'https://example.test/lab/assets/picture.svg?version=1#part');
    assert.match(css,/mask:url\(#local\)/);
    const relocated = await bundleStyles(root,'ui/app.css','assets/app-hash.css');
    const relocatedAsset = relocated.match(/background:url\(([^)]+)\)/)[1];
    assert.equal(new URL(relocatedAsset,'https://example.test/lab/assets/app-hash.css').href,'https://example.test/lab/assets/picture.svg?version=1#part');
    await writeFile(join(root,'parts/last.css'), '@import url("../ui/app.css");');
    await assert.rejects(bundleStyles(root,'ui/app.css'), /cycle/);
    await writeFile(join(root,'parts/last.css'), '@import url("./missing.css") print;');
    await assert.rejects(bundleStyles(root,'ui/app.css'), /Unsupported/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
