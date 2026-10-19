// Four fields and the start command come from firmware/examples/magnetometer.js.
import { getFirmwareArtifact } from '../../../device/firmware.js';
const artifact = getFirmwareArtifact('magnetometer-uart');
export const magnetometer = {
  id: 'magnetometer', version: 1, name: '내장 자기장 센서', boards: ['micro:bit-v2'], codecId: 'magnetometer-csv-v1',
  defaultVisibleChannelIds: ['magneticStrength'],
  channels: [
    { id: 'magneticX', name: '자기장 X 성분', unit: 'µT', quantity: 'magnetic-flux-density', digits: 1, supported: true, calculable: true, color: '#c46046' },
    { id: 'magneticY', name: '자기장 Y 성분', unit: 'µT', quantity: 'magnetic-flux-density', digits: 1, supported: true, calculable: true, color: '#4e8764' },
    { id: 'magneticZ', name: '자기장 Z 성분', unit: 'µT', quantity: 'magnetic-flux-density', digits: 1, supported: true, calculable: true, color: '#5e6ca8' },
    { id: 'magneticStrength', name: '자기장 크기', unit: 'µT', quantity: 'magnetic-flux-density', min: 0, digits: 1, supported: true, calculable: true, color: '#8062a2' },
  ],
  firmware: { id: artifact.id, version: artifact.version, sha256: artifact.sha256, digestMode: artifact.digestMode,
    codecId: artifact.codecId, startCommand: artifact.startCommand, validation: 'hardware-unverified' },
  connectionPolicy: { firstReadingTimeoutMs: 120000, retryIntervalMs: 0, retryLimit: 1,
    staleMs: 5000, confirmationCount: 3, confirmationSpanMs: 1000,
    requiredChannelIds: ['magneticX', 'magneticY', 'magneticZ', 'magneticStrength'],
    waitingMessage: 'micro:bit 화면의 안내에 따라 나침반을 보정하세요. 첫 수신값을 최대 2분 동안 기다립니다.',
    timeoutMessage: '새 자기장값을 받지 못했어요. 나침반 보정·전원·프로그램을 확인하고 다시 연결하세요.' },
  defaultGraph: { xColumnId: 'receivedAt', yColumnId: 'magneticStrength', type: 'line', connectGaps: false, view: 'measured' },
  preparation: ['micro:bit V2의 내장 자기장 센서를 사용합니다. 외부 센서 배선은 필요하지 않습니다.',
    '연결 후 micro:bit의 나침반 보정 안내를 따라 주세요. 보정을 건너뛰는 A/B 버튼 조작은 사용하지 않습니다.',
    '새 숫자의 수신은 보정 완료의 증거가 아닙니다. 실제 보정 수행 여부를 확인하세요.'],
};
