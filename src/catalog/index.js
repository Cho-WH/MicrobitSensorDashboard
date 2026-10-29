import { registry } from './modules.js';
import { getFirmwareIdentity } from '../device/firmware.js';
import { validateChannels, validateGraph } from '../domain/contracts.js';
export const catalog = registry.catalog;

/** Device runtime always resolves registered definitions, never executable imported metadata. */
export function getSensorRuntime(context, modules = registry) {
  const module = modules.getSensor(context?.sensor), definition = module?.definition;
  const activity = context?.activity;
  let firmware;
  try { firmware = getFirmwareIdentity(context?.firmware?.id, context?.firmware?.version); } catch { /* Unsupported saved firmware. */ }
  // Historical UART identities remain metadata-only compatibility references.
  const compatibleActivity = !activity || Boolean(modules.getActivity(activity, context?.sensor));
  if (!definition || module.recording === false || (context.sensor.codecId != null && context.sensor.codecId !== definition.codecId)
    || (context.firmware?.id !== definition.firmware.id && context.firmware?.id !== definition.id + '-uart') || !firmware || firmware.version !== context.firmware.version || firmware.codecId !== definition.codecId
    || (context.firmware?.codecId != null && context.firmware.codecId !== definition.codecId) || !compatibleActivity
    || !Array.isArray(context.channels) || context.channels.length !== definition.channels.length
    || context.channels.some((channel, index) => channel.id !== definition.channels[index].id)) {
    throw Object.assign(new Error('이 센서·프로그램 버전으로 장치를 연결할 수 없습니다. 새 실험을 준비하세요.'), { code: 'unsupported-sensor-runtime' });
  }
  return { definition: structuredClone({ ...definition, firmware: { ...definition.firmware,
    id: firmware.id, version: firmware.version, sha256: firmware.sha256, startCommand: firmware.startCommand,
    sampleIntervalMs: firmware.sampleIntervalMs, stale: firmware.stale } }), decode: module.decode, mockLine: module.mockLine, preparation: module.preparation };
}
export const getSensorPreparation = context => registry.getSensor(context?.sensor)?.preparation;
// Display relationships come from exact registered definitions, not graph axes
// or matching quantity names. Historical/unknown channels remain usable as numbers.
export function getMeasurementReadout(context, modules = registry) {
  const channels = context?.channels ?? [];
  const definition = modules.getActivity(context?.activity, context?.sensor)?.definition.readout
    ?? modules.getSensor(context?.sensor)?.definition.readout;
  const primary = channels.find(channel => channel.id === definition?.primaryChannelId) ?? channels[0];
  return { primaryChannelId: primary?.id,
    componentChannelIds: (definition?.componentChannelIds ?? []).filter(id => id !== primary?.id
      && channels.some(channel => channel.id === id && channel.quantity === primary?.quantity && channel.unit === primary?.unit)) };
}
export function getActivityPolicy(context, modules = registry) {
  return modules.getActivity(context?.activity, context?.sensor)?.policy;
}
export const getActivityMemoPresets = context => registry.getActivity(context?.activity, context?.sensor)?.definition.memoPresets ?? [];

export const genericQuestions = [
  { id: 'observation', title: '관찰한 관계', question: '자료에서 어떤 관계를 발견했나요? 수치나 그래프를 근거로 설명하세요.' },
  { id: 'reasoning', title: '해석과 근거', question: '관찰한 관계를 어떻게 설명할 수 있나요?' },
  { id: 'limitations', title: '조건과 한계', question: '측정 조건과 자료의 한계는 무엇인가요? 다시 확인할 점을 적으세요.' },
];
export function getExperiment(sensorId = 'bmp280', activityId = null, modules = registry) {
  const sensor = modules.catalog.sensors.find(item => item.id === sensorId);
  const activity = activityId ? modules.catalog.activities.find(item => item.id === activityId) : null;
  if (!sensor || (activityId && !activity)) throw new Error('센서 또는 활동을 찾을 수 없습니다.');
  return resolveExperiment({ sensor: { id: sensorId, version: sensor.version }, activity: activity ? { id: activityId, version: activity.version } : null }, null, modules.definitions);
}
/** Resolve trusted definitions without creating a Run, accessing devices, or writing storage. */
export function resolveExperiment(route, classConfig = null, registry = defaultDefinitions) {
  const sensorRef = route.sensor ?? { id: route.sensorId ?? 'bmp280', version: 1 };
  const activityRef = route.activity ?? (route.activityId ? { id: route.activityId, version: 1 } : null);
  const sensor = registry.sensors.find(s => s.id === sensorRef.id && s.version === sensorRef.version);
  const activity = activityRef ? registry.activities.find(a => a.id === activityRef.id && a.version === activityRef.version) : null;
  if (!sensor || (activityRef && !activity)) throw new Error('센서 또는 활동의 지정 버전을 찾을 수 없습니다.');
  // Activity names describe the same sensor channels; IDs, units and limits stay intact.
  const channels = validateChannels(sensor.channels.map(channel => ({ ...channel,
    name: activity?.channelNames?.[channel.id] ?? channel.name })));
  if (activity && (!activity.sensorIds.includes(sensor.id) || activity.requiredChannels.some(id => !channels.some(c => c.id === id && c.supported !== false)))) throw new Error('활동에 필요한 센서 항목이 없습니다.');
  if (classConfig) {
    const allowed = ['v','sensor','activity','title','instructions','presentation'];
    if (Object.keys(classConfig).some(k => !allowed.includes(k)) || classConfig.v !== 2
      || classConfig.sensor?.id !== sensor.id || classConfig.sensor?.version !== sensor.version
      || (classConfig.activity?.id ?? null) !== (activity?.id ?? null) || (classConfig.activity?.version ?? null) !== (activity?.version ?? null)) throw new Error('수업 설정과 선택한 센서·활동이 일치하지 않습니다.');
    if ((classConfig.title?.length ?? 0) > 120 || (classConfig.instructions?.length ?? 0) > 800) throw new Error('수업 제목이나 안내가 너무 깁니다.');
    if (classConfig.presentation && Object.keys(classConfig.presentation).some(k => !['graph','visibleChannelIds'].includes(k))) throw new Error('허용되지 않은 표시 설정입니다.');
    if (classConfig.presentation?.visibleChannelIds?.some(id => !channels.some(c => c.id === id))) throw new Error('표시할 측정 항목을 확인하세요.');
  }
  const context = { sensor, activity, channels, firmware: sensor.firmware, setup: {}, classConfig, connectionPolicy: sensor.connectionPolicy,
    defaultGraph: classConfig?.presentation?.graph ?? activity?.defaultGraph ?? sensor.defaultGraph,
    analysisTemplates: activity?.analysisTemplates ?? [], questions: activity?.questions ?? genericQuestions,
    preparation: [...sensor.preparation, ...(activity?.preparation ?? [])] };
  validateGraph(context.defaultGraph, [], [], context);
  return structuredClone(context);
}
const defaultDefinitions = registry.definitions;
