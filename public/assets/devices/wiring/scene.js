import { Group, Vector3, Mesh, TubeGeometry, CubicBezierCurve3 } from '../../../vendor/three-r180.js';
import { createMicrobitV2 } from '../microbit-v2/model.js';
import { createBmp280 } from '../bmp280/model.js';
import { createExpansionBoard } from '../sensorbit/model.js';
import { createTerminalAdapter } from '../terminal-3p/model.js';
import { createProbe } from '../ds18b20/model.js';
import { addJumperEnd } from '../shared/connectors.js';
import { box, material, label, isSharedMaterial } from '../shared/legacy-primitives.js';
import { validateAssembly } from './assembly.js';

const factories = { 'microbit-v2': createMicrobitV2, sensorbit: createExpansionBoard, bmp280: createBmp280,
  'terminal-3p': createTerminalAdapter, ds18b20: createProbe };
const axis = new Vector3(0, 0, 1);

// A board profile owns ports, connector types and the micro:bit mount pose.
// The renderer only consumes the resolved assembly; it never branches on a sensor ID.
export function createWiringScene(assembly, modelFactories = {}) {
  validateAssembly(assembly);
  const models = { ...factories, ...modelFactories };
  const root = new Group(), parts = new Map(), paths = [], ownedMaterials = new Set();
  let selected = null, separation = 0;
  for (const part of assembly.parts) {
    const factory = models[part.spec.id];
    if (!factory) throw new Error(`부품 모델이 없습니다: ${part.spec.id}`);
    const model = factory(); model.position.set(...(part.position ?? [0, 0, 0]));
    if (part.rotation) model.rotation.set(...part.rotation);
    root.add(model); parts.set(part.id, { model, spec: part.spec });
    if (part.caption) label(model, part.caption.text, ...part.caption.position, 3.5, '#536b75');
  }
  root.updateMatrixWorld(true);
  function endpoint(ref) {
    const { model, spec } = parts.get(ref.part), port = spec.ports[ref.port];
    return { ...port, point: model.localToWorld(new Vector3(...port.point)),
      direction: new Vector3(...port.direction).applyQuaternion(model.getWorldQuaternion(model.quaternion.clone())).normalize() };
  }
  function addPlug(group, port, lead, end) {
    if (!['pin', 'socket'].includes(port.contact)) return { tip: port.point.clone(), plug: null };
    const plug = addJumperEnd(group, port.point, port.contact === 'socket', lead.signal, end, lead.color);
    plug.quaternion.setFromUnitVectors(axis, port.direction);
    return { tip: port.point.clone().addScaledVector(port.direction, 8.2), plug };
  }
  function addHousing(group, ports) {
    if (ports.length < 2) return;
    const first = ports[0], last = ports.at(-1), x = last.point.clone().sub(first.point).normalize();
    const z = first.direction, y = new Vector3().crossVectors(z, x).normalize();
    const center = first.point.clone().lerp(last.point, .5).addScaledVector(z, 6.5);
    const housing = box(group, first.point.distanceTo(last.point) + 2.4, 2.45, 1, 0, 0, 0, material('#272f37'));
    housing.position.copy(center); housing.quaternion.setFromRotationMatrix(housing.matrix.clone().makeBasis(x, y, z));
    return { mesh: housing, position: center, direction: z };
  }
  for (const cable of assembly.cables) {
    const body = new Group(); body.name = cable.id; root.add(body);
    const leads = [], housings = [];
    for (const lead of cable.leads) {
      const group = new Group(), from = endpoint(lead.from), to = endpoint(lead.to);
      body.add(group);
      const source = addPlug(group, from, lead, 'source'), target = addPlug(group, to, lead, 'target');
      const a = source.tip, b = target.tip;
      const reach = Math.max(6, a.distanceTo(b) * .32);
      const c1 = a.clone().addScaledVector(from.direction, reach), c2 = b.clone().addScaledVector(to.direction, reach);
      const curve = new CubicBezierCurve3(a, c1, c2, b);
      const mesh = new Mesh(new TubeGeometry(curve, 48, .48, 10, false), material(lead.color, .08, .5));
      group.add(mesh);
      // Highlight materials are instance-owned. Never mutate/dispose cached model materials.
      group.traverse(node => {
        node.userData.signal = lead.signal;
        if (node.material) { node.material = node.material.clone(); ownedMaterials.add(node.material); }
      });
      leads.push({ group, signal: lead.signal, from, to, source, target, mesh, reach });
    }
    if (cable.kind === 'bundle') for (const side of ['from', 'to']) housings.push(addHousing(body, leads.map(lead => lead[side])));
    // A jacket is a physical part separate from the electrical leads. Keep exposed
    // ends visible, and do not turn several signals into a single electrical edge.
    if (cable.kind === 'sheathed') {
      const middle = sides => leads.reduce((sum, lead) => sum.add(lead[sides].point), new Vector3()).divideScalar(leads.length);
      const a = middle('from'), b = middle('to'), delta = b.clone().sub(a);
      const jacket = new Mesh(new TubeGeometry(new CubicBezierCurve3(a.clone().addScaledVector(delta, .35), a.clone().addScaledVector(delta, .45), a.clone().addScaledVector(delta, .55), a.clone().addScaledVector(delta, .65)), 16, 1.7, 12, false), material('#252c32'));
      body.add(jacket);
    }
    paths.push({ body, leads, housings, signals: cable.leads.map(lead => lead.signal) });
  }
  root.traverse(node => { if (node.material && !isSharedMaterial(node.material)) ownedMaterials.add(node.material); });
  const highlight = () => {
    for (const path of paths) for (const lead of path.leads) lead.group.traverse(node => {
      if (!node.material) return;
      const dim = selected !== null && lead.signal !== selected;
      if (node.material.transparent !== dim) node.material.needsUpdate = true;
      node.material.transparent = dim; node.material.opacity = dim ? .2 : 1; node.material.depthWrite = !dim;
      node.material.emissive?.set(selected === lead.signal ? '#20323d' : '#000000');
    });
  };
  return { root, parts, paths, availableSignals: new Set(paths.flatMap(path => path.signals)),
    select(signal) { if (signal !== null && !assembly.signals.some(item => item.id === signal)) throw new Error('알 수 없는 연결입니다.'); selected = signal; highlight(); },
    setSeparation(value) {
      separation = Math.max(0, Math.min(20, Number(value) || 0));
      for (const path of paths) {
        for (const housing of path.housings) housing.mesh.position.copy(housing.position).addScaledVector(housing.direction, separation);
        for (const lead of path.leads) {
          const { source, target, from, to, mesh, reach } = lead;
          const a = source.tip.clone(), b = target.tip.clone();
          if (source.plug) { source.plug.position.copy(from.point).addScaledVector(from.direction, separation); a.addScaledVector(from.direction, separation); }
          if (target.plug) { target.plug.position.copy(to.point).addScaledVector(to.direction, separation); b.addScaledVector(to.direction, separation); }
          mesh.geometry.dispose();
          mesh.geometry = new TubeGeometry(new CubicBezierCurve3(a, a.clone().addScaledVector(from.direction, reach), b.clone().addScaledVector(to.direction, reach), b), 48, .48, 10, false);
        }
      }
    },
    focus(signal = selected) {
      const points = paths.flatMap(path => path.leads.filter(lead => !signal || lead.signal === signal).flatMap(lead => [lead.from.point, lead.to.point]));
      return points.length ? points.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(points.length).add(new Vector3(0, 0, separation)) : new Vector3();
    },
    dispose() { root.traverse(node => node.geometry?.dispose()); ownedMaterials.forEach(value => value.dispose()); },
  };
}
