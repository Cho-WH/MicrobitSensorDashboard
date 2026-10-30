import { getFirmwareArtifact } from '../../../device/firmware.js';
const artifact = getFirmwareArtifact('sensor-lab-ds18b20');

export const ds18b20 = {
  releaseStage: 'beta',
  id: 'ds18b20', version: 1, name: 'DS18B20 방수 온도 센서', boards: ['micro:bit-v2'], codecId: 'ds18b20-csv-v1',
  defaultVisibleChannelIds: ['temperature1C', 'temperature2C'],
  channels: [
    { id: 'temperature1C', name: '온도 1 (P1)', unit: '℃', quantity: 'temperature', quantityLabel: '온도', min: -55, max: 125,
      digits: 2, supported: true, calculable: true, color: '#d67b40' },
    { id: 'temperature2C', name: '온도 2 (P2)', unit: '℃', quantity: 'temperature', quantityLabel: '온도', min: -55, max: 125,
      digits: 2, supported: true, calculable: true, color: '#197f88' },
  ],
  firmware: { id: artifact.id, version: artifact.version, sha256: artifact.sha256, digestMode: artifact.digestMode,
    codecId: artifact.codecId, startCommand: artifact.startCommand, sampleIntervalMs: artifact.sampleIntervalMs, validation: 'hardware-unverified' },
  connectionPolicy: { firstReadingTimeoutMs: 5000, retryIntervalMs: 1000, retryLimit: 3,
    staleMs: 5000, confirmationCount: 3, confirmationSpanMs: 1000, requiredChannelIds: [],
    waitingMessage: '새 온도값을 기다리고 있습니다. 값은 약 1초마다 들어옵니다.',
    timeoutMessage: '새 온도값을 받지 못했어요. 전원을 끄고 3V·GND·P1/P2 배선과 센서 프로그램을 확인한 뒤 다시 연결하세요.' },
  defaultGraph: { xColumnId: 'receivedAt', yColumnId: 'temperature1C', type: 'line', connectGaps: false, view: 'measured' },
  preparation: ['방수 DS18B20 프로브를 1~2개 사용해요. 전원을 끄고 각 프로브의 VDD→3V, GND→GND, 데이터선은 P1·P2에 하나씩 연결하세요.',
    '선 색상만으로 연결하지 말고 구입한 프로브의 전원·접지·데이터 표시를 확인하세요.',
    '물에는 방수 처리된 프로브 부분만 넣고 보드와 연결부는 젖지 않게 두세요. 제품의 사용 온도·침수 범위를 따르세요.',
    '온도값은 약 1초마다 들어와요. 프로브를 옮긴 뒤 값이 안정될 때까지 기다리세요.'],
};
