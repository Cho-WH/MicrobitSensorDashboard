import { experimentGuide, equipment } from './content.js';
import { deviceIllustrations } from '../shared/device-illustrations.js';
/** @type {import('../../../guide/types.js').SensorGuide} */
export const guide = { experimentGuide,
  equipment,
  illustrations: deviceIllustrations,
  equipmentDescription: 'micro:bit V2와 데이터 전송이 가능한 USB 케이블, 배터리를 준비하세요.',
  afterConnect: [{ id: 'calibration', title: '나침반 보정을 준비해요',
    description: '연결 후 보정을 시작하거나 이번 보정을 생략하세요. 보정이 끝나면 자동으로 수신을 확인해요.',
    scope: 'attempt', kind: 'calibration', required: true,
    group: 'calibration', groupLabel: '보정·수신' }],
};
