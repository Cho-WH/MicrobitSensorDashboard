import { validateChannels } from '../domain/contracts.js';
/**
 * @typedef {{definition:Omit<typeof import('./sensors/bmp280/definition.js').bmp280|typeof import('./sensors/magnetometer/definition.js').magnetometer,'channels'> & {channels:import('../domain/columns.js').Channel[]},
 * decode:typeof import('./sensors/bmp280/codec.js').decodeBmp280|typeof import('./sensors/magnetometer/codec.js').decodeMagnetometer,
 * mockLine:(time:number)=>string,guide:import('../guide/types.js').SensorGuide,
 * preparation?:import('../device/preparation-types.js').SensorPreparation,recording?:boolean,
 * uiCopy?:import('./ui-copy.js').LabCopy}} SensorModule
 * @typedef {{definition:typeof import('./activities/gay-lussac/definition.js').gayLussac,
 * policy?:typeof import('./activities/gay-lussac/policy.js').activityPolicy,guide:import('../guide/types.js').ActivityGuide,
 * uiCopy?:import('./ui-copy.js').LabCopy}} ActivityModule
 */
// Keep the former USB step ID reserved so historical setup entries cannot acquire a new meaning.
const commonIds = ['equipment', 'usb', 'program', 'connection', 'reception', 'summary', 'quick'];
function validateSteps(steps, ids = new Set(commonIds)) {
  for (const step of steps) {
    if (!step.id || ids.has(step.id) || !step.group || !step.groupLabel
      || !['manual', 'calibration', 'battery'].includes(step.kind)
      || (step.quickConfirm && (step.kind !== 'manual' || step.scope !== 'sensor'))
      || (step.kind === 'calibration' && step.id !== 'calibration')
      || (step.kind === 'battery' && step.id !== 'battery')) throw new Error(`잘못되거나 중복된 준비 단계: ${step.id}`);
    ids.add(step.id);
  }
  return ids;
}
/** Static local modules only; imported files never register executable code.
 * @param {{sensors:SensorModule[],activities:ActivityModule[]}} modules
 */
export function createRegistry({ sensors, activities }) {
  function checkDefinitions(items) {
    const seen = new Set();
    for (const { definition } of items) {
      const key = `${definition.id}@${definition.version}`;
      if (!/^[a-z][a-z0-9-]*$/.test(definition.id) || !Number.isInteger(definition.version) || definition.version < 1 || seen.has(key)) throw new Error(`잘못되거나 중복된 등록: ${key}`);
      seen.add(key);
    }
  }
  checkDefinitions(sensors); checkDefinitions(activities);
  for (const module of sensors) {
    validateChannels(module.definition.channels);
    if (typeof module.decode !== 'function' || typeof module.mockLine !== 'function' || !module.guide?.equipmentDescription) throw new Error(`센서 실행·안내 누락: ${module.definition.id}`);
    validateSteps([...(module.guide.beforeProgram ?? []), ...(module.guide.afterConnect ?? [])]);
  }
  for (const activity of activities) {
    if (!activity.guide || !activity.definition.sensorIds.length || (activity.definition.policyId && !activity.policy)) throw new Error(`활동 실행·안내 누락: ${activity.definition.id}`);
    for (const sensorId of activity.definition.sensorIds) {
      const compatible = sensors.filter(module => module.definition.id === sensorId);
      if (!compatible.length) throw new Error(`활동 센서 누락: ${sensorId}`);
      for (const sensor of compatible) {
        if (activity.definition.requiredChannels.some(id => !sensor.definition.channels.some(channel => channel.id === id && channel.supported !== false))) throw new Error(`활동 채널 누락: ${sensorId}`);
        const ids = validateSteps([...(sensor.guide.beforeProgram ?? []), ...(sensor.guide.afterConnect ?? [])]);
        validateSteps(activity.guide.afterReception, ids);
      }
    }
  }
  const latest = items => items.filter(item => !items.some(other => other.definition.id === item.definition.id && other.definition.version > item.definition.version));
  const currentSensors = latest(sensors), currentActivities = latest(activities);
  const find = (items, ref) => items.find(item => item.definition.id === ref?.id && item.definition.version === ref?.version);
  return {
    catalog: { sensors: currentSensors.map(item => item.definition), activities: currentActivities.map(item => item.definition) },
    definitions: { sensors: sensors.map(item => item.definition), activities: activities.map(item => item.definition) },
    getSensor: ref => /** @type {SensorModule|undefined} */ (find(sensors, ref)),
    getActivity: (ref, sensorRef) => {
      const activity = /** @type {ActivityModule|undefined} */ (find(activities, ref));
      return find(sensors, sensorRef) && activity?.definition.sensorIds.includes(sensorRef.id) ? activity : undefined;
    },
    entryRoutes: Object.freeze([
      ...currentSensors.map(({ definition }) => ({ path: `sensors/${definition.id}/`, sensorId: definition.id, activityId: null })),
      ...currentActivities.map(({ definition }) => ({ path: `activities/${definition.id}/`, sensorId: definition.sensorIds[0], activityId: definition.id })),
    ]),
  };
}
