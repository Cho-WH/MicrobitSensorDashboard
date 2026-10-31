import { ds18b20 as definition } from './definition.js';
import { decodeDs18b20 as decode, mockDs18b20Line as mockLine } from './codec.js';
import { guide } from './guide.js';
import { uiCopy } from './content.js';
export default { measurement: { defaultLiveRange: 'recent' }, definition, decode, mockLine, guide, uiCopy };
