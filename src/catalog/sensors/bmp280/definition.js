import { getFirmwareArtifact } from '../../../device/firmware.js';
const artifact = getFirmwareArtifact('sensor-lab-bmp280');
export const bmp280 = {
  id: 'bmp280', version: 1, name: 'BMP280 · 온도와 기압 측정', boards: ['micro:bit-v2'], codecId: 'bmp280-csv-v1',
  defaultVisibleChannelIds: ['temperatureC','pressureHpa'],
  readout: { primaryChannelId: 'temperatureC', componentChannelIds: [] },
  channels: [
    { id: 'temperatureC', name: '온도', unit: '℃', quantity: 'temperature', min: -40, max: 85, digits: 2, supported: true, calculable: true, color: '#d67b40' },
    { id: 'pressureHpa', name: '기압', unit: 'hPa', quantity: 'pressure', min: 300, max: 1100, digits: 2, supported: true, calculable: true, color: '#197f88' },
  ],
  firmware: { id: artifact.id, version: artifact.version, sha256: artifact.sha256, digestMode: artifact.digestMode,
    codecId: artifact.codecId, startCommand: artifact.startCommand, validation: 'hardware-unverified' },
  connectionPolicy: { firstReadingTimeoutMs: 3000, retryIntervalMs: 300, retryLimit: 5,
    staleMs: 5000, confirmationCount: 3, confirmationSpanMs: 1000, requiredChannelIds: ['temperatureC', 'pressureHpa'],
    waitingMessage: '새 온도·기압값을 기다리고 있습니다.',
    timeoutMessage: '새 온도·기압값을 받지 못했어요. 프로그램과 배선을 확인하고 다시 연결하세요.' },
  defaultGraph: { xColumnId: 'receivedAt', yColumnId: 'temperatureC', type: 'line', connectGaps: false, view: 'measured' },
  preparation: ['BMP280의 전원·접지·I²C 배선을 확인하세요.', 'BMP280용 프로그램을 설치한 micro:bit의 수신값을 확인하세요.'],
};
