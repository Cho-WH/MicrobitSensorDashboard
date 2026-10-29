// EF03415 V1.6: 16 G/V/S columns P1–P16; P0 is the onboard audio output.
// Source: https://wiki.elecfreaks.com/en/microbit/expansion-board/sensor-bit/
const pitch = 2.54;
const port = (point, contact, net, connector, slot) => ({ point, direction: [0, 0, 1], contact, net, connector, slot, pitch });
const ports = {};
const interfaces = {};
for (let pin = 1; pin <= 16; pin++) {
  const x = (pin - 8.5) * pitch;
  const id = `P${pin}`;
  interfaces[id] = { signal: `${id}.S`, power: `${id}.V`, ground: `${id}.G` };
  for (const [slot, suffix, net] of /** @type {[number,string,string][]} */ ([[0, 'S', id], [1, 'V', '3V'], [2, 'G', 'GND']])) {
    ports[`${id}.${suffix}`] = port([x, -9 - slot * pitch, 3.2], 'pin', net, id, slot);
  }
}
for (const [id, x, contact, z] of /** @type {[string,number,string,number][]} */ ([['socket', -19.05, 'socket', 8.15], ['pin', 11.43, 'pin', 3.2]])) {
  const mapping = {};
  for (const [slot, name, net] of /** @type {[number,string,string][]} */ ([[0, 'G', 'GND'], [1, 'V', '3V'], [2, 'CL', 'P19'], [3, 'DA', 'P20']])) {
    ports[`${id}.${name}`] = port([x + slot * pitch, -18.6, z], contact, net, id, slot);
    mapping[net] = `${id}.${name}`;
  }
  interfaces[`i2c-${id}`] = mapping;
}
export const sensorbitSpec = {
  id: 'sensorbit', label: 'sensor:bit V1.6', ports, interfaces,
  microbitPose: { position: [0, 25.3, 8.65] },
};
