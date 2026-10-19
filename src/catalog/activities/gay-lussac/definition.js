import { analysisTemplates, questions } from './content.js';
export const gayLussac = {
  id: 'gay-lussac', version: 1, name: '기체의 온도와 압력', sensorIds: ['bmp280'], requiredChannels: ['temperatureC', 'pressureHpa'],
  policyId: 'gay-lussac-v1', preparation: ['밀폐 용기와 수조를 준비하고 부피와 기체의 양이 일정하게 유지되는지 확인하세요.'],
  events: [{ type: 'placement', label: '장치 배치 완료' }, { type: 'heating-start', label: '가열 시작' }, { type: 'water-added', label: '물 추가' }],
  defaultGraph: { xColumnId: 'temperatureC', yColumnId: 'pressureHpa', type: 'scatter', connectGaps: false, view: 'measured' },
  analysisTemplates, questions,
};
