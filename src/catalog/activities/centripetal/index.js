import { centripetal as definition } from './definition.js';
import { guide } from './guide.js';
import { tour } from './tour.js';
import { createAdditionalPolicy } from '../shared/additional-policy.js';
const policy = createAdditionalPolicy([
  { id: 'radius', label: '회전 반지름과 보드의 장착 위치' },
  { id: 'magnet', label: '자석의 위치와 방향' },
  { id: 'level', label: '회전판의 수평과 보드·배터리 고정' },
]);
const uiCopy = {
  home: { activityEyebrow: '구심가속도 탐구', activityTitle: '회전 주기와 가속도는 어떤 관계일까?',
    curriculum: '고등학교 · 역학과 에너지', curriculumDetail: '2022 개정 · 벡터의 합성 · 원운동',
    activityDescription: '원판을 회전시키며 가속도 센서 측정값과 회전 주기를 기록해요. 각 방법으로 구한 구심가속도를 비교해요.' },
  preview: { eyebrow: '구심가속도 탐구', question: '가속도 센서 측정값과 회전 주기로 구한 구심가속도는 얼마나 일치할까요?',
    description: '가속도 센서를 고정한 원판을 회전시키며 센서 측정값과 회전 주기를 기록하세요. 같은 회전 구간에서 두 방법으로 구심가속도를 구하고, 결과의 차이를 살펴보세요.' },
  guide: { receptionNote: '회전하기 전에 가속도와 자기장의 새 값을 확인하세요. 가만히 두면 가속도 크기는 약 9.8 m/s²예요.' },
};
export default { measurement: { continuousOnly: true, points: false }, definition, guide, policy, uiCopy, tour };
