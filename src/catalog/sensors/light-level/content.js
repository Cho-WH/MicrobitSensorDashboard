import { createLocationGuide } from '../shared/location-guide.js';
export const equipmentDescription = 'micro:bit V2와 USB 데이터 케이블, 전원을 준비하세요. 앞면 LED가 빛을 향하게 놓고 손이나 케이블이 가리지 않게 하세요.';
export const uiCopy = {
  home: { sensorTitle: '밝기 측정', sensorEquipment: 'micro:bit 내장 센서', sensorDescription: '빛을 비추거나 가리며 밝기를 비교해 봐요.' },
  guide: { receptionNote: '밝기는 0~255의 상대값이며 lux가 아니에요. 앞면 LED를 가리지 말고, 광원과의 거리·방향을 같게 두고 비교하세요.' },
};
export const equipment = [
  { id: 'microbit', name: 'micro:bit V2', help: '앞면 LED로 빛의 밝기를 감지해요. 0~255의 상대값이며 조도 단위인 lux가 아니에요. 값은 약 0.1초마다 들어와요. 외부 센서는 필요하지 않아요.' },
  { id: 'usb', name: 'USB 데이터 케이블', help: '처음 프로그램을 넣을 때는 Micro-B 데이터 케이블이 필요해요. 센서 실험실의 다른 프로그램이 있다면 무선으로 바꿀 수 있어요. 이미 올바른 프로그램이 설치되어 있다면 연결·수신 확인부터 진행할 수 있어요.' },
  { id: 'power', name: '전원 · USB 또는 배터리', help: '프로그램 설치 뒤에는 USB나 micro:bit용 배터리로 전원을 공급해요. 밝기를 비교할 때 보드와 광원의 거리·방향을 일정하게 유지하세요.' },
];

export const experimentGuide = createLocationGuide({
  id: 'light-level',
  name: '밝기',
  image: 'sensor-light',
  alt: '앞면의 빛을 감지하는 LED 배열을 가리키는 화살표',
  location: '앞면 가운데의 LED가 빛을 감지하는 센서 역할도 해요.',
  tip: '밝기를 비교할 때는 앞면이 빛을 향하도록 하고, 손으로 가리지 않도록 하세요.',
  additionalTips: [
    ['밝기를 측정할 때는 LED 표시를 비워 두어요.', 'LED 표시와 밝기 측정을 함께 사용할 수 있지만, 측정값이 흔들리는 경우가 있어요. 이 도구는 측정 중 LED로 글자나 그림을 표시하지 않아요.'],
    ['LED와 함께 쓰는 핀은 비워 두세요', 'micro:bit V2의 P3·P4·P6·P7·P10 핀은 LED와 연결되어 있어요. 밝기를 잴 때 이 핀에 다른 부품을 연결하면 측정에 영향을 줄 수 있어요. 집게를 연결할 때도 옆의 작은 핀에 닿지 않게 해 주세요.'],
  ],
  front: true,
});
