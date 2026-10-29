import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../../src/catalog/registry.js';
import { registry } from '../../src/catalog/modules.js';
import bmp from '../../src/catalog/sensors/bmp280/index.js';
import magnetic from '../../src/catalog/sensors/magnetometer/index.js';
import temperature from '../../src/catalog/sensors/temperature/index.js';
import gas from '../../src/catalog/activities/gay-lussac/index.js';
import { getExperiment, getSensorRuntime, getActivityPolicy, getMeasurementReadout, resolveExperiment } from '../../src/catalog/index.js';
import { composeGuideSteps, getGuideContent } from '../../src/guide/steps.js';
import { createGuideProgress } from '../../src/guide/progress.js';
import { parseRoute, routeUrl } from '../../src/app/routes.js';
import { getPreviewCopy, previewDefaults, getLabCopy, labDefaults } from '../../src/ui/lab-copy.js';

test('historical readouts resolve exact registered definitions and reject untrusted or invalid relationships', () => {
  const context = getExperiment('magnetometer');
  delete context.sensor.readout; // Previously saved definitions have no display relationship.
  assert.deepEqual(getMeasurementReadout(context), { primaryChannelId: 'magneticStrength', componentChannelIds: ['magneticX','magneticY','magneticZ'] });
  assert.equal(getMeasurementReadout(getExperiment('bmp280','gay-lussac')).primaryChannelId, 'pressureHpa');
  context.sensor.version = 999;
  context.sensor.readout = {primaryChannelId:'magneticStrength',componentChannelIds:['magneticX']};
  assert.deepEqual(getMeasurementReadout(context), {primaryChannelId:'magneticX',componentChannelIds:[]});
  const invalid = {...magnetic, definition:{...magnetic.definition,readout:{primaryChannelId:'magneticStrength',componentChannelIds:['missing']}}};
  assert.throws(() => createRegistry({sensors:[invalid],activities:[]}));
});

// A test-only module reuses an approved single-value firmware/codec identity.
// Its definition versions are independent of firmware versions.
function extraSensor(version = 1) {
  const definition = structuredClone(temperature.definition);
  Object.assign(definition, { id: 'test-built-in', version, name: '검사용 내장 센서',
    channels: [{ id: 'value', name: '값', unit: '', supported: true, calculable: true }], defaultVisibleChannelIds: ['value'],
    defaultGraph: { ...definition.defaultGraph, yColumnId: 'value' }, preparation: ['검사용 준비 안내'] });
  definition.connectionPolicy = { ...definition.connectionPolicy, requiredChannelIds: ['value'] };
  return { definition, decode: raw => ({ type: 'reading', values: { value: Number(raw) }, validity: { value: 'valid' } }), mockLine: () => '12',
    guide: { equipment: [{ id: 'board', name: '내장 센서 보드', help: '외부 배선 없이 준비합니다.' }], equipmentDescription: '내장 센서 보드를 준비하세요.' } };
}
const base = new URL('https://example.test/project/');

test('screen copy inherits defaults and only registered sensor/activity overrides', () => {
  const sensor = { ...bmp, uiCopy: { preview: { eyebrow: '센서 안내', start: '센서 준비' }, measurement:{start:'측정값 보관'}, guideSteps:{programTitle:'설치 준비'}, analysis:{title:'측정값 분석'} } };
  const activity = { ...gas, uiCopy: { preview: { eyebrow: '활동 안내' }, measurement:{start:'활동 기록'}, reflection:{title:'나의 설명'} } };
  const modules = createRegistry({ sensors: [sensor], activities: [activity] });
  const context = getExperiment('bmp280', 'gay-lussac', modules);
  assert.deepEqual(getPreviewCopy(context, modules), { ...previewDefaults, eyebrow: '활동 안내', start: '센서 준비' });
  assert.equal(getPreviewCopy({ ...context, activity: null }, modules).eyebrow, '센서 안내');
  context.sensor.uiCopy = { preview: { browse: '외부 문구' } };
  assert.equal(getPreviewCopy(context, modules).browse, previewDefaults.browse);
  const copy = getPreviewCopy(context, modules); copy.start = '변경';
  assert.equal(getPreviewCopy(context, modules).start, '센서 준비');
  const all = getLabCopy(context, modules);
  assert.equal(all.measurement.start, '활동 기록');
  assert.equal(all.measurement.finish, labDefaults.measurement.finish);
  assert.equal(all.analysis.title, '측정값 분석');
  assert.equal(all.reflection.title, '나의 설명');
  all.measurement.start = '사본 수정';
  assert.equal(getLabCopy(context, modules).measurement.start, '활동 기록');
  const originalSteps = composeGuideSteps(getExperiment('bmp280', 'gay-lussac'));
  const steps = composeGuideSteps(context, modules);
  assert.equal(steps.find(step => step.id === 'program').title, '설치 준비');
  const rules = steps => steps.map(({id,kind,scope,required,quickConfirm})=>({id,kind,scope,required,quickConfirm}));
  assert.deepEqual(rules(steps), rules(originalSteps));
  const plain=extraSensor(), plainModules=createRegistry({sensors:[plain],activities:[]});
  assert.deepEqual(getLabCopy({sensor:plain.definition},plainModules),labDefaults);
  context.activity.version++;
  assert.equal(getLabCopy(context, modules).measurement.start, '측정값 보관');
  context.sensor.version++;
  assert.deepEqual(getLabCopy(context, modules), labDefaults);
});

test('one additional module supplies catalog, route, decoder and preparation without changing common code', () => {
  const extra = extraSensor(), modules = createRegistry({ sensors: [bmp, magnetic, extra], activities: [gas] });
  assert.equal(modules.catalog.sensors.length, 3);
  const route = parseRoute(new URL('sensors/test-built-in/', base), base, modules), context = route.context;
  assert.equal(context.sensor.id, extra.definition.id);
  assert.equal(routeUrl(context, 'measure', { base, modules }).pathname, '/project/sensors/test-built-in/');
  const runtime = getSensorRuntime(context, modules);
  assert.equal(runtime.decode(runtime.mockLine(100)).values.value, 12);
  const content = getGuideContent(context, modules);
  assert.equal(content.equipment[0].id, 'board'); assert.equal(content.viewer, null);
  assert.deepEqual(content.wiring, []); assert.deepEqual(content.calibrationInstructions, []);
  assert.deepEqual(composeGuideSteps(context, modules).map(step => step.id), ['equipment', 'program', 'connection', 'reception']);
  const progress = createGuideProgress(context, { modules });
  progress.confirm('equipment'); progress.confirm('program'); assert.equal(progress.getState().ready, false);
  progress.setAttempt(1); progress.observe({ attemptId: 1, connected: true, receptionReady: true, mock: true });
  assert.equal(progress.getState().ready, true);
  progress.setAttempt(2); assert.equal(progress.getState().ready, false);
  assert.equal(getActivityPolicy(context, modules), undefined);
  const roundTrip = JSON.parse(JSON.stringify(context));
  assert.deepEqual(roundTrip, context); assert.equal('guide' in context.sensor, false);
});

test('activity module registration supplies its route, preparation and policy without controller branches', () => {
  const extra = extraSensor(), activity = { definition: { ...gas.definition, id: 'test-activity', sensorIds: [extra.definition.id], requiredChannels: ['value'], policyId: 'test-policy', defaultGraph: extra.definition.defaultGraph, readout: {primaryChannelId:'value',componentChannelIds:[]} },
    guide: { equipment: [], afterReception: [{ id: 'position', group: 'position', groupLabel: '위치', title: '위치를 확인해요', description: '실험 위치를 유지하세요.', kind: 'manual', scope: 'activity', required: true }] },
    policy: { additionalConditions: [] } };
  const modules = createRegistry({ sensors: [extra], activities: [activity] });
  const { context } = parseRoute(new URL('activities/test-activity/', base), base, modules);
  assert.equal(composeGuideSteps(context, modules).at(-1).id, 'position');
  assert.equal(getActivityPolicy(context, modules), activity.policy);
});

test('general entry selects newest definition while explicit old versions retain their own runtime and guide', () => {
  const old = extraSensor(1), latest = extraSensor(2);
  old.guide.equipmentDescription = '첫 버전'; latest.guide.equipmentDescription = '둘째 버전';
  const modules = createRegistry({ sensors: [old, latest], activities: [] });
  assert.equal(modules.catalog.sensors.length, 1); assert.equal(modules.entryRoutes.length, 1);
  assert.equal(getExperiment(old.definition.id, null, modules).sensor.version, 2);
  const context = resolveExperiment({ sensor: { id: old.definition.id, version: 1 } }, null, modules.definitions);
  assert.equal(getSensorRuntime(context, modules).decode, old.decode);
  assert.equal(composeGuideSteps(context, modules)[0].description, '첫 버전');
  context.sensor.version = 3;
  assert.throws(() => getSensorRuntime(context, modules), { code: 'unsupported-sensor-runtime' });
  assert.deepEqual(composeGuideSteps(context, modules), []);
  assert.deepEqual(getGuideContent(context, modules).equipment, []);
});

test('saved metadata cannot inject resources or substitute an unregistered activity version', () => {
  const context = getExperiment('bmp280', 'gay-lussac');
  context.sensor.guide = { viewer: { url: 'https://foreign.invalid/viewer' } };
  context.activity.guide = { afterReception: [{id:'placement', image: { src: 'https://foreign.invalid/image' }}] };
  assert.equal(getGuideContent(context).viewer.url, bmp.guide.viewer.url);
  assert.equal(composeGuideSteps(context).find(step=>step.image).image.src, gas.guide.afterReception.find(step=>step.image).image.src);
  context.activity.version++;
  assert.equal(getGuideContent(context).experimentGuide, null);
  assert.equal(getActivityPolicy(context), undefined);
  assert.deepEqual(composeGuideSteps(context), []);
  assert.equal(createGuideProgress(context).getState().ready, false);
  const content = getGuideContent(getExperiment('bmp280')); content.equipment.length = 0;
  assert.ok(getGuideContent(getExperiment('bmp280')).equipment.length > 0);
  assert.deepEqual(new Set(registry.catalog.sensors.map(sensor => sensor.id)), new Set(['bmp280', 'magnetometer', 'temperature', 'light-level', 'accelerometer', 'ds18b20']));
});

test('registry rejects duplicate versions, missing runtime and conflicting guide steps before app startup', () => {
  assert.throws(() => createRegistry({ sensors: [bmp, bmp], activities: [] }), /중복된 등록/);
  assert.throws(() => createRegistry({ sensors: [{ ...bmp, decode: undefined }], activities: [] }), /실행·안내 누락/);
  assert.throws(() => createRegistry({ sensors: [magnetic], activities: [gas] }), /활동 센서 누락/);
  const collision = { ...bmp, guide: { ...bmp.guide, beforeProgram: [{ ...bmp.guide.beforeProgram[0], id: 'program' }] } };
  assert.throws(() => createRegistry({ sensors: [collision], activities: [] }), /중복된 준비 단계/);
  const activity = { ...gas, guide: { ...gas.guide, afterReception: [{ ...gas.guide.afterReception[1], id: 'vcc' }] } };
  assert.throws(() => createRegistry({ sensors: [bmp], activities: [activity] }), /중복된 준비 단계/);
  const shortcut = { ...magnetic, guide: { ...magnetic.guide, afterConnect: [{ ...magnetic.guide.afterConnect[0], quickConfirm: true }] } };
  assert.throws(() => createRegistry({ sensors: [shortcut], activities: [] }), /중복된 준비 단계/);
});
