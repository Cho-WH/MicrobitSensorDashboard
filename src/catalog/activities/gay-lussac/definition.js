import { analysisTemplates, questions } from './content.js';
export const gayLussac = {
  id: 'gay-lussac', version: 1, name: '기체의 온도와 압력', sensorIds: ['bmp280'], requiredChannels: ['temperatureC', 'pressureHpa'],
  policyId: 'gay-lussac-v1', preparation: ['공기가 새지 않는 용기를 준비하고, 실험하는 동안 기체의 부피와 양을 일정하게 유지하세요.'],
  channelNames: { temperatureC: '센서 온도', pressureHpa: '용기 안 압력' },
  readout: { primaryChannelId: 'pressureHpa', componentChannelIds: [] },
  events: [{ type: 'placement', label: '용기 배치 확인' }, { type: 'heating-start', label: '가열 시작 기록' },
    { type: 'water-added', label: '물 추가 기록', allowPaused: true },
    { type: 'device-change', label: '장치 변화 기록', allowPaused: true,
      kinds: [{ id: 'moved', label: '장치 이동' }, { id: 'opened', label: '뚜껑 열림' }, { id: 'sealed', label: '다시 밀폐' }] }],
  defaultGraph: { xColumnId: 'temperatureC', yColumnId: 'pressureHpa', type: 'scatter', connectGaps: false, view: 'measured' },
  analysisTemplates, questions,
};
