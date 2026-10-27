import { getFirmwareArtifact } from '../../../device/firmware.js';
const artifact = getFirmwareArtifact('sensor-lab-light-level');
export const lightLevel = {
  id: 'light-level', version: 1, name: '내장 밝기(조도) 센서', boards: ['micro:bit-v2'], codecId: 'light-level-csv-v1',
  defaultVisibleChannelIds: ['lightLevel'],
  channels: [
    { id: 'lightLevel', name: '밝기', unit: '상대값', quantity: 'relative-light', min: 0, max: 255, digits: 0, supported: true, calculable: true, color: '#997010' },
  ],
  firmware: { id: artifact.id, version: artifact.version, sha256: artifact.sha256, digestMode: artifact.digestMode,
    codecId: artifact.codecId, startCommand: artifact.startCommand, sampleIntervalMs: artifact.sampleIntervalMs, validation: 'hardware-unverified' },
  connectionPolicy: { firstReadingTimeoutMs: 5000, retryIntervalMs: 1000, retryLimit: 3,
    staleMs: 5000, confirmationCount: 3, confirmationSpanMs: 1000, requiredChannelIds: ['lightLevel'],
    waitingMessage: '새 밝기값을 기다리고 있습니다.',
    timeoutMessage: '새 밝기값을 받지 못했어요. 전원과 프로그램을 확인하고 다시 연결하세요.' },
  defaultGraph: { xColumnId: 'receivedAt', yColumnId: 'lightLevel', type: 'line', connectGaps: false, view: 'measured' },
  preparation: ['micro:bit V2 앞면의 LED를 이용해 밝기를 측정합니다. 외부 센서 배선은 필요하지 않습니다.',
    '밝기는 0부터 255까지의 상대값입니다. 값이 클수록 더 밝습니다.',
    '보드의 방향과 광원까지의 거리를 맞추고, 손이나 물체가 앞면을 가리지 않도록 하세요.'],
};
