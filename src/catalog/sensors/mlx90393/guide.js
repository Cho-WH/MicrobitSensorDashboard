import { deviceIllustrations } from '../shared/device-illustrations.js';
const wiring = [
  { id: 'vcc', board: '3V', sensor: 'VIN / VCC', role: '전원', description: 'QT 케이블 빨간 선을 3V 단자에 연결하세요.' },
  { id: 'gnd', board: 'GND', sensor: 'GND', role: '접지', description: '검은 선을 GND에 연결하세요.' },
  { id: 'sda', board: 'P20 / SDA', sensor: 'SDA', role: '데이터', description: '파란 선을 P20(SDA)에 연결하세요.' },
  { id: 'scl', board: 'P19 / SCL', sensor: 'SCL', role: '클록', description: '노란 선을 P19(SCL)에 연결하세요.' },
];
/** @type {import('../../../guide/types.js').SensorGuide} */
export const guide = {
  equipmentDescription: 'micro:bit V2, MLX90393 센서, 확장 보드와 QT 연결 케이블을 준비하세요.',
  equipment: [
    { id: 'microbit', name: 'micro:bit V2', help: '센서의 값을 읽고 컴퓨터나 모바일로 보내요.' },
    { id: 'sensor', name: 'Adafruit MLX90393 (4022)', help: 'STEMMA QT 커넥터가 있는 외장 3축 자기장 센서예요.' },
    { id: 'board', name: '확장 보드', help: '3V·GND·P19·P20 단자를 사용해요. 전원 선택은 3.3V로 맞추세요.' },
    { id: 'wires', name: 'QT–개별 암 소켓 케이블 (4397)', help: 'JST-SH 1.0mm 4핀을 센서에 꽂고 개별선을 확장 보드에 연결해요. Grove 2mm 케이블은 맞지 않아요.' },
    { id: 'usb', name: 'USB 데이터 케이블', help: '처음 센서 프로그램을 설치할 때 사용해요.' },
  ],
  illustrations: { ...deviceIllustrations, equipment: { microbit: deviceIllustrations.equipment.microbit, usb: deviceIllustrations.equipment.usb } },
  wiring, wiringTable: { tableCaption: 'micro:bit ↔ MLX90393', boardLabel: '보드 단자', sensorLabel: '센서 단자',
    noteTitle: '연결선 확인', note: 'Adafruit 4397 기준 색상입니다. 다른 케이블은 색상보다 핀 표기를 우선하세요. 전원을 끄고 배선하세요.' },
  beforeProgram: wiring.map(w => ({ id: w.id, title: `${w.role}: ${w.board} → ${w.sensor}`, description: w.description,
    scope: 'sensor', kind: 'manual', required: true, quickConfirm: true, group: 'wiring', groupLabel: '배선', action: '연결했어요' })),
};
