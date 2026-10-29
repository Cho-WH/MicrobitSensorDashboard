import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuideProgress } from '../../src/guide/progress.js';
import { composeGuideSteps } from '../../src/guide/steps.js';
import { getExperiment } from '../../src/catalog/index.js';
import { createExperimentGuidePreferences } from '../../src/guide/experiment-guide-preferences.js';

const bmp = (activity = null) => getExperiment('bmp280', activity);
const magnet = () => getExperiment('magnetometer');
function fixture(context = bmp(), initialNow = 10000) {
  let now = initialNow;
  const progress = createGuideProgress(context, { now: () => now });
  progress.setAttempt('a');
  const observe = (override = {}) => progress.observe({ attemptId: 'a', connected: true, receptionReady: true, receivedAt: now, calibration: 'unknown', ...override });
  return { progress, observe, setNow: value => now = value };
}
const step = (progress, id) => progress.getState().steps.find(item => item.id === id);

test('fresh reception permits measurement without fabricating preparation confirmations', () => {
  for (const context of [bmp(), bmp('gay-lussac'), magnet(), ...['temperature','light-level','accelerometer','ds18b20'].map(id=>getExperiment(id))]) {
    const { progress, observe } = fixture(context);
    assert.equal(progress.getState().canMeasure, false);
    observe({ receptionReady: false }); assert.equal(progress.getState().canMeasure, false);
    observe();
    const state = progress.getState();
    assert.equal(state.canMeasure, true); assert.equal(state.ready, false);
    assert.deepEqual(state.confirmations, {}); assert.equal(state.setup.firmware, null);
    assert.equal(state.setup.calibration, 'unknown'); assert.equal(state.setup.battery.observedAt, null);
    observe({ receptionReady: false }); assert.equal(progress.getState().canMeasure, false);
    observe({ connected: false }); assert.equal(progress.getState().canMeasure, false);
    observe(); progress.setAttempt('b'); assert.equal(progress.getState().canMeasure, false);
    assert.equal(observe(), false); assert.equal(progress.getState().canMeasure, false);
  }
});

test('sensor and activity compose only their preparation steps', () => {
  assert.ok(composeGuideSteps(bmp()).some(step => step.id === 'vcc'));
  assert.ok(!composeGuideSteps(bmp()).some(step => ['battery', 'placement', 'calibration'].includes(step.id)));
  assert.ok(composeGuideSteps(bmp('gay-lussac')).some(step => step.id === 'battery'));
  assert.ok(composeGuideSteps(magnet()).some(step => step.id === 'calibration'));
  assert.ok(!composeGuideSteps(magnet()).some(step => ['vcc', 'scl', 'battery'].includes(step.id)));
});

test('manual preparation and USB installation never substitute for live Bluetooth reception', () => {
  const context = bmp(), { progress, observe } = fixture(context);
  for (const item of progress.getState().steps) progress.confirm(item.id);
  assert.equal(step(progress, 'program').evidence, 'user-confirmed');
  assert.equal(progress.getState().observations.installedThisSession, null);
  assert.equal(progress.getState().ready, false);
  assert.equal(progress.confirm('connection'), false); assert.equal(progress.confirm('reception'), false);
  observe({ connected: false, receptionReady: false, firmwareInstalled: context.firmware });
  assert.equal(step(progress, 'program').evidence, 'device-observed');
  assert.equal(progress.getState().ready, false);
  observe(); assert.equal(progress.getState().ready, true);
  observe({ firmwareInstalled: false, programmerState: { status: 'flashing' } });
  assert.equal(step(progress, 'program').complete, false);
  assert.equal(progress.getState().ready, false);
});

test('existing firmware can be confirmed without claiming a new install or USB connection', () => {
  const { progress, observe } = fixture();
  for (const item of progress.getState().steps.filter(step => step.required)) progress.confirm(item.id);
  observe();
  assert.equal(progress.confirm('usb'), false); assert.equal(Object.hasOwn(progress.getState().confirmations, 'usb'), false); assert.equal(progress.getState().ready, true);
  assert.equal(progress.getState().observations.programUserConfirmed, true);
  assert.equal(progress.getState().setup.firmware, null);
});

test('a fast failed or cancelled install invalidates old proof once even if rendering skipped active states', () => {
  for (const status of ['error', 'cancelled']) {
    const context = bmp(), { progress, observe } = fixture(context);
    progress.confirm('program'); observe({ firmwareInstalled: context.firmware });
    assert.equal(step(progress, 'program').evidence, 'device-observed');
    observe({ firmwareInstalled: false, programmerState: { status } });
    assert.equal(step(progress, 'program').complete, false, `${status} retained old confirmation`);
    assert.equal(progress.getState().observations.installedThisSession, null);
    progress.confirm('program');
    observe({ firmwareInstalled: false, programmerState: { status } });
    observe({ firmwareInstalled: false, programmerState: { status } });
    assert.equal(step(progress, 'program').evidence, 'user-confirmed', `${status} erased a new confirmation`);
    observe({ firmwareInstalled: false, programmerState: { status: 'ready' } });
    observe({ firmwareInstalled: false, programmerState: { status } });
    assert.equal(step(progress, 'program').complete, false, `${status} did not invalidate the next attempt`);
  }
});

test('numeric reception does not confirm calibration; attempt changes invalidate live facts only', () => {
  const { progress, observe } = fixture(magnet());
  progress.confirm('equipment'); progress.confirm('program'); observe();
  assert.equal(step(progress, 'calibration').complete, false);
  assert.equal(progress.getState().ready, false);
  progress.confirm('calibration'); observe();
  assert.equal(progress.getState().observations.calibration, 'user-confirmed');
  assert.equal(progress.getState().ready, true);
  observe({ calibration: 'device-reported' }); progress.confirm('calibration');
  assert.equal(progress.getState().observations.calibration, 'device-reported');
  progress.setAttempt('b'); assert.equal(progress.getState().observations.calibration, 'unknown');
  assert.equal(step(progress, 'equipment').complete, true); assert.equal(step(progress, 'program').complete, true);
  assert.equal(progress.getState().ready, false);
  assert.equal(observe({ calibration: 'device-reported' }), false);
  assert.equal(progress.getState().observations.calibration, 'unknown');
});

test('context changes retain only applicable confirmations and never restore old setup readiness', () => {
  const { progress, observe } = fixture(bmp('gay-lussac'));
  for (const item of progress.getState().steps) progress.confirm(item.id);
  observe(); progress.setContext(bmp());
  assert.equal(step(progress, 'vcc').complete, true); assert.equal(step(progress, 'program').complete, true);
  progress.setContext(bmp('gay-lussac')); assert.equal(step(progress, 'placement').complete, false);
  const changedFirmware = bmp('gay-lussac'); changedFirmware.firmware.version++;
  progress.setContext(changedFirmware); assert.equal(step(progress, 'vcc').complete, true); assert.equal(step(progress, 'program').complete, false);
  assert.equal(step(progress, 'reception').complete, false);
  progress.setContext(magnet()); assert.equal(step(progress, 'equipment').complete, false);
  const old = { ...bmp(), setup: { confirmations: { equipment: true, program: true }, calibration: 'device-reported' } };
  const reopened = createGuideProgress(old); assert.equal(reopened.getState().ready, false); assert.equal(step(reopened, 'program').complete, false);
});

test('battery confirmation requires multiple distinct fresh receipts spanning the policy window', () => {
  const { progress, observe, setNow } = fixture(bmp('gay-lussac'));
  observe(); assert.equal(progress.beginBatteryCheck(), true);
  observe({ receivedAt: 9999 }); observe({ receivedAt: 10000 });
  assert.equal(progress.getState().observations.battery.count, 0);
  for (const receivedAt of [10100, 10100, 10300, 10500, 10700, 10900]) observe({ receivedAt });
  assert.equal(step(progress, 'battery').complete, false);
  observe({ receivedAt: 11100 }); assert.equal(step(progress, 'battery').complete, true);
  assert.equal(progress.getState().observations.battery.count, 6);
  observe({ receptionReady: false, receivedAt: 11100 }); assert.equal(step(progress, 'battery').complete, false);
  setNow(13000); progress.beginBatteryCheck(); observe({ receivedAt: 12900 });
  assert.equal(progress.getState().observations.battery.count, 0);
  observe({ connected: false }); assert.equal(progress.getState().observations.battery.startedAt, null);
});

test('preparation snapshots are isolated and simulated evidence is explicit', () => {
  const { progress, observe } = fixture(); progress.confirm('vcc'); observe({ mock: true });
  const state = progress.getState(); state.confirmations.vcc.at = 0; state.steps[0].complete = true;
  assert.equal(progress.getState().confirmations.vcc.at, 10000);
  assert.equal(step(progress, 'connection').evidence, 'simulated'); assert.equal(progress.getState().setup.simulated, true);
});

test('activity guide preferences are versioned, optional, and independent of preparation proof', () => {
  const data=new Map(), storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const first=createExperimentGuidePreferences('activity',1,()=>storage);
  assert.equal(first.shouldShow(),true);first.markSeen();assert.equal(first.shouldShow(),false);
  first.setSuppressed(true);
  assert.equal(createExperimentGuidePreferences('activity',1,()=>storage).shouldShow(),false);
  assert.equal(createExperimentGuidePreferences('activity',2,()=>storage).shouldShow(),true);
  const blocked=createExperimentGuidePreferences('activity',1,()=>{throw new Error('storage blocked');});
  blocked.setSuppressed(true);assert.equal(blocked.isSuppressed(),true);
  blocked.setSuppressed(false);assert.equal(blocked.shouldShow(),true);
  assert.equal(fixture().progress.getState().ready,false);
});

test('explicit skipped calibration remains distinct from completion while current reception permits recording',()=>{
  const progress=createGuideProgress(magnet());progress.setAttempt('skip');
  progress.observe({attemptId:'skip',connected:true,receptionReady:true,calibration:'skipped',mock:true});
  const state=progress.getState();assert.equal(state.canMeasure,true);assert.equal(state.steps.find(step=>step.id==='calibration').complete,false);
  assert.equal(state.setup.calibration,'skipped');assert.equal(state.setup.simulated,true);
  progress.setAttempt('next');assert.equal(progress.getState().setup.calibration,'unknown');assert.equal(progress.getState().canMeasure,false);
});
