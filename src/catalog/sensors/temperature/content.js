import { createLocationGuide } from '../shared/location-guide.js';
export const equipmentDescription = 'micro:bit V2와 USB 데이터 케이블, 전원을 준비하세요. 손이나 열원의 영향을 받으므로 같은 위치에 두고 값이 안정된 뒤 비교하세요.';
export const uiCopy = {
  home: { sensorTitle: '온도(내장) 측정', sensorEquipment: 'micro:bit 내장 센서', sensorDescription: '보드의 온도가 어떻게 변하는지 살펴봐요.' },
  guide: { receptionNote: '보드 내부 온도로 주변 온도를 어림해요. 손이나 열원의 영향을 피하고 값이 안정된 뒤 비교하세요. 공기 온도계와 다를 수 있어요.' },
};
export const equipment = [
  { id: 'microbit', name: 'micro:bit V2', help: '보드 안의 프로세서 온도로 주변 온도를 어림해요. 공기 온도계와 다를 수 있으며, 1°C 단위 값이 약 1초마다 들어와요. 외부 센서는 필요하지 않아요.' },
  { id: 'usb', name: 'USB 데이터 케이블', help: '처음 프로그램을 넣을 때는 Micro-B 데이터 케이블이 필요해요. 센서 실험실의 다른 프로그램이 있다면 무선으로 바꿀 수 있어요. 이미 올바른 프로그램이 설치되어 있다면 연결·수신 확인부터 진행할 수 있어요.' },
  { id: 'power', name: '전원 · USB 또는 배터리', help: '프로그램 설치 뒤에는 USB나 micro:bit용 배터리로 전원을 공급해요. 측정하는 동안 전원과 주변 조건을 일정하게 유지하세요.' },
];

export const experimentGuide = createLocationGuide({
  id: 'temperature',
  name: '온도',
  image: 'sensor-temperature',
  alt: '뒷면 메인 프로세서 안의 온도 센서 위치를 가리키는 화살표',
  location: '보드 뒷면의 프로세서 안에 들어 있어요.',
  tip: '보드 자체의 온도를 측정하므로 손으로 오래 잡으면 값이 올라가고, 주변 공기 온도와 다를 수 있어요.',
});
