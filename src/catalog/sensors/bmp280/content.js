// Preparation copy adapted from G/ui/action-help-content.js and G/guide/steps.js.
export const uiCopy = {
  home: { sensorTitle: '온도·기압 측정', sensorDescription: '외장 BMP280 센서로 온도와 기압의 변화를 함께 살펴보세요.' },
  guide: { receptionNote: '온도와 기압을 함께 확인해요. 센서가 손이나 물체에 닿지 않게 두고 값이 안정될 때까지 기다리세요. 기압 단위는 hPa예요.' },
};
export const equipment = [
  { id: 'microbit', name: 'micro:bit V2', help: '센서의 측정값을 컴퓨터로 보내는 장치예요. 이 안내는 micro:bit V2를 기준으로 합니다.' },
  { id: 'sensor', name: 'BMP280 센서', help: '온도와 기압을 측정해요. 습도는 이 센서의 측정 항목이 아니에요.' },
  { id: 'board', name: '확장 보드', help: 'micro:bit에 센서 연결선을 꽂을 수 있게 해 주는 보드예요. 그림에서는 sensor:bit를 사용합니다.' },
  { id: 'wires', name: '연결선 4개', help: '확장 보드와 센서의 단자 모양에 맞는 선을 준비하세요. 수는 핀, 암은 핀이 들어가는 구멍이에요.' },
  { id: 'usb', name: 'USB 데이터 케이블', help: 'micro:bit의 Micro-B 단자에 맞는 데이터 전송용 케이블이 필요해요. 충전 전용 케이블로는 프로그램을 설치할 수 없어요.' },
];
export const wiring = [
  { id: 'vcc', board: 'V · 3.3V', sensor: 'VCC', role: '전원', description: 'USB와 배터리를 분리한 상태에서 연결하세요. 확장 보드의 V와 센서의 VCC를 연결합니다. 전압을 선택할 수 있다면 3.3V로 맞추세요.' },
  { id: 'gnd', board: 'G · GND', sensor: 'GND', role: '접지', description: '확장 보드의 G와 센서의 GND를 연결하세요. 전원 선과 접지 선이 서로 바뀌지 않았는지 확인합니다.' },
  { id: 'scl', board: 'CL · SCL · P19', sensor: 'SCL', role: '클록', description: '확장 보드의 CL과 센서의 SCL을 연결하세요. 보드에 따라 SCL 또는 P19로 표시됩니다. 정보를 주고받는 시점을 맞추는 선이에요.' },
  { id: 'sda', board: 'DA · SDA · P20', sensor: 'SDA', role: '데이터', description: '확장 보드의 DA와 센서의 SDA를 연결하세요. 보드에 따라 SDA 또는 P20으로 표시됩니다. 네 선의 양 끝이 올바른 단자에 꽂혔는지 확인하세요.' },
];
export const cableHelp = 'sensor:bit의 왼쪽 소켓에는 수–암, 오른쪽 핀에는 암–암 케이블을 연결해요. 센서 쪽은 모두 암이에요. 보드가 다르면 단자 이름을 배선표와 비교하세요.';
