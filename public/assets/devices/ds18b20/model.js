import { Group, Mesh, CylinderGeometry } from '../../../vendor/three-r180.js';
import { material, label } from '../shared/legacy-primitives.js';
import { cable } from '../shared/cable.js';
import { probeSpec } from './spec.js';

export function createProbe() {
  const root = new Group(); root.name = 'ds18b20-probe';
  const steel = material('#d7dde0', .55, .28), rubber = material('#20272b', .05, .64);
  const cylinder = (radius, length, x, surface) => {
    const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 32), surface);
    mesh.rotation.z = Math.PI / 2; mesh.position.x = x; root.add(mesh); return mesh;
  };
  // Cable length shortened for readability. External dimensions are approximate,
  // based on SEN050007 photos; this is not a manufacturing model.
  cylinder(3, 35, 64.5, steel);
  const tip = new Mesh(new CylinderGeometry(2.6, 3, 1, 32), steel); tip.rotation.z = -Math.PI / 2; tip.position.x = 82.5; root.add(tip);
  cylinder(3.2, 9, 44, rubber); cylinder(2.7, 7, 38, rubber);
  cable(root, [[0, 0, 0], [14, 19, 0], [25, -18, 1], [36, 0, 0]], 1.7, '#20272b', 'probe-jacket');
  const colors = { DQ: '#d7c7a1', VCC: '#d64c4c', GND: '#354255' };
  for (const [name, port] of Object.entries(probeSpec.ports)) {
    const [x, y, z] = port.point;
    cable(root, [[x, y, z], [-5, y, 0], [-2, 0, 0], [1, 0, 0]], .42, colors[name], `probe-${name}`);
  }
  label(root, 'DS18B20', 66, 0, 3.1, 2, '#52646e');
  return root;
}
