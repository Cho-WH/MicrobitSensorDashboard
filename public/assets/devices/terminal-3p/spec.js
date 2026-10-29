// SEN050007 product photographs: DAT / VCC / GND on both sides.
// PCB is 23 × 20 mm; connector dimensions are educational approximations.
export const terminalSpec = {
  id: 'terminal-3p', ports: {}, bridges: [['header.DAT', 'screw.DAT'], ['header.VCC', 'screw.VCC'], ['header.GND', 'screw.GND']],
};
for (const [slot, name] of ['DAT', 'VCC', 'GND'].entries()) {
  terminalSpec.ports[`header.${name}`] = { point: [-11.5, 2.54 - slot * 2.54, 2.8], direction: [-1, 0, 0], contact: 'pin', connector: 'header', slot, pitch: 2.54 };
  terminalSpec.ports[`screw.${name}`] = { point: [9, 5 - slot * 5, 3.5], direction: [1, 0, 0], contact: 'clamp', connector: 'screw', slot, pitch: 5 };
}
