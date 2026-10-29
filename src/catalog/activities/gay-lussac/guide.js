// Activity preparation adapted from Cho-WH/bme280@59c5c149 G/guide/steps.js.
import { equipment, setupImage, experimentGuide } from './content.js';
/** @type {import('../../../guide/types.js').ActivityGuide} */
export const guide = {
  equipment, experimentGuide,
  afterReception: [
    { id: 'battery', title: 'USB 없이도 값이 들어오나요?', description: '용기를 닫기 전에 배터리 전원으로 새 값이 계속 들어오는지 확인하세요.',
      instructions: ['배터리를 연결한 뒤 USB 케이블을 분리하세요.', '아래 수신 검사 버튼을 누르세요. 누른 뒤 새로 들어오는 값으로 확인해요.'],
      scope: 'attempt', kind: 'battery', action: 'USB를 분리했어요 · 새 수신 확인', required: true, group: 'battery', groupLabel: '배터리' },
    { id: 'placement', title: '장치와 용기를 배치해요', image: setupImage,
      description: '밀폐한 공기의 부피와 양이 일정하도록 장치를 배치하세요.',
      instructions: ['micro:bit·확장 보드·배터리는 용기 바닥에 놓으세요.', '센서는 중간 높이의 공기 중에 두고 벽이나 부품에 닿지 않게 하세요.', '연결선을 모두 용기 안에 넣고 뚜껑을 닫으세요.', '물은 용기 바깥 수조에만 넣고 용기를 외부에서 고정하세요.'],
      scope: 'activity', kind: 'manual', action: '용기 배치 확인', required: true, group: 'placement', groupLabel: '용기 배치' },
  ],
};
