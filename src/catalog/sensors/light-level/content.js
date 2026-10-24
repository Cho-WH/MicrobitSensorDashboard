export const equipmentDescription = 'micro:bit V2와 USB 데이터 케이블, 전원을 준비하세요. 앞면 LED가 빛을 향하게 놓고 손이나 케이블이 가리지 않게 하세요.';
export const uiCopy = {
  home: { sensorTitle: '밝기 측정', sensorDescription: '내장 센서로 주변 밝기를 0~255의 상대값으로 비교하세요.' },
  guide: { receptionNote: '밝기는 0~255의 상대값이며 lux가 아니에요. 앞면 LED를 가리지 말고, 광원과의 거리·방향을 같게 두고 비교하세요.' },
};
export const equipment = [
  { id: 'microbit', name: 'micro:bit V2', help: '앞면 LED로 빛의 밝기를 감지해요. 0~255의 상대값이며 조도 단위인 lux가 아니에요. 값은 약 0.1초마다 들어와요. 외부 센서는 필요하지 않아요.' },
  { id: 'usb', name: 'USB 데이터 케이블', help: '프로그램 설치에는 Micro-B 데이터 케이블이 필요해요. 이미 올바른 프로그램이 설치되어 있다면 연결·수신 확인부터 진행할 수 있어요.' },
  { id: 'power', name: '전원 · USB 또는 배터리', help: '프로그램 설치 뒤에는 USB나 micro:bit용 배터리로 전원을 공급해요. 밝기를 비교할 때 보드와 광원의 거리·방향을 일정하게 유지하세요.' },
];
