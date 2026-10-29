// Preparation copy adapted from G/ui/action-help-content.js and G/guide/steps.js.
export const uiCopy = {
  home: { sensorTitle: '온도·기압 측정', sensorEquipment: 'BMP280 · 외장 센서', sensorDescription: '온도와 기압의 변화를 함께 살펴봐요.' },
  guide: { receptionNote: '온도와 기압을 함께 확인해요. 센서가 손이나 물체에 닿지 않게 두고 값이 안정될 때까지 기다리세요. 기압 단위는 hPa예요.' },
};
export const equipment = [
  { id: 'microbit', name: 'micro:bit V2', help: '센서의 측정값을 컴퓨터로 보내는 장치예요. 이 안내는 micro:bit V2를 기준으로 합니다.' },
  { id: 'sensor', name: 'BMP280 센서', help: '온도와 기압을 측정해요. 습도는 이 센서의 측정 항목이 아니에요.' },
  { id: 'board', name: '확장 보드', help: 'micro:bit에 센서 연결선을 꽂을 수 있게 해 주는 보드예요. 그림에서는 sensor:bit를 사용합니다.' },
  { id: 'wires', name: '연결선 4개', help: '확장 보드와 센서의 단자 모양에 맞는 선을 준비하세요. 수는 핀, 암은 핀이 들어가는 구멍이에요.' },
  { id: 'usb', name: 'USB 데이터 케이블', help: '처음 프로그램을 넣을 때는 Micro-B 데이터 케이블이 필요해요. 센서 실험실의 다른 프로그램이 있다면 무선으로 바꿀 수 있어요. USB로 설치할 때는 충전 전용 케이블을 사용할 수 없어요.' },
];
export { wiring } from './wiring.js';
export const cableHelp = 'sensor:bit의 왼쪽 소켓에는 수–암, 오른쪽 핀에는 암–암 케이블을 연결해요. 센서 쪽은 모두 암이에요. 보드가 다르면 단자 이름을 배선표와 비교하세요.';
