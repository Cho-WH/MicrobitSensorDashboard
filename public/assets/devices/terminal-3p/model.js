import { Group } from '../../../vendor/three-r180.js';
import { plate, box, disc, ring, label, material } from '../shared/legacy-primitives.js';
import { terminalSpec } from './spec.js';

export function createTerminalAdapter() {
  const root = new Group(); root.name = 'terminal-3p';
  const metal = material('#b7c2c5', .8, .26), black = material('#182222'), green = material('#559f42');
  const holes = [[-8, -7, 1.5], [-8, 7, 1.5], [8, -7, 1.5], [8, 7, 1.5]];
  plate(root, 23, 20, 1.6, black, holes, 1.8);
  for (const [x, y, radius] of holes) ring(root, x, y, .84, radius, radius + .5, metal);
  box(root, 8, 15, 7, 5, 0, 4.3, green);
  for (const name of ['DAT', 'VCC', 'GND']) {
    const screw = terminalSpec.ports[`screw.${name}`], pin = terminalSpec.ports[`header.${name}`];
    const y = screw.point[1];
    // Wire entry and recessed screw head are distinct; bare leads enter from +X.
    box(root, .12, 3, 3, 9.06, y, 3.5, black);
    disc(root, 1.65, .12, 5, y, 7.86, black);
    disc(root, 1.3, .14, 5, y, 7.96, metal);
    box(root, 2, .3, .05, 5, y, 8.05, black);
    label(root, name, -.6, y, .88, 1.35, '#eeeeec');
    box(root, 2.5, 2.45, 2.45, -9, pin.point[1], 2.8, black);
    box(root, 5, .64, .64, -11.5, pin.point[1], 2.8, material('#d6b55f', .72, .3));
  }
  label(root, 'Terminal', 0, 8.5, .86, 1.4, '#eeeeec');
  // Product photo shows a resistor between signal and supply. This is a visual part,
  // not an asserted resistance value or a substitute for the supplier's circuit specification.
  box(root, .9, 2.4, .45, -4, 0, 1.06, material('#c3bc9d'));
  for (const y of [-1, 1]) box(root, 1, .45, .5, -4, y, 1.1, metal);
  return root;
}
