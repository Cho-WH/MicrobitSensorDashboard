export const probeSpec = {
  id: 'ds18b20', ports: Object.fromEntries(['DQ', 'VCC', 'GND'].map((id, slot) => [id,
    { point: [-8, 4 - slot * 4, 0], direction: [-1, 0, 0], contact: 'wire' }])),
};
