import { equipment, calibrationInstructions } from './content.js';
/** @type {import('../../../guide/types.js').SensorGuide} */
export const guide = {
  equipment, calibrationInstructions,
  equipmentDescription: 'micro:bit V2와 데이터 전송이 가능한 USB 케이블, 배터리를 준비하세요.',
  afterConnect: [{ id: 'calibration', title: '나침반 보정을 확인해요',
    description: '시작 명령 뒤 micro:bit 화면의 안내에 따라 보정하세요. 화면에서 보정이 끝난 것을 직접 확인한 뒤 아래 버튼을 누르세요. 숫자가 수신되는 것만으로 보정 완료를 확인할 수는 없어요.',
    scope: 'attempt', kind: 'calibration', action: '화면에서 보정 완료를 확인했어요', required: true,
    group: 'calibration', groupLabel: '보정·수신' }],
};
