import { getFirmwareArtifact } from '../../../device/firmware.js';
const artifact = getFirmwareArtifact('sensor-lab-temperature');
export const temperature = {
  id: 'temperature', version: 1, name: '내장 온도 센서', boards: ['micro:bit-v2'], codecId: 'temperature-csv-v1',
  defaultVisibleChannelIds: ['temperatureC'],
  channels: [
    { id: 'temperatureC', name: '보드 온도', unit: '℃', quantity: 'temperature', digits: 0, supported: true, calculable: true, color: '#d67b40' },
  ],
  firmware: { id: artifact.id, version: artifact.version, sha256: artifact.sha256, digestMode: artifact.digestMode,
    codecId: artifact.codecId, startCommand: artifact.startCommand, sampleIntervalMs: artifact.sampleIntervalMs, validation: 'hardware-unverified' },
  connectionPolicy: { firstReadingTimeoutMs: 5000, retryIntervalMs: 1000, retryLimit: 3,
    staleMs: 5000, confirmationCount: 3, confirmationSpanMs: 1000, requiredChannelIds: ['temperatureC'],
    waitingMessage: '새 보드 온도값을 기다리고 있습니다. 값은 약 1초마다 들어옵니다.',
    timeoutMessage: '새 보드 온도값을 받지 못했어요. 전원과 프로그램을 확인하고 다시 연결하세요.' },
  defaultGraph: { xColumnId: 'receivedAt', yColumnId: 'temperatureC', type: 'line', connectGaps: false, view: 'measured' },
  preparation: ['micro:bit V2의 내장 온도 센서를 사용합니다. 외부 센서 배선은 필요하지 않습니다.',
    '보드의 온도를 바탕으로 한 근삿값입니다. 주변 공기의 온도와 다를 수 있습니다.',
    '손이나 전원의 열이 값에 영향을 줄 수 있어요. 같은 조건에서 값의 변화를 비교하세요.'],
};
