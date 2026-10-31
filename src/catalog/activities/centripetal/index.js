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
    activityDescription: '회전판의 가속도와 자기장 신호를 함께 기록하고 반복되는 변화를 살펴봐요.' },
  preview: { eyebrow: '구심가속도 탐구', question: '자기장 신호로 한 바퀴의 시간을 어떻게 잴 수 있을까요?',
    description: '같은 구간의 자기장과 가속도를 기록하며 회전 운동을 탐구하세요.' },
  guide: { receptionNote: '회전하기 전에 가속도와 자기장의 새 값을 확인하세요. 가만히 두면 가속도 크기는 약 9.8 m/s²예요.' },
};
export default { measurement: { continuousOnly: true, points: false }, definition, guide, policy, uiCopy, tour };
