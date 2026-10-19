import { magnetometer as definition } from './definition.js';
import { decodeMagnetometer as decode, mockMagnetometerLine as mockLine } from './codec.js';
import { guide } from './guide.js';
import { createPreparationSession as createSession, createMockPreparation as createMock } from './preparation.js';
import { createPreparationView as createView } from './preparation-view.js';
export default { definition, decode, mockLine, guide, preparation: { createSession, createMock, createView } };
