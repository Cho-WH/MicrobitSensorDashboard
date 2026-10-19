// Activity preparation adapted from Cho-WH/bme280@59c5c149 G/guide/steps.js.
import { equipment, setupImage, experimentGuide } from './content.js';
/** @type {import('../../../guide/types.js').ActivityGuide} */
export const guide = {
  equipment, setupImage, experimentGuide,
  afterReception: [
    { id: 'battery', title: 'USB 없이도 값이 들어오나요?', description: '배터리를 연결하고 USB를 분리한 다음 확인을 시작하세요. 이때부터 새로 들어오는 값으로 확인합니다.',
      scope: 'attempt', kind: 'battery', action: 'USB를 분리했어요 · 새 수신 확인', required: true, group: 'battery', groupLabel: '배터리' },
    { id: 'placement', title: '장치와 용기를 배치해요',
      description: 'micro:bit·확장 보드·배터리는 용기 바닥에, 센서는 중간 높이의 공기 중에 놓으세요. 센서가 벽이나 부품에 닿지 않도록 하고 연결선도 용기 안에 넣어 밀폐합니다. 물은 용기 바깥 수조에만 넣고, 용기를 외부에서 고정하세요.',
      scope: 'activity', kind: 'manual', action: '용기를 배치했어요', required: true, group: 'placement', groupLabel: '용기 배치' },
  ],
};
