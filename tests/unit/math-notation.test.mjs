import test from 'node:test';
import assert from 'node:assert/strict';
import { mathSvg } from '../../src/ui/math-view.js';
import { texText, texNumber, binaryTex, valueWithUnit, quotientUnit } from '../../src/ui/scientific-notation.js';
import { relations, substitutions } from '../../src/ui/centripetal/formulas.js';

test('inline equations retain operators and the final term in the visible SVG',async()=>{
  const {svg}=await mathSvg(String.raw`y=2\times x+3`,{display:false,description:'추세선'});
  // Check actual glyphs, not the accessibility label that already contains the full equation.
  for(const code of ['3D','32','D7','2B','33'])assert.ok(svg.includes(`data-c="${code}"`),`missing equation glyph ${code}`);
});

test('shared math produces portable fractions, roots, units and vectors without external glyph references',async()=>{
  const forms=[...Object.values(relations),String.raw`\vec{a}=\sqrt{x^2+y^2}`,String.raw`9.8\;\mathrm{m/s^2}`,binaryTex(texText('압력 (hPa)'), '/',texText('절대온도 (K)'))];
  for(const tex of forms){const result=await mathSvg(tex,{description:'관계식',display:true});assert.ok(result.width>0&&result.height>0);assert.ok(result.svg.includes('<path'));assert.ok(!result.svg.includes('<use'));assert.ok(!result.svg.includes('data-mml-node="merror"'));}
});
test('text and units are data, not executable markup or TeX commands',async()=>{
  const label=String.raw`<script>\frac{1}{0}</script>_%`;
  const result=await mathSvg(texText(label),{description:label});
  assert.ok(!result.svg.includes('<script>'));assert.ok(result.svg.includes('&lt;script&gt;'));
  assert.equal(valueWithUnit('9.80','m/s²'),'9.80\u00a0m/s²');
  assert.equal(quotientUnit('m/s²','s'),'(m/s²)/s');
  assert.equal(quotientUnit('hPa','K'),'hPa/K');
  assert.equal(texNumber(1e-8),String.raw`1\times10^{-8}`);
  await assert.rejects(mathSvg(String.raw`\notAnAllowedCommand{a}`));
});
test('substitutions preserve learner answers and use metre radius directly',()=>{
  const values={radius:0.2,period:2,omega:3,sensor:123,orbital:456},before=structuredClone(values);
  const result=substitutions(values,12.25);
  assert.ok(result.orbital.includes('0.2'));assert.ok(!result.sensor.includes('123'));assert.ok(!result.orbital.includes('456'));
  assert.deepEqual(values,before);
});

test('incomplete substitutions retain supplied values and render blank operands without inventing zero',async()=>{
  const partial=substitutions({radius:0.2},null);
  assert.ok(partial.orbital.includes('0.2'));
  assert.ok(partial.orbital.includes(texNumber(null)));
  assert.notEqual(texNumber(null),texNumber(0));
  for(const tex of Object.values(partial)){
    const result=await mathSvg(tex,{display:true});
    assert.ok(result.width>0&&result.height>0);
  }
});
