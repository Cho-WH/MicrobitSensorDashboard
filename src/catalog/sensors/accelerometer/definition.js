import { getFirmwareArtifact } from '../../../device/firmware.js';
const artifact = getFirmwareArtifact('accelerometer-uart');
export const accelerometer = {
  id: 'accelerometer', version: 1, name: '내장 가속도 센서', boards: ['micro:bit-v2'], codecId: 'accelerometer-csv-v1',
  defaultVisibleChannelIds: ['accelerationStrength'],
  channels: [
    { id: 'accelerationX', name: '가속도 X 성분', unit: 'mg', quantity: 'acceleration', digits: 0, supported: true, calculable: true, color: '#c46046' },
    { id: 'accelerationY', name: '가속도 Y 성분', unit: 'mg', quantity: 'acceleration', digits: 0, supported: true, calculable: true, color: '#4e8764' },
    { id: 'accelerationZ', name: '가속도 Z 성분', unit: 'mg', quantity: 'acceleration', digits: 0, supported: true, calculable: true, color: '#5e6ca8' },
    { id: 'accelerationStrength', name: '가속도 크기', unit: 'mg', quantity: 'acceleration', min: 0, digits: 0, supported: true, calculable: true, color: '#8062a2' },
  ],
  firmware: { id: artifact.id, version: artifact.version, sha256: artifact.sha256, digestMode: artifact.digestMode,
    codecId: artifact.codecId, startCommand: artifact.startCommand, sampleIntervalMs: artifact.sampleIntervalMs, validation: 'hardware-unverified' },
  connectionPolicy: { firstReadingTimeoutMs: 5000, retryIntervalMs: 1000, retryLimit: 3,
    staleMs: 5000, confirmationCount: 3, confirmationSpanMs: 1000,
    requiredChannelIds: ['accelerationX', 'accelerationY', 'accelerationZ', 'accelerationStrength'],
    waitingMessage: '새 가속도값을 기다리고 있습니다.',
    timeoutMessage: '새 가속도값을 받지 못했어요. 전원과 프로그램을 확인하고 다시 연결하세요.' },
  defaultGraph: { xColumnId: 'receivedAt', yColumnId: 'accelerationStrength', type: 'line', connectGaps: false, view: 'measured' },
  preparation: ['micro:bit V2의 내장 가속도 센서를 사용합니다. 외부 센서 배선이나 나침반 보정은 필요하지 않습니다.',
    '단위 mg는 중력가속도의 1/1000입니다. 중력의 영향이 포함되어 정지해 있어도 크기는 약 1000 mg입니다.',
    'X·Y·Z 성분과 크기를 함께 기록합니다. 보드를 안정적으로 잡고 움직임에 따른 변화를 비교하세요.'],
};
