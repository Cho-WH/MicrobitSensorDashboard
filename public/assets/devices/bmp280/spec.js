export const bmp280Spec = {
  id: 'bmp280', ports: Object.fromEntries(['VCC', 'GND', 'SCL', 'SDA', 'CSB', 'SDO'].map((id, slot) => [id,
    { point: [(slot - 2.5) * 2.54, 4, 3.2], direction: [0, 0, 1], contact: 'pin', connector: 'header', slot, pitch: 2.54 }])),
};
