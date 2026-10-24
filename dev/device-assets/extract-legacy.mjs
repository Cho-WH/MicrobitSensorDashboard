// Run once with the pinned, original bmp280-wiring/index.html as the argument.
// Extracts existing Three.js/OrbitControls rather than bundling a second runtime.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: node dev/device-assets/extract-legacy.mjs <original-html>');
const html = await readFile(sourcePath, 'utf8');
const sourceHash = createHash('sha256').update(html).digest('hex');
if (sourceHash !== '3212905c9963dd360791a43f1b7500bddd4dbeffcafee2f5153bda1fdd61fe47') throw new Error('Input does not match the pinned original bundle');
const start = html.indexOf('<script>(()=>{'), end = html.indexOf('</script>', start);
if (start < 0 || end < 0) throw new Error('Expected pinned inline viewer bundle');
const code = html.slice(start + 8, end);
const ast = ts.createSourceFile('viewer.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const statements = ast.statements[0].expression.expression.expression.body.statements;
const split = statements.findIndex(n => n.getText().startsWith('var x_='));
if (split < 0) throw new Error('Unknown bundle layout');
const engine = statements.slice(0, split), scene = statements.slice(split);
const bindings = new Set();
for (const node of engine) {
  if (ts.isVariableStatement(node)) for (const d of node.declarationList.declarations) bindings.add(d.name.text);
  else if (node.name) bindings.add(node.name.text);
}
const needed = new Set();
function visit(n) { if (ts.isIdentifier(n) && bindings.has(n.text)) needed.add(n.text); ts.forEachChild(n, visit); }
scene.forEach(visit);
const aliases = {
  ye:'Group', ge:'Mesh', qn:'BoxGeometry', Fs:'CylinderGeometry', Rn:'Shape', Cn:'Path',
  Qi:'ExtrudeGeometry', ts:'ShapeGeometry', Xs:'RingGeometry', In:'MeshStandardMaterial',
  pi:'MeshBasicMaterial', _i:'PlaneGeometry', Ls:'CanvasTexture', P:'Vector3', Ds:'Scene',
  Pe:'PerspectiveCamera', ra:'WebGLRenderer', Zs:'HemisphereLight', ns:'DirectionalLight',
  la:'OrbitControls', we:'SRGBColorSpace', _o:'ACESFilmicToneMapping',
  Ki:'CubicBezierCurve3', qs:'TubeGeometry', Ee:'BufferGeometry', mi:'Line', Yn:'LineBasicMaterial',
};
for (const key of Object.keys(aliases)) if (!bindings.has(key)) throw new Error('Missing engine binding: '+key);
const exports = [...needed, ...Object.entries(aliases).map(([a,b])=>`${a} as ${b}`)];
await mkdir('public/assets/devices/shared', { recursive:true });
await writeFile('public/vendor/three-r180.js', '// Three.js r180 + OrbitControls, extracted from the pinned BMP280 viewer.\n// Copyright 2010–2025 Three.js Authors. SPDX-License-Identifier: MIT\n// See three-r180-LICENSE.txt and public/assets/devices/README.md.\n'+engine.map(n=>n.getText()).join('\n')+'\nexport { '+exports.join(', ')+' };\n');
const printer = ts.createPrinter();
const print = nodes => nodes.map(n=>printer.printNode(ts.EmitHint.Unspecified,n,ast)).join('\n');
const componentNames=new Set(['jh','Qh','$h','S_','b_']);
const components=scene.filter(n=>componentNames.has(n.name?.text));
let componentSource=print(components).replace('function $h(i, t, e, n, s)', 'function $h(i, t, e, n, s, color)')
  .replace('let l = Ai.find(c => c.id === n); return','return').replace('color: l.color','color');
if(componentSource.includes('Ai.find'))throw new Error('Unexpected jumper factory format');
await mkdir('public/assets/devices/bmp280',{recursive:true});
await writeFile('public/assets/devices/bmp280/model.js', "// Geometry reused from Cho-WH/bme280@59c5c149. See ../README.md for provenance.\nimport { Group as ye, MeshStandardMaterial as In } from '../../../vendor/three-r180.js';\nimport { material as xe, box as At, disc as ei, plate as kl, ring as Un, label as re } from '../shared/legacy-primitives.js';\nconst _n=2.54,Qe=xe('#d6b55f',.72,.28),be=xe('#252a30'),Ce=xe('#aab4bd',.75,.27);\n"+componentSource+'\nexport { S_ as createExpansionBoard, b_ as createBmp280, $h as addJumperEnd, jh as addHeader, Qh as addChip };\n');
await writeFile('public/viewers/bmp280/scene.js', '// Extracted without changing the legacy scene behavior. See README.md for provenance.\nimport { '+[...needed].join(', ')+' } from "../../vendor/three-r180.js";\n'+
  "import { createExpansionBoard as S_, createBmp280 as b_, addJumperEnd, addHeader as jh, addChip as Qh } from '../../assets/devices/bmp280/model.js';\n"+
  print(scene.filter(n=>!componentNames.has(n.name?.text)))+'\nfunction $h(i,t,e,n,s){return addJumperEnd(i,t,e,n,s,Ai.find(wire=>wire.id===n).color);}\n');
// The small geometry and connector helpers are adapted by the new device factories.
const helperNames = new Set(['xe','At','ei','Kh','kl','Un','y_','re','v_']);
const helpers = scene.filter(n=>helperNames.has(n.name?.text));
await writeFile('public/assets/devices/shared/legacy-primitives.js', '// Geometry, label and hollow socket helpers adapted from Cho-WH/bme280@59c5c149.\n// Original application-code license qualification: see ../README.md.\nimport { '+[...needed].join(', ')+' } from "../../../vendor/three-r180.js";\nconst Bl=new Map(), zl=new Map();\n'+print(helpers)+'\nconst Qe=xe("#d6b55f",.72,.28), be=xe("#252a30"), Ce=xe("#aab4bd",.75,.27);\nexport { xe as material, At as box, ei as disc, Kh as roundedShape, kl as plate, Un as ring, re as label, v_ as addBoardPorts };\n');
await writeFile('public/viewers/bmp280/index.html', html.slice(0,start)+'<script type="module" src="./scene.js"></script>'+html.slice(end+9));
console.log('Extracted shared r180 engine, legacy scene and reusable geometry. Input SHA-256: '+createHash('sha256').update(html).digest('hex'));
