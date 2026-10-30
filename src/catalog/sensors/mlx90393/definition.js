import { getFirmwareArtifact } from '../../../device/firmware.js';
const artifact = getFirmwareArtifact('sensor-lab-mlx90393');
const channel = (id, name, color) => ({ id, name, color, unit: 'µT', quantity: 'magnetic-flux-density', quantityLabel: '자기장', digits: 1, supported: true, calculable: true });
const components = [channel('magneticX', '자기장 X 성분', '#c46046'), channel('magneticY', '자기장 Y 성분', '#4e8764'),
  channel('magneticZ', '자기장 Z 성분', '#5e6ca8'), channel('magneticStrength', '자기장 크기', '#8062a2')];
export const mlx90393 = {
  releaseStage: 'beta',
  id: 'mlx90393', version: 1, name: 'MLX90393 외장 자기장 센서', boards: ['micro:bit-v2'], codecId: 'mlx90393-v1',
  defaultVisibleChannelIds: ['magneticStrength'],
  readout: { primaryChannelId: 'magneticStrength', componentChannelIds: ['magneticX', 'magneticY', 'magneticZ'] },
  channels: components,
  firmware: { id: artifact.id, version: artifact.version, sha256: artifact.sha256, digestMode: artifact.digestMode,
    codecId: artifact.codecId, startCommand: artifact.startCommand, sampleIntervalMs: artifact.sampleIntervalMs, validation: 'hardware-unverified' },
  connectionPolicy: { firstReadingTimeoutMs: 5000, retryIntervalMs: 0, retryLimit: 1, staleMs: 2000, confirmationCount: 3, confirmationSpanMs: 300,
    requiredChannelIds: ['magneticX', 'magneticY', 'magneticZ', 'magneticStrength'], waitingMessage: '새 자기장값을 기다리고 있어요.',
    timeoutMessage: '새 자기장값이 없어요. 배선·전원을 확인하고 자석을 센서에서 떨어뜨려 보세요.' },
  defaultGraph: { xColumnId: 'receivedAt', yColumnId: 'magneticStrength', type: 'line', connectGaps: false, view: 'measured' },
  preparation: ['micro:bit V2와 Adafruit MLX90393, 확장 보드, STEMMA QT–개별 암 소켓 케이블을 준비하세요.',
    '3V·GND·P20(SDA)·P19(SCL)에 연결합니다. 보드와 센서의 단자 표기를 확인하세요.',
    '작은 변화 모드로 시작하세요. 측정 범위를 넘으면 강한 자석 모드로 새 실험을 준비하세요.'],
};
