// Preparation and wiring flow adapted from Cho-WH/bme280@59c5c149 G/guide/steps.js.
import { equipment, wiring, cableHelp } from './content.js';
import { deviceIllustrations } from '../shared/device-illustrations.js';
/** @type {import('../../../guide/types.js').SensorGuide} */
export const guide = {
  equipment, wiring, cableHelp,
  illustrations: {
    ...deviceIllustrations,
    equipment: {
      ...deviceIllustrations.equipment,
      sensor: {src:new URL('../../../../public/assets/devices/posters/bmp280.png',import.meta.url).href,alt:'VCC·GND·SCL·SDA 등이 표시된 BMP280 센서 모듈'},
      board: {src:new URL('../../../../public/assets/devices/posters/expansion-board.png',import.meta.url).href,alt:'micro:bit를 끼우는 슬롯과 센서 연결 단자가 있는 sensor:bit 확장 보드'},
      wires: {src:new URL('../../../../public/assets/devices/posters/jumper-wires.png',import.meta.url).href,alt:'전원·접지·클록·데이터에 사용할 연결선 네 가닥. 그림은 수–암 연결선이에요.'},
    },
  },
  equipmentDescription: 'micro:bit V2, BMP280, 확장 보드와 연결선 네 가닥을 준비하세요.',
  viewer: {
    url: new URL('../../../../public/viewers/bmp280/index.html?embed=1', import.meta.url).href,
    title: 'BMP280 배선 3D 안내', tableCaption: '확장 보드 ↔ BMP280 배선표', boardLabel: '확장 보드', sensorLabel: 'BMP280',
    noteTitle: '확장 보드가 그림과 다르게 생겼나요?',
    note: '전원은 V·3.3V, 접지는 G·GND, 클록은 CL·SCL·P19, 데이터는 DA·SDA·P20으로 표시될 수 있어요. 배선표에서 단자 이름을 비교하세요.',
  },
  beforeProgram: wiring.map(wire => ({ id: wire.id, title: `${wire.role}: ${wire.board} → ${wire.sensor}`,
    description: wire.description, scope: 'sensor', kind: 'manual', required: true, quickConfirm: true,
    group: 'wiring', groupLabel: '배선', action: '연결했어요', model: { view: 'front', wire: wire.id, explosion: 18 } })),
};
