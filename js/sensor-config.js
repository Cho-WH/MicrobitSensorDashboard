export const colorPalette = [
  '#38bdf8',
  '#f97316',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#eab308',
  '#14b8a6',
  '#ec4899',
  '#84cc16',
  '#6366f1',
]

export const sensorConfig = {
  appTitle: 'Microbit Sensor Dashboard',
  appBadge: 'Vanilla build',
  deviceLabel: 'micro:bit',
  startCommand: 'magnet',
  sampleIntervalMs: 100,
  historyLimit: 300,
  csvFilename: 'magnetometer-log.csv',
  chartTitle: '실시간 센서 데이터',
  emptyMessage: '데이터를 수신하면 그래프가 표시됩니다.',
  fieldSelectorTitle: '표시할 항목 선택',
  fieldSelectorHelp: '최소 하나 이상 선택해야 합니다.',
  defaultVisibleFields: ['strength'],
  fields: [
    {
      key: 'x',
      label: 'X 축',
      unit: 'uT',
      digits: 2,
      color: colorPalette[1],
      mock: { min: -20, max: 20 },
    },
    {
      key: 'y',
      label: 'Y 축',
      unit: 'uT',
      digits: 2,
      color: colorPalette[2],
      mock: { min: -20, max: 20 },
    },
    {
      key: 'z',
      label: 'Z 축',
      unit: 'uT',
      digits: 2,
      color: colorPalette[3],
      mock: { min: -20, max: 20 },
    },
    {
      key: 'strength',
      label: 'Strength',
      unit: 'uT',
      digits: 1,
      color: colorPalette[0],
      mock: { min: 35, max: 65 },
    },
  ],
  connectionText: {
    waitingForFirstSample:
      '첫 데이터 수신을 기다리는 중입니다.\n' +
      'micro:bit LED에 보정 화면이 보이면 모든 방향으로 천천히 돌려 보정을 완료하세요. A/B 버튼을 누른 채 연결했다면 보정 없이 곧 측정이 시작됩니다.',
    firstSampleTimeout:
      '아직 측정 데이터가 도착하지 않았습니다.\n' +
      'micro:bit LED의 나침반 보정을 완료하세요. 보정 화면이 아니거나 계속 멈춰 있으면 연결 해제 후 다시 연결하세요.',
  },
}
