import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { fixture, sample, utc } from './storage-support.mjs';
import { createWorkspace } from '../../src/analysis/workspace.js';
import { buildPointCsv, buildAnalysisCsv, parseExperimentCsv } from '../../src/data/files/csv.js';
import { buildExperimentJson, parseExperimentJson } from '../../src/data/files/json.js';

const vendor = {module:{exports:{}},exports:{}};
runInNewContext(await readFile(new URL('../../public/vendor/papaparse-5.7.0.min.js', import.meta.url), 'utf8'), vendor);
globalThis.Papa = vendor.module.exports;
const column = {id:'manual-condition',name:'거리',unit:'cm',type:'number'};
async function setup() {
  const {store} = await fixture();
  for (let id=1; id<=6; id++) store.appendSample(sample(id));
  store.setManualColumn(column);
  for (const [id,value] of [[2,0],[5,3]]) store.appendPointRecord({capturedSampleId:id,capturedAt:utc+1000+id,manualValues:{[column.id]:value}});
  return store;
}

test('confirmed point edits synchronize analysis while preserving frozen evidence and isolated histories', async () => {
  const store = await setup();
  try {
    const recorded = createWorkspace({store}), points = createWorkspace({store,sourceId:'points'});
    assert.equal(points.getGraphData().type,'scatter'); assert.equal(points.getGraphData().xColumnId,column.id);
    points.captureReflection(); const evidence = points.getReflectionModel();
    points.exclude([5],'다시 확인'); const recordedState = recorded.getState();
    store.updatePointRecord(1,{manualValues:{[column.id]:7}});
    store.updatePointRecord(1,{manualValues:{[column.id]:9}});
    store.setManualColumn({...column,name:'위치',unit:'m'});
    assert.equal(points.pendingChanges().changed,2);
    assert.equal(points.getGraphData().points[0].x,0);
    assert.deepEqual(points.getReflectionModel(),evidence);
    assert.equal(points.syncExplicitChanges(),true);
    assert.equal(points.getGraphData().points[0].x,9);
    assert.equal(points.getGraphData().xUnit,'m');
    assert.deepEqual(points.getReflectionModel(),evidence);
    assert.deepEqual(recorded.getState(),recordedState);
    assert.equal(points.syncExplicitChanges(),false);
    points.undo(); assert.equal(points.getGraphData().points.length,2);
    const restored = parseExperimentJson(buildExperimentJson(store.getSnapshot()));
    const reopened = createWorkspace({sourceId:'points',store:{getSnapshot:()=>restored,getAnalysisSourceSnapshot:()=>store.getAnalysisSourceSnapshot('points'),getState:()=>({writable:false})}});
    assert.deepEqual(reopened.getReflectionModel(),evidence);
    assert.equal(reopened.getGraphData().xUnit,'m');
  } finally {store.dispose();}
});

test('withdrawn selected points stay candidates for restoration; explicit exclusions remain independent', async () => {
  const store=await setup();
  try {
    const work=createWorkspace({store,sourceId:'points'});
    work.setSelection([2,5]); work.applyScope('selection'); work.exclude([5]);
    store.setPointWithdrawn(1,true); work.syncExplicitChanges();
    assert.deepEqual(work.getState().appliedIds,[2,5]); assert.equal(work.getGraphData().points.length,0);
    assert.equal(work.getGraphData().excludedPoints.length,1);
    store.setPointWithdrawn(1,false); work.syncExplicitChanges();
    assert.deepEqual(work.getGraphData().points.map(p=>p.sampleId),[2]);
    work.applyScope('all'); store.setPointWithdrawn(1,true); work.syncExplicitChanges();
    assert.deepEqual(work.getState().appliedIds,[5]);
    store.setPointWithdrawn(1,false); work.syncExplicitChanges();
    assert.deepEqual(work.getState().appliedIds,[2,5]);
  } finally {store.dispose();}
});

test('confirmed captures update all-point analysis but retain designated candidates and exclusions', async () => {
  const store=await setup();
  try {
    const work=createWorkspace({store,sourceId:'points'});
    work.exclude([5],'확인 필요');
    store.appendPointRecord({capturedSampleId:6,capturedAt:utc+3000,manualValues:{[column.id]:4}});
    work.syncExplicitChanges();
    assert.deepEqual(work.getGraphData().points.map(p=>p.sampleId),[2,6]);
    work.setSelection([2,5]); work.applyScope('selection');
    store.appendSample(sample(7));
    store.appendPointRecord({capturedSampleId:7,capturedAt:utc+4000,manualValues:{[column.id]:5}});
    work.syncExplicitChanges();
    assert.deepEqual(work.getState().appliedIds,[2,5]);
    assert.deepEqual(work.getState().exclusions,[{sampleId:5,reason:'확인 필요'}]);
    assert.deepEqual(work.getGraphData().points.map(p=>p.sampleId),[2]);
    assert.equal(work.getSamples().length,4);
  } finally {store.dispose();}
});

test('streaming and pause keep analysis fixed; finishing synchronizes even after reopening and preserves evidence and scope', async () => {
  const store=await setup();
  try {
    const work=createWorkspace({store});
    work.captureReflection(); const evidence=work.getReflectionModel();
    store.appendSample(sample(7));
    assert.equal(work.syncExplicitChanges(),false);
    store.updateRun({status:'paused'});
    assert.equal(work.syncExplicitChanges(),false);
    assert.equal(work.pendingChanges().added,1);
    store.updateRun({status:'complete'});
    assert.equal(work.syncExplicitChanges(),true);
    assert.equal(work.getGraphData().points.length,7);
    assert.deepEqual(work.getReflectionModel(),evidence);
    assert.equal(work.syncExplicitChanges(),false);
    work.setSelection([2,5]); work.applyScope('selection'); work.exclude([5],'잡음');
    const before=work.getState();
    store.updateRun({status:'open'}); store.appendSample(sample(8));
    assert.equal(work.syncExplicitChanges(),false);
    store.updateRun({status:'complete'});
    const reopened=createWorkspace({store});
    reopened.syncExplicitChanges();
    assert.deepEqual(reopened.getState().appliedIds,before.appliedIds);
    assert.deepEqual(reopened.getState().exclusions,before.exclusions);
    assert.deepEqual(reopened.getReflectionModel(),evidence);
    assert.equal(reopened.pendingChanges().added,0);
    assert.equal(reopened.getSamples().length,8);
  } finally {store.dispose();}
});

test('automatic synchronization respects read-only state and retries a failed save without losing analysis', async () => {
  const store=await setup();
  try {
    let rejectSave=false;
    const work=createWorkspace({sourceId:'points',store:{...store,saveWorkspace(...args) {
      if (rejectSave) throw new Error('저장 공간 부족');
      return store.saveWorkspace(...args);
    }}});
    work.captureReflection(); const before=work.getState();
    store.updatePointRecord(1,{manualValues:{[column.id]:8}});
    const readOnly=createWorkspace({sourceId:'points',store:{...store,getState:()=>({...store.getState(),writable:false})}});
    assert.equal(readOnly.syncExplicitChanges(),false);
    assert.equal(readOnly.getGraphData().points[0].x,0);
    rejectSave=true;
    assert.throws(()=>work.syncExplicitChanges(),/저장 공간/);
    assert.deepEqual(work.getState(),before);
    assert.equal(work.getGraphData().points[0].x,0);
    rejectSave=false;
    assert.equal(work.syncExplicitChanges(),true);
    assert.equal(work.getGraphData().points[0].x,8);
    assert.deepEqual(work.getState().reflection,before.reflection);
  } finally {store.dispose();}
});

test('origin inspection extends only read boundary, preserving analysis, pending count, evidence and run time origin', async () => {
  const store=await setup();
  try {
    const work=createWorkspace({store}); work.captureReflection();
    const before=work.getState(), evidence=work.getReflectionModel();
    for(let id=7;id<=10;id++) store.appendSample(sample(id));
    store.appendPointRecord({capturedSampleId:10,capturedAt:utc+3000,manualValues:{[column.id]:4}});
    work.revealSample(10);
    assert.equal(work.getState().tableLastSampleId,10); assert.equal(work.getState().appliedThroughSampleId,6);
    assert.equal(work.getState().analysisInputRevision,before.analysisInputRevision);
    assert.deepEqual(work.getState().appliedIds,before.appliedIds); assert.equal(work.pendingChanges().added,4);
    assert.deepEqual(work.getReflectionModel(),evidence); assert.equal(work.reflectionChanged(),false);
    const reopened=createWorkspace({store}); assert.equal(reopened.pendingChanges().added,4); assert.equal(reopened.getState().appliedScope,'all');
    const points=createWorkspace({store,sourceId:'points'}); assert.equal(points.getTimeOrigin(),sample(1).receivedAt);
    work.showNewData(); assert.equal(work.pendingChanges().added,0); assert.equal(work.getGraphData().points.length,10);
  } finally {store.dispose();}
});

test('point CSV keeps UTC origin, null/zero conditions and cancelled provenance; analysis CSV uses applied values', async () => {
  const store=await setup();
  try {
    const work=createWorkspace({store,sourceId:'points'});
    store.updatePointRecord(1,{manualValues:{[column.id]:null}}); store.setPointWithdrawn(2,true);
    const original=store.getSnapshot(), parsed=parseExperimentCsv(buildPointCsv(original),{id:'imported'});
    assert.equal(parsed.pointRecords.length,0); assert.equal(parsed.run.source,'import');
    assert.deepEqual(parsed.samples.map(s=>s.sourceSampleId),[2,5]);
    assert.equal(parsed.samples[0].importedValues['data-manual-condition'].value,null);
    assert.equal(parsed.samples[1].rawExtra.csvPoint.withdrawn,true);
    assert.equal(parsed.run.timeOrigin,sample(1).receivedAt);
    assert.deepEqual(parsed.workspace.bySource.recorded.exclusions.map(e=>e.sampleId),[2]);
    const analysis=parseExperimentCsv(buildAnalysisCsv(original,[],'points'),{id:'analysis'});
    assert.equal(analysis.samples.length,2); assert.equal(analysis.samples[0].importedValues['data-manual-condition'].value,0);
    work.showNewData();
    assert.equal(parseExperimentCsv(buildAnalysisCsv(store.getSnapshot(),[],'points')).samples.length,1);
    assert.deepEqual(store.getSamples(),original.samples);
    assert.throws(()=>parseExperimentCsv(buildPointCsv(original).replace(',true',',yes')),/취소 상태/);
  } finally {store.dispose();}
});
