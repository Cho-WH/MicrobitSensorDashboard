import { experimentGuide as sensorLocation } from '../../sensors/accelerometer/content.js';
import { experimentGuide } from './content.js';

const location = sensorLocation.pages[0];

/** @type {import('../../../guide/types.js').ActivityGuide} */
export const guide = {
  equipment: [
    { id: 'turntable', name: '수평 회전판', help: '보드와 배터리를 고정할 수 있고 천천히 돌릴 수 있는 회전판을 준비하세요.' },
    { id: 'magnet', name: '자석과 고정대', help: '자석은 회전판 바깥에 고정하세요. 보드·배터리·케이블이 자석이나 고정대와 닿지 않게 배치하세요.' },
    { id: 'ruler', name: '자와 고정 도구', help: '회전축부터 가속도 센서 칩까지의 거리를 재세요. 보드와 배터리가 움직이거나 떨어지지 않게 고정하세요.' },
  ],
  afterReception: [
    { id: 'battery', title: '배터리로 새 값을 확인해요',
      description: '회전하기 전에 배터리를 연결하고 USB 케이블을 분리하세요.',
      instructions: ['USB를 분리한 뒤에도 가속도·자기장값이 새로 들어오는지 확인하세요.'],
      scope: 'attempt', kind: 'battery', action: 'USB를 분리했어요 · 새 수신 확인', required: true,
      group: 'battery', groupLabel: '배터리' },
    { id: 'placement', title: '회전판에 고정하고 반지름을 재요',
      image: location.image ? { src: location.image, alt: location.alt, caption: location.caption } : undefined,
      description: '반지름은 회전축부터 가속도 센서 칩까지의 거리예요.',
      instructions: ['그림에서 센서 칩 위치를 확인하고, 회전축부터 칩까지의 거리를 재어 메모하세요.',
        '보드와 배터리를 수평 회전판에 단단히 고정하고, 자석과 회전부가 닿지 않게 배치하세요.',
        '배치를 확인한 뒤 측정 화면에서 반지름을 입력하고 기록을 시작하세요.'],
      scope: 'activity', kind: 'manual', action: '배치 확인', required: true, group: 'placement', groupLabel: '회전 준비' },
  ],
  experimentGuide,
};
