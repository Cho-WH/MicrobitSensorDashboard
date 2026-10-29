import { analysisTemplates, questions } from './content.js';
export const gayLussac = {
  id: 'gay-lussac', version: 1, name: '기체의 온도와 압력', sensorIds: ['bmp280'], requiredChannels: ['temperatureC', 'pressureHpa'],
  policyId: 'gay-lussac-v1', preparation: ['공기가 새지 않는 용기를 준비하고, 실험하는 동안 기체의 부피와 양을 일정하게 유지하세요.'],
  channelNames: { temperatureC: '센서 온도', pressureHpa: '용기 안 압력' },
  readout: { primaryChannelId: 'pressureHpa', componentChannelIds: [] },
  memoPresets: [{ id: 'water-added', text: '물 추가' }, { id: 'device-moved', text: '장치 이동' },
    { id: 'lid-opened', text: '뚜껑 열림' }, { id: 'lid-sealed', text: '다시 밀폐' }],
  defaultGraph: { xColumnId: 'temperatureC', yColumnId: 'pressureHpa', type: 'scatter', connectGaps: false, view: 'measured' },
  analysisTemplates, questions,
};
