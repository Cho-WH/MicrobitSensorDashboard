import { gayLussac as definition } from './definition.js';
import { activityPolicy as policy } from './policy.js';
import { guide } from './guide.js';
import { uiCopy } from './content.js';
import { tour } from './tour.js';
export default { measurement: { continuousOnly: true, points: true, pointTableChannelIds: ['temperatureC', 'pressureHpa'] }, definition, policy, guide, uiCopy, tour };
