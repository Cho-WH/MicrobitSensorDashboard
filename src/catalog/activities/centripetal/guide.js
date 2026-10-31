import { experimentGuide as sensorLocation } from '../../sensors/accelerometer/content.js';

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
        '배치를 확인한 뒤 측정 화면으로 이동해, 기록 시작 전에 자기장 신호를 살펴보세요.'],
      scope: 'activity', kind: 'manual', action: '배치 확인', required: true, group: 'placement', groupLabel: '회전 준비' },
  ],
  experimentGuide: { id: 'centripetal', version: 1, title: '회전 주기와 가속도를 함께 살펴봐요',
    pages: [location,
      { label: '신호 관찰', title: '같은 특징이 반복되는 지점을 찾아요', image: null, alt: '',
        caption: '자기장 크기와 가속도 크기를 같은 시간 구간에서 살펴보세요.',
        instructions: [
          ['기록 전에 신호를 확인해요', '이 안내를 닫고 측정 화면에서 느리게 2~3회전하며 반복되는 자기장 신호를 찾아보세요. 미리보기의 값은 저장되지 않아요.'],
          ['기록을 시작해요', '한 바퀴마다 반복되는 특징을 확인한 뒤 기록 시작을 누르세요. 여러 봉우리가 모두 한 바퀴를 뜻하는 것은 아니에요.'],
          ['같은 구간을 살펴봐요', '기록을 마치고 반복 신호의 간격과 같은 구간의 가속도 크기 변화를 함께 살펴보세요.'],
        ], caution: '회전 중에는 보드·배터리·자석을 만지지 마세요. 고정이 풀리거나 충돌할 것 같으면 회전을 멈추세요.' },
    ] },
};
