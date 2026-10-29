import test from 'node:test';
import assert from 'node:assert/strict';
import { wiringSetup as bmp } from '../../src/catalog/sensors/bmp280/wiring.js';
import { wiringSetup as ds } from '../../src/catalog/sensors/ds18b20/wiring.js';
import { sensorbitSpec } from '../../public/assets/devices/sensorbit/spec.js';
import { validateAssembly } from '../../public/assets/devices/wiring/assembly.js';
import { validateViewerState } from '../../public/assets/devices/wiring/protocol.js';

// Wrong diagrams can cause real power/signal miswiring. Validate electrical paths,
// not pixels, decorative geometry or the wording of the preparation instructions.
function bundledFixture(probes = '1') {
  const plan = ds.create({ probes });
  for (const cable of plan.cables) if (cable.kind === 'individual') cable.kind = 'bundle';
  return plan;
}
test('individual, bundled and terminal-adapter routes preserve the required electrical paths', () => {
  for (const connector of ['pin', 'socket']) assert.doesNotThrow(() => bmp.create({ connector }));
  for (const probes of ['1', '2']) for (const plan of [ds.create({ probes }), bundledFixture(probes)]) {
    assert.equal(plan.parts.filter(part => part.spec.id === 'ds18b20').length, Number(probes));
    assert.doesNotThrow(() => validateAssembly(plan));
  }
});

test('missing terminal, absent adapter bridge, crossed power/data and reordered bundled pins are rejected', () => {
  const edits = [
    plan => { plan.cables[0].leads[0].to.port = 'unknown'; },
    plan => { plan.parts.find(part => part.id === 'terminal1').spec.bridges = []; },
    plan => { const leads = plan.cables[0].leads; [leads[0].to, leads[1].to] = [leads[1].to, leads[0].to]; },
    plan => { plan.cables[0].leads[0].from.port = 'P2.S'; },
  ];
  for (const edit of edits) { const plan = structuredClone(ds.create({ probes: '1' })); edit(plan); assert.throws(() => validateAssembly(plan)); }
  const short = structuredClone(ds.create({ probes: '1' }));
  short.parts.find(part => part.id === 'terminal1').spec.bridges.push(['screw.DAT', 'screw.VCC']);
  assert.throws(() => validateAssembly(short));
  const reordered = bundledFixture(), leads = reordered.cables[0].leads;
  [leads[0], leads[1]] = [leads[1], leads[0]];
  assert.throws(() => validateAssembly(reordered));
});

test('a board replacement uses the supplied interface mapping and refuses unsupported signals', () => {
  const replacement = structuredClone(sensorbitSpec); replacement.id = 'test-board';
  replacement.ports = Object.fromEntries(Object.entries(replacement.ports).map(([id, value]) => [`test-${id}`, value]));
  replacement.interfaces = Object.fromEntries(Object.entries(replacement.interfaces).map(([id, mapping]) => [id,
    Object.fromEntries(Object.entries(mapping).map(([role, port]) => [role, `test-${port}`]))]));
  for (const setup of [bmp, ds]) {
    const assembly = setup.create({}, replacement);
    for (const cable of assembly.cables) for (const lead of cable.leads) if (lead.from.part === 'board') assert.ok(replacement.ports[lead.from.port]);
  }
  delete replacement.interfaces.P2;
  assert.doesNotThrow(() => ds.create({ probes: '1' }, replacement));
  assert.throws(() => ds.create({ probes: '2' }, replacement));
});

test('viewer accepts only the registered sensor signals and configuration options', () => {
  const state = { view: 'front', wire: 'dq2', explosion: 0, options: { probes: '2' } };
  assert.equal(validateViewerState(ds, state).wire, 'dq2');
  for (const bad of [{ ...state, wire: 'scl' }, { ...state, options: { probes: '8' } }, { ...state, options: { url: 'https://other.test/' } }, { ...state, explosion: NaN }]) assert.throws(() => validateViewerState(ds, bad));
});
