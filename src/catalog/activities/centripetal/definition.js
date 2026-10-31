import { motionMagnetic } from '../../sensors/motion-magnetic/definition.js';
export const centripetal = {
  id: 'centripetal', version: 2, name: '구심가속도 탐구', releaseStage: 'beta',
  sensorIds: ['motion-magnetic'], requiredChannels: motionMagnetic.channels.map(channel => channel.id),
  policyId: 'centripetal-v1', readout: motionMagnetic.readout,
  preparation: ['수평 회전판에 보드와 배터리를 단단히 고정하고 회전축에서 센서 칩까지의 반지름을 재세요.',
    '고정 자석과 회전부가 닿지 않게 배치하세요. 측정 화면의 미리보기에서 한 바퀴마다 반복되는 신호를 확인한 뒤 기록을 시작하세요.'],
  channelNames: {},
  memoPresets: [{ id: 'rotation-start', text: '회전 시작' }, { id: 'speed-changed', text: '회전 속도 변경' },
    { id: 'rotation-stop', text: '회전 멈춤' }],
  defaultGraph: motionMagnetic.defaultGraph, analysisTemplates: [],
  questions: [
    { id: 'observation', title: '회전의 기준', question: '자기장 그래프에서 한 바퀴의 기준을 무엇으로 정했나요?' },
    { id: 'reasoning', title: '같은 구간의 변화', question: '자기장 신호가 반복되는 간격과 같은 구간의 가속도 크기는 어떻게 변했나요?' },
    { id: 'limitations', title: '관찰의 한계', question: '보드의 기울기·진동이나 자석의 위치가 관찰한 신호에 어떤 영향을 줄 수 있을까요?' },
  ],
};
