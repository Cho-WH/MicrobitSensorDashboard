import { equipment, equipmentDescription, wiring, experimentGuide, probeIllustration } from './content.js';
import { deviceIllustrations } from '../shared/device-illustrations.js';
import { wiringSetup } from './wiring.js';

/** @type {import('../../../guide/types.js').SensorGuide} */
export const guide = {
  equipment, equipmentDescription, wiring, experimentGuide,
  viewer: { url: new URL('../../../../public/viewers/wiring/index.html?sensor=ds18b20&embed=1', import.meta.url).href,
    title: 'DS18B20 배선 3D 안내', defaults: wiringSetup.defaults, choices: wiringSetup.choices },
  illustrations: { ...deviceIllustrations, equipment: { ...deviceIllustrations.equipment, sensor: probeIllustration,
    board: { src: new URL('../../../../public/assets/devices/posters/expansion-board.png', import.meta.url).href, alt: 'sensor:bit 확장 보드' },
    wires: { src: new URL('../../../../public/assets/devices/posters/terminal-3p.png', import.meta.url).href,
      alt: 'DAT·VCC·GND 나사 단자와 3핀 커넥터가 있는 터미널 모듈' } } },
  wiringTable: { tableCaption: 'micro:bit ↔ DS18B20 배선표', boardLabel: '보드 단자', sensorLabel: 'DS18B20',
    noteTitle: '선 색상이나 단자 표시가 다른가요?',
    note: '프로브 세 선을 모듈의 DAT·VCC·GND 나사 단자에 고정하세요. 반대편 핀에는 암–암 점퍼선을 하나씩 꽂아, 확장 보드 P1 또는 P2의 신호(S)·전원(V)·접지(G)에 각각 연결합니다. 선 색상만 보고 연결하지 마세요.' },
  beforeProgram: wiring.map(wire => ({ id: wire.id, title: `${wire.role}: ${wire.board} → ${wire.sensor}`,
    description: wire.description, scope: 'sensor', kind: 'manual', required: wire.id !== 'dq2', quickConfirm: wire.id !== 'dq2',
    group: 'wiring', groupLabel: '배선', action: wire.id === 'dq2' ? '확인했어요' : '연결했어요',
    model: { view: 'iso', wire: wire.id, explosion: 0, ...(wire.id === 'dq2' ? { options: { probes: '2' } } : {}) } })),
};
