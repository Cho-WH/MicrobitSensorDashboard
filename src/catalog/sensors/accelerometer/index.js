import { accelerometer as definition } from './definition.js';
import { decodeAccelerometer as decode, mockAccelerometerLine as mockLine } from './codec.js';
import { guide } from './guide.js';
import { uiCopy } from './content.js';
import { accelerometer as legacyDefinition } from './definition-v1.js';
import { decodeDecimalChannels } from '../shared/decimal-codec.js';
const legacyNote = '이전 기록은 mg 단위로 보관돼요. m/s²로 측정하려면 새 실험을 준비해 주세요.';
// Historical mg files remain resolvable for analysis, but cannot mix new SI readings into an old run.
export const legacyAccelerometer = {
  definition: legacyDefinition, recording: false,
  decode: (raw, metadata) => decodeDecimalChannels(raw, legacyDefinition.channels, metadata),
  mockLine,
  guide: { ...guide, equipment: guide.equipment.map(item => item.id === 'microbit' ? { ...item, help: legacyNote } : item) },
  uiCopy: { ...uiCopy, guide: { ...uiCopy.guide, receptionNote: legacyNote } },
};
export default { definition, decode, mockLine, guide, uiCopy };
