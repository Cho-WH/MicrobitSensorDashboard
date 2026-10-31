import { build } from 'esbuild';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const output='public/vendor/mathjax-svg.js';
await build({entryPoints:['dev/math/entry.js'],outfile:output,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'linked',
  banner:{js:'/*! MathJax 4.1.3 and MathJax TeX font 4.1.3. MathJax source copyright (c) 2017-2026 The MathJax Consortium. Apache-2.0; see mathjax-LICENSE and THIRD_PARTY_NOTICES.md. Local SVG build: dev/math/README.md. */'},
  plugins:[{name:'local-tex-font',setup(b){b.onResolve({filter:/^#default-font\/svg\/default.js$/},()=>({path:resolve('dev/math/font.js')}));}}]});
await copyFile('node_modules/@mathjax/src/LICENSE','public/vendor/mathjax-LICENSE');
const manifest=JSON.parse(await readFile('vendor/manifest.json','utf8'));
manifest.files=manifest.files.filter(item=>item.file!==output);
manifest.files.push({file:output,version:'4.1.3',source:'https://github.com/mathjax/MathJax-src/tree/4.1.3',sha256:createHash('sha256').update(await readFile(output)).digest('hex'),modified:true,license:'public/vendor/mathjax-LICENSE',rebuild:'dev/math/README.md',components:[{package:'@mathjax/mathjax-tex-font',version:'4.1.3',source:'https://github.com/mathjax/MathJax-fonts',license:'Apache-2.0'}]});
await writeFile('vendor/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('MathJax local SVG bundle:',(await readFile(output)).length,'bytes');
