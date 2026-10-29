import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, restoreSession } from '../../src/measurement/session.js';
import { openRunStore } from '../../src/data/run-store.js';
import { fixture, reading, timers, utc } from './storage-support.mjs';
import { readFile } from 'node:fs/promises';
import { getExperiment, getActivityPolicy } from '../../src/catalog/index.js';
import { canResumeImportedRun } from '../../src/data/files/recording-source.js';
import { parseExperimentJson, buildExperimentJson } from '../../src/data/files/json.js';
import { createWorkspace } from '../../src/analysis/workspace.js';

test('preview, repeated start, pause/resume and repeated finish preserve exactly the accepted source values', async () => {
  const { store } = await fixture(), session = createSession({ store });
  session.acceptInput(reading(0)); assert.equal(store.getState().sampleCount, 0);
  assert.equal(store.getEvents().length, 0);
  assert.equal(session.start(), true); assert.equal(session.start(), false);
  session.acceptInput(reading(100)); await session.pause();
  session.acceptInput(reading(200)); assert.equal(store.getState().sampleCount, 1);
  assert.equal(session.resume(), true); session.acceptInput(reading(300));
  await Promise.all([session.finish(), session.finish()]); session.acceptInput(reading(400));
  assert.deepEqual(store.getSamples().map(s => s.receivedAt), [utc + 100, utc + 300]);
  assert.equal(store.getEvents(100).filter(e => e.type === 'measurement-end').length, 1);
  assert.equal(session.getState().state, 'ended');
  await store.close();
});

test('finishing closes the gate before a delayed or failed save and does not duplicate its event on retry', async () => {
  const { store, repository } = await fixture(), session = createSession({ store });
  session.start(); session.acceptInput(reading(0));
  const commit = repository.commitBatch;
  repository.commitBatch = async () => { throw new Error('quota'); };
  const finish = session.finish(); session.acceptInput(reading(100));
  await assert.rejects(finish, /quota/);
  assert.equal(session.getState().state, 'finishing');
  session.acceptInput(reading(200));
  assert.equal(store.getState().sampleCount, 1);
  assert.equal(store.getState().status, 'error');
  repository.commitBatch = commit; await session.finish();
  assert.equal(store.getEvents(100).filter(e => e.type === 'measurement-end').length, 1);
  await store.close();
});

test('retry completes a partially admitted finish without losing the closed input gate or duplicating its event', async () => {
  const { store } = await fixture(); let failOnce = true;
  const session = createSession({ store: { ...store, updateRun(patch) {
    if (patch.status === 'complete' && failOnce) { failOnce = false; throw new Error('admission failed'); }
    return store.updateRun(patch);
  } } });
  session.start(); session.acceptInput(reading(0));
  await assert.rejects(session.finish(), /admission failed/);
  session.acceptInput(reading(100));
  assert.equal(store.getState().sampleCount, 1);
  assert.equal(session.getState().state, 'finishing');
  await session.finish();
  assert.equal(store.getRun().status, 'complete');
  assert.equal(store.getEvents(100).filter(e => e.type === 'measurement-end').length, 1);
  await store.close();
});

test('storage failure pauses subsequent input without clearing already collected data', async () => {
  const { store, repository } = await fixture(), session = createSession({ store });
  session.start(); session.acceptInput(reading(0));
  const commit = repository.commitBatch;
  repository.commitBatch = async () => { throw new Error('quota'); };
  await assert.rejects(store.flush(), /quota/);
  session.acceptInput(reading(100));
  assert.equal(session.getState().state, 'paused');
  assert.equal(store.getState().sampleCount, 1);
  assert.throws(() => session.resume(), /저장 오류/);
  repository.commitBatch = commit; await store.flush(); session.resume(); session.acceptInput(reading(200));
  assert.equal(store.getState().sampleCount, 2); await store.close();
});

test('restoration marks unfinished recording interrupted once and never auto-records', async () => {
  const { store, repository, lockManager } = await fixture(), session = createSession({ store });
  session.start(); session.acceptInput(reading(0)); await store.close();
  for (let i = 0; i < 2; i++) {
    const reopened = await openRunStore({ repository, id: 'test', locks: lockManager, timers });
    assert.equal(restoreSession({ store: reopened, now: () => utc + 1000 }), null);
    assert.equal(reopened.getRun().status, 'interrupted');
    assert.equal(reopened.getEvents().filter(e => e.type === 'interrupted').length, 1);
    const paused = createSession({ store: reopened }); paused.acceptInput(reading(2000));
    assert.equal(reopened.getState().sampleCount, 1); await reopened.close();
  }
});

test('memos use the opening time, preserve input and follow recording lifetime', async () => {
  const { store } = await fixture(), session = createSession({ store });
  assert.equal(session.addMemo('before'), false);
  session.start();
  assert.throws(() => session.addMemo(' '));
  assert.throws(() => session.addMemo('a'.repeat(501)));
  assert.equal(session.addMemo(' observation ', utc + 123), true);
  await session.pause();
  assert.equal(session.addMemo('paused', utc + 456), true);
  await session.finish();
  assert.equal(session.addMemo('after'), false);
  const memos = store.getEvents().filter(event => event.type === 'note');
  assert.deepEqual(memos.map(event => [event.receivedAt,event.payload.note]), [[utc+123,'observation'],[utc+456,'paused']]);
  await store.close();
});

test('additional measurement requires saved data and explicit same-configuration confirmation', async () => {
  const { store } = await fixture(), session = createSession({ store });
  session.start(); session.acceptInput(reading(0)); await session.finish();
  assert.throws(() => session.startAdditional({}), /센서/);
  session.startAdditional({ sameContext: true }); session.acceptInput(reading(100));
  assert.deepEqual(store.getSamples().map(s => s.sampleId), [1, 2]);
  assert.equal(store.getEvents(100).find(e => e.type === 'additional-measurement').payload.previousLastSampleId, 1);
  await store.close();
});

test('one invalid channel preserves the valid channel and finite out-of-range source number', async () => {
  const { store } = await fixture(), session = createSession({ store }); session.start();
  session.acceptInput(reading(0, { values: { temperatureC: -100, pressureHpa: 1000 },
    validity: { temperatureC: 'out-of-range', pressureHpa: 'valid' } }));
  session.acceptInput({ type: 'parse-error', reasonCode: 'fields', receivedAt: utc + 1, monotonicAt: 1, attemptId: 1 });
  assert.equal(store.getLatestSample().values.temperatureC, -100);
  assert.equal(store.getLatestSample().values.pressureHpa, 1000);
  assert.equal(store.getState().sampleCount, 1);
  assert.ok(store.getEvents(100).some(e => e.type === 'parse-error'));
  await store.close();
});

test('paused activity events and changed additional conditions retain their meaning through save and reopen', async () => {
  const context=getExperiment('bmp280','gay-lussac'), activityPolicy=getActivityPolicy(context);
  const {store,repository,lockManager}=await fixture({context}), session=createSession({store,activityPolicy});
  session.start();session.acceptInput(reading(0));await session.pause();
  assert.equal(session.addMemo('물 추가'),true);
  assert.equal(session.addMemo('뚜껑을 열어 센서를 확인함'),true);
  session.acceptInput(reading(100));assert.equal(store.getState().sampleCount,1);
  await session.finish();
  assert.throws(()=>session.startAdditional({sameContext:true,conditions:{container:'same',seal:'changed',sensor:'unsure'},note:''}),/메모/);
  const confirmation={sameContext:true,conditions:{container:'same',seal:'changed',sensor:'unsure'},note:'뚜껑을 다시 닫음. 센서 위치 확인 필요'};
  session.startAdditional(confirmation);session.acceptInput(reading(200));await session.finish();
  const saved=store.getSnapshot();await store.close();
  const reopened=await openRunStore({repository,id:'test',locks:lockManager,timers});
  assert.deepEqual(reopened.getSnapshot(),saved);
  assert.deepEqual(saved.events.find(e=>e.type==='additional-measurement').payload,{...confirmation,previousLastSampleId:1});
  assert.ok(saved.events.some(e=>e.type==='note' && e.payload.note==='뚜껑을 열어 센서를 확인함'));await reopened.close();
});

test('legacy device JSON resumes explicitly without changing existing samples, analysis or evidence', async () => {
  const snapshot=parseExperimentJson(await readFile(new URL('../fixtures/gay-lussac-v2.json',import.meta.url),'utf8'));
  snapshot.run.importedColumns=[{id:'data-observation',name:'이전 관찰값',unit:null}];
  snapshot.samples.forEach(sample=>{sample.importedValues={'data-observation':{value:sample.sampleId,reason:null}};});
  const {store,repository,lockManager}=await fixture({create:false,importSnapshot:snapshot});
  assert.equal(canResumeImportedRun(store.getRun()),true);
  const before=store.getSnapshot(), session=createSession({store,activityPolicy:getActivityPolicy(before.run.context)});
  session.acceptInput(reading(10000));assert.deepEqual(store.getSamples(),before.samples);
  assert.equal(session.resume(),true);session.acceptInput(reading(11000));await session.finish();
  assert.deepEqual(store.getSamples().slice(0,before.samples.length),before.samples);
  assert.deepEqual(store.getSnapshot().workspace,before.workspace);
  const work=createWorkspace({store}), evidence=structuredClone(work.getState().reflection);
  work.showNewData();assert.deepEqual(work.getState().reflection,evidence);
  const exported=parseExperimentJson(buildExperimentJson(store.getSnapshot()));
  assert.equal(exported.samples.length,before.samples.length+1);
  assert.equal(exported.samples.at(-1).importedValues['data-observation'].value,null);
  assert.match(exported.samples.at(-1).importedValues['data-observation'].reason,/제공되지/);
  assert.equal(exported.run.source,'import');assert.equal(exported.run.importedFrom.source,'device');
  assert.equal(canResumeImportedRun(exported.run),true);
  await store.close();
  const reopened=await openRunStore({repository,id:'test',locks:lockManager,timers});
  assert.deepEqual(reopened.getSamples(),exported.samples);await reopened.close();
});

test('unknown imported sources and mismatched firmware/channel contracts cannot append device data', async () => {
  const original=parseExperimentJson(await readFile(new URL('../fixtures/gay-lussac-v1.json',import.meta.url),'utf8'));
  for(const alter of [run=>{run.source='import';delete run.importedFrom;},run=>{run.program.sha256='unknown';},run=>{run.context.channels[0].unit='K';}]) {
    const snapshot=structuredClone(original);alter(snapshot.run);
    const {store}=await fixture({create:false,importSnapshot:snapshot});
    assert.equal(canResumeImportedRun(store.getRun()),false);
    const before=store.getSnapshot(), session=createSession({store});
    assert.throws(()=>session.resume(),/기록/);
    assert.throws(()=>store.appendSample({...reading(10000),sampleId:before.samples.length+1}),/추가/);
    assert.deepEqual(store.getSnapshot(),before);await store.close();
  }
});
