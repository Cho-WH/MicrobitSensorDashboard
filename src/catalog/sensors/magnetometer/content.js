import { createLocationGuide } from '../shared/location-guide.js';
export const uiCopy = {
  home: { sensorTitle: '자기장 측정', sensorEquipment: 'micro:bit 내장 센서', sensorDescription: '자석의 거리와 방향을 바꾸며 자기장을 살펴봐요.' },
  guide: { receptionNote: 'X·Y·Z 성분과 자기장 크기를 μT로 확인해요. 자석·금속 물체와의 거리, 보드의 방향을 함께 살펴보세요.' },
};
export const equipment = [
  { id: 'microbit', name: 'micro:bit V2', help: '보드 안의 자기장 센서를 사용해요. 외부 센서와 연결선은 필요하지 않아요.' },
  { id: 'usb', name: 'USB 데이터 케이블', help: '처음 프로그램을 넣을 때는 Micro-B 데이터 케이블이 필요해요. 센서 실험실의 다른 프로그램이 있다면 무선으로 바꿀 수 있어요. 이미 설치했다면 연결·보정 확인부터 진행할 수 있어요.' },
  { id: 'power', name: '전원 · USB 또는 배터리', help: '프로그램 설치 뒤에는 USB나 micro:bit용 배터리로 전원을 공급해요. 준비하는 동안 보드 전원을 유지하세요.' },
];

export const experimentGuide = createLocationGuide({
  id: 'magnetometer',
  name: '자기장',
  image: 'sensor-motion',
  alt: '뒷면의 가속도·자기장 통합 칩을 가리키는 화살표',
  location: '보드 뒷면 아래쪽의 작은 칩 안에 가속도 센서와 함께 들어 있어요.',
  tip: '자석과의 거리를 비교할 때는 보드 가장자리 대신 표시된 센서 위치를 기준으로 삼으세요.',
});
