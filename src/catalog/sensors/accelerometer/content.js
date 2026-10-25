export const equipmentDescription = 'micro:bit V2와 USB 데이터 케이블, 전원을 준비하세요. 보드를 단단히 놓거나 잡고 케이블이 당기지 않게 하세요. 자세를 바꾸면 X·Y·Z 성분이 달라져요.';
export const uiCopy = {
  home: { sensorTitle: '가속도 측정', sensorDescription: '내장 센서로 보드의 기울기와 움직임에 따른 가속도 변화를 살펴보세요.' },
  guide: { receptionNote: '중력을 포함한 가속도예요. 가만히 놓아도 크기는 약 9.8 m/s²이며, 보드의 자세를 바꾸면 X·Y·Z 성분이 달라져요.' },
};
export const equipment = [
  { id: 'microbit', name: 'micro:bit V2', help: 'X·Y·Z 성분과 크기를 m/s²로 기록해요. 중력을 포함하므로 가만히 놓으면 크기는 약 9.8 m/s²예요. 측정 화면에서 g로 보기를 켜면 약 1 g로 표시돼요. 각 축의 측정 범위는 ±8 g이며 약 0.1초 간격으로 측정해요. 고속 진동 측정용은 아니에요.' },
  { id: 'usb', name: 'USB 데이터 케이블', help: '프로그램 설치에는 Micro-B 데이터 케이블이 필요해요. 이미 올바른 프로그램이 설치되어 있다면 연결·수신 확인부터 진행할 수 있어요.' },
  { id: 'power', name: '전원 · USB 또는 배터리', help: '프로그램 설치 뒤에는 USB나 micro:bit용 배터리로 전원을 공급해요. 보드를 움직일 때 전원이 끊기지 않도록 케이블과 배터리를 함께 고정하세요.' },
];
