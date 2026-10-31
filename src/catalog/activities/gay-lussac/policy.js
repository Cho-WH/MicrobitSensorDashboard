import { createAdditionalPolicy } from '../shared/additional-policy.js';
/** Activity rules stay outside generic recording and analysis. */
// Conditions and event kinds adapted from bme280@59c5c149 gay-lussac/measurement/conditions.js.
export const additionalConditions = [
  { id: 'container', label: '용기와 기체가 차지하는 부피' },
  { id: 'seal', label: '밀폐 상태와 뚜껑 개방 여부' },
  { id: 'sensor', label: '센서 위치·배선·측정 설정' },
];
export const activityPolicy = createAdditionalPolicy(additionalConditions);
