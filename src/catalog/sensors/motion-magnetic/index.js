import { motionMagnetic as definition } from './definition.js';
import { decodeMotionMagnetic as decode, mockMotionMagneticLine as mockLine } from './codec.js';
import magnetometer from '../magnetometer/index.js';
import { createLocationGuide } from '../shared/location-guide.js';

const guide = { ...magnetometer.guide,
  equipment: magnetometer.guide.equipment.map(item => item.id === 'microbit'
    ? { ...item, help: '보드 안의 가속도와 자기장 센서를 함께 사용해요. 외부 배선은 필요하지 않아요.' } : item),
  experimentGuide: createLocationGuide({ id: definition.id, name: '가속도·자기장', image: 'sensor-motion',
    alt: 'micro:bit 뒷면의 가속도·자기장 센서 위치', location: '보드 뒷면의 센서 위치를 확인해요.',
    tip: '가속도에는 중력이 포함돼요. 자기장 크기는 자석의 거리와 방향에 따라 달라져요.' }),
};
const uiCopy = {
  home: { sensorTitle: '가속도·자기장 함께 측정', sensorEquipment: 'micro:bit 내장 센서',
    sensorDescription: '움직임에 따른 가속도와 자기장 크기를 같은 시간 그래프에서 살펴봐요.' },
  guide: { receptionNote: '가속도 X·Y·Z·크기와 자기장 크기의 새 값을 확인하세요. 기록 시작을 누른 뒤부터 저장됩니다.' },
};
export default { definition, decode, mockLine, guide, uiCopy, preparation: magnetometer.preparation };
