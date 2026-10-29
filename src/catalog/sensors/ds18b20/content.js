export const probeIllustration = {
  src: new URL('../../../../public/assets/devices/posters/ds18b20.png', import.meta.url).href,
  alt: '금속 탐침과 세 가닥 연결선이 있는 DS18B20 방수 프로브',
};
export const uiCopy = {
  home: { sensorTitle: '온도(방수 프로브) 측정', sensorEquipment: 'DS18B20 · 외장 센서',
    sensorDescription: '프로브 1~2개로 물의 온도 변화와 두 곳의 온도를 비교해요.' },
  guide: { receptionNote: 'P1은 온도 1, P2는 온도 2예요. 연결하지 않은 쪽은 빈 값으로 남아요. 약 1초마다 들어오는 값이 안정될 때까지 기다리세요.' },
};
export const equipmentDescription = 'micro:bit V2와 DS18B20 프로브 키트 1~2개, 확장 보드, USB 데이터 케이블을 준비하세요.';
export const equipment = [
  { id: 'microbit', name: 'micro:bit V2', help: '프로브의 온도값을 읽어 컴퓨터나 모바일 기기로 보내요. 내장 온도 센서와는 별개예요.' },
  { id: 'sensor', name: 'DS18B20 방수 프로브 1~2개', help: '전원(VDD·VCC), 접지(GND), 데이터(DQ·DATA) 선이 있는 3선 제품을 사용해요. 하나만 연결해도 측정할 수 있어요. 선 색상과 방수 범위는 제품 설명을 확인하세요.' },
  { id: 'board', name: '확장 보드', help: '그림은 sensor:bit V1.6 기준이에요. P1·P2의 신호(S), 전원(V), 접지(G) 단자를 사용합니다. 전압 선택이 가능한 보드는 3.3V로 맞추세요.' },
  { id: 'wires', name: '터미널 모듈·연결선', help: '프로브마다 키트에 포함된 나사 단자대와 암–암 점퍼선 세 가닥을 사용해요. 모듈의 DAT·VCC·GND를 보드의 신호·전원·접지에 각각 연결하고, 노출된 선이 서로 닿지 않게 고정하세요. 별도 풀업 저항은 추가하지 않아요.' },
  { id: 'usb', name: 'USB 데이터 케이블', help: '처음에는 Micro-B 데이터 케이블로 센서 프로그램을 설치해요. 센서 실험실 프로그램이 이미 있다면 무선으로 바꿀 수 있어요. 측정 중에는 USB 또는 micro:bit용 배터리로 전원을 공급하세요.' },
];
export { wiring } from './wiring.js';
export const experimentGuide = {
  id: 'ds18b20-probe', version: 1, title: '방수 프로브로 온도 측정하기',
  label: '측정 안내', buttonLabel: '측정 안내', placement: /** @type {const} */ ('measurement-tabs'),
  pages: [{ label: '프로브 사용', title: '프로브를 놓고 값이 안정되면 기록하세요',
    image: probeIllustration.src, alt: probeIllustration.alt, caption: '전원·접지: 3V·GND 공통 / 데이터: 온도 1 → P1 · 온도 2 → P2',
    instructions: [
      ['프로브 놓기', '프로브 1~2개를 측정할 곳에 놓으세요. 물에는 제품에서 방수로 지정한 부분만 넣고, 두 곳을 비교할 때는 같은 깊이를 유지하세요.'],
      ['새 온도 확인', '온도 1은 P1, 온도 2는 P2예요. 하나만 쓸 때는 다른 쪽이 빈 값으로 표시돼요. 약 1초마다 들어오는 값이 안정될 때까지 기다리세요.'],
      ['기록하기', '시간에 따른 변화는 연속 측정으로, 서로 다른 조건의 온도 비교는 한 점씩 측정으로 기록하세요. 변인과 실험 메모를 함께 남길 수 있어요.'],
    ], caution: '보드와 연결부는 물 밖에 두세요. 프로브·케이블의 사용 온도와 침수 범위는 구입한 제품의 설명을 따르세요.' }],
};
