import { mlx90393 as definition } from './definition.js';
import { decodeMlx90393 as decode, mockMlx90393Line as mockLine } from './codec.js';
import { guide } from './guide.js';
import { createPreparationSession as createSession, createMockPreparation as createMock } from './preparation.js';
import { createSettingsView } from './settings-view.js';
import { configureContext } from './settings.js';
export default { definition, decode, mockLine, guide,
  preparation: { createSession, createMock, createSettingsView, configureContext },
  uiCopy: { home: { sensorTitle: '자기장(외장) 측정', sensorEquipment: 'MLX90393 · 외장 센서',
    sensorDescription: '코일과 자석의 자기장을 세 방향으로 비교해요.' } },
};
