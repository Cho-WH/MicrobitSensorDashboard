import { accelerometer as legacy } from './definition-v1.js';

// Same firmware and wire format; version 2 records decoded values in SI units.
export const accelerometer = {
  ...legacy, version: 2,
  timeAxis: { accelerationX: {min:-20,max:20}, accelerationY: {min:-20,max:20},
    accelerationZ: {min:-20,max:20}, accelerationStrength: {min:0,max:20} },
  channels: legacy.channels.map(channel => ({ ...channel, unit: 'm/s²', digits: 2 })),
  preparation: [legacy.preparation[0],
    '중력의 영향이 포함되어 정지해 있어도 크기는 약 9.8 m/s²입니다. g로 보기로 표시 단위를 바꿀 수 있습니다.',
    legacy.preparation[2]],
};
