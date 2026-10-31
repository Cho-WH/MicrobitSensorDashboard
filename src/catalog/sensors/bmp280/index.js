import { bmp280 as definition } from './definition.js';
import { decodeBmp280 as decode, mockBmp280Line as mockLine } from './codec.js';
import { guide } from './guide.js';
import { uiCopy } from './content.js';
export default { measurement: { defaultLiveRange: 'recent' }, definition, decode, mockLine, guide, uiCopy };
