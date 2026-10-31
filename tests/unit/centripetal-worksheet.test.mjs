import { componentRatios } from '../../src/ui/centripetal/diagrams.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { blankSheet, intervalModel, calculationModel, closestSample, peakCandidates, inputNumber, calculationFields, editCentripetal, blankBook, validateCentripetal } from '../../src/analysis/activities/centripetal.js';
import { createWorkspace } from '../../src/analysis/workspace.js';
import { getExperiment } from '../../src/catalog/index.js';
import { buildExperimentJson, parseExperimentJson } from '../../src/data/files/json.js';
import { openRunStore } from '../../src/data/run-store.js';
import { reportContent } from '../../src/ui/centripetal/report-content.js';
import { fixture, utc, timers } from './storage-support.mjs';

const row=(id,ms,value=12.25)=>({sampleId:id,receivedAt:utc+ms,values:{accelerationX:0,accelerationY:0,accelerationZ:-9.8,accelerationStrength:value,magneticStrength:50},validity:Object.fromEntries(['accelerationX','accelerationY','accelerationZ','accelerationStrength','magneticStrength'].map(id=>[id,'valid']))});
const sheet=(a,b)=>({...blankSheet(1),startId:a,endId:b});

// Changing the reflection questions must not overwrite a student's other explanation.
test('reflection choice keeps both drafts, exports only the chosen questions and defaults older work safely',()=>{
  const context=getExperiment('motion-magnetic','centripetal');
  let book=blankBook();
  for(const [key,value] of Object.entries({differenceReason:'difference draft',improvement:'improvement draft',agreementReason:'agreement draft',accuracyReflection:'accuracy draft'}))book=editCentripetal(book,{type:'input',key,value});
  const answers=structuredClone(book.sheets[0].inputs);
  const rows=()=>{const s=book.sheets[0],interval=intervalModel(s,[]);return reportContent({sheet:s,interval,...calculationModel(s,interval)});};
  book=editCentripetal(book,{type:'comparison-mode',mode:'agreement'});
  assert.deepEqual(book.sheets[0].inputs,answers);
  assert.ok(Object.values(rows().notes).includes('accuracy draft'));assert.ok(!Object.values(rows().notes).includes('difference draft'));
  book=editCentripetal(book,{type:'input',key:'sensor',value:'999'});
  assert.equal(book.sheets[0].comparisonMode,'agreement');
  book=editCentripetal(book,{type:'comparison-mode',mode:'difference'});
  assert.ok(Object.values(rows().notes).includes('difference draft'));assert.ok(!Object.values(rows().notes).includes('accuracy draft'));
  assert.throws(()=>editCentripetal(book,{type:'comparison-mode',mode:'invalid'}));
  delete book.sheets[0].comparisonMode;delete book.sheets[0].inputs.agreementReason;delete book.sheets[0].inputs.accuracyReflection;
  const restored=validateCentripetal(book,[],context).sheets[0];
  assert.equal(restored.comparisonMode,'difference');assert.equal(restored.inputs.agreementReason,'');assert.equal(restored.inputs.accuracyReflection,'');
  assert.equal(restored.inputs.differenceReason,'difference draft');
  book.sheets[0].comparisonMode='invalid';assert.throws(()=>validateCentripetal(book,[],context));
});

test('percent difference treats both methods equally and does not reuse the previous denominator answer',()=>{
  const s=sheet(1,2),interval=intervalModel(s,[row(1,0),row(2,1000)]);
  for(const [a,b,expected] of [[2,3,40],[3,2,40],[0,3,200],[3,0,200],[3,3,0],[0,0,null],[1e308,1e308,0]]){
    s.inputs.sensor=String(a);s.inputs.orbital=String(b);
    assert.equal(calculationModel(s,interval).comparison.percentDifference,expected);
  }
  const old=blankBook();delete old.sheets[0].inputs.percentDifference;delete old.sheets[0].inputs.differenceReason;
  Object.assign(old.sheets[0].inputs,{difference:'0.55',relative:'7',evidenceText:'내 설명'});
  old.sheets[0].sources.relative='manual';old.sheets[0].review=['relative'];
  const restored=validateCentripetal(old,[],getExperiment('motion-magnetic','centripetal')).sheets[0];
  assert.equal(restored.inputs.percentDifference,'');assert.equal(restored.inputs.differenceReason,'');assert.equal(restored.inputs.difference,'0.55');
  assert.equal(restored.inputs.evidenceText,'내 설명');assert.equal('relative' in restored.inputs,false);
  assert.deepEqual(restored.review,[]);
});

// Changing either answer must not leave an error analysis based on the old pair.
test('comparison inputs clear on changed acceleration, preserve equivalent values and export student work',()=>{
  let book=blankBook();
  const edit=(key,value)=>book=editCentripetal(book,{type:'input',key,value});
  for(const [key,value] of Object.entries({sensor:'7.35',orbital:'7.9',difference:'0.6',percentDifference:'7.5'}))edit(key,value);
  edit('sensor','7.350');
  assert.equal(book.sheets[0].inputs.difference,'0.6');
  const s=book.sheets[0],interval=intervalModel(s,[]);
  const rows=reportContent({sheet:s,interval,...calculationModel(s,interval)});
  assert.equal(rows.numbers.difference.value,'0.6');
  assert.equal(rows.numbers.percentDifference.value,'7.5');
  for(const key of ['sensor','orbital']){
    edit('difference','0.6');edit('percentDifference','7.5');edit(key,'8');
    assert.equal(book.sheets[0].inputs.difference,'');assert.equal(book.sheets[0].inputs.percentDifference,'');
    assert.ok(!book.sheets[0].review.includes('percentDifference'));
  }
});

// Incomplete or stale work must never appear as a current comparison; caution is advisory.
test('comparison readiness requires complete current work without grading student answers',()=>{
  const s=sheet(1,2),interval=intervalModel(s,[row(1,0),row(2,1000)]);
  s.meanRequested=true;
  Object.assign(s.inputs,{n:'1',radius:'3.01',period:'1',omega:'6.28',sensor:'123',orbital:'0'});
  const ready=()=>calculationModel(s,interval).comparisonReady;
  assert.equal(ready(),true);
  for(const key of calculationFields){
    const before=s.inputs[key];
    for(const invalid of ['', 'abc', '-1']){s.inputs[key]=invalid;assert.equal(ready(),false,key);}
    s.inputs[key]=before;s.review=[key];assert.equal(ready(),false,key);s.review=[];
  }
  s.meanRequested=false;assert.equal(ready(),false);s.meanRequested=true;
  assert.equal(calculationModel(s,{...interval,problem:'불연속'}).comparisonReady,false);
  assert.equal(calculationModel(s,{...interval,accelerationProblem:'값 없음'}).comparisonReady,false);

});

// Input, calculations and exported worksheets use the same metre value.
test('radius is in metres throughout calculations and worksheet export',()=>{
  const s=sheet(1,2);s.inputs.radius='0.2';s.inputs.omega='4';
  const interval=intervalModel(s,[row(1,0),row(2,1000)]);
  const model={sheet:s,interval,...calculationModel(s,interval)};
  assert.equal(model.help.orbital,3.2);
  assert.equal(reportContent(model).numbers.radius.value,'0.2');
  assert.equal(reportContent(model).numbers.radius.unit,'m');
  assert.equal(s.inputs.radius,'0.2');
});

// Irregular reception must not overweight a densely received patch or change the shared interval.
test('same interval uses exact time-weighted linear moments and keeps manual values independent',()=>{
  const rows=[row(1,0,10),row(2,100,12),row(3,400,14)];const s=sheet(1,3);
  const interval=intervalModel(s,rows);assert.equal(interval.duration,.4);assert.equal(interval.count,3);
  assert.ok(Math.abs(interval.mean-12.5)<1e-10);
  const expectedSecond=(.1*(100+120+144)/3+.3*(144+168+196)/3)/.4;
  assert.ok(Math.abs(interval.deviation-Math.sqrt(expectedSecond-12.5**2))<1e-10);
  Object.assign(s.inputs,{n:'2',radius:'0.2',period:'123',omega:'99',sensor:'2.45',orbital:'0'});
  const calculation=calculationModel(s,interval);
  assert.equal(calculation.reference.period,.2);assert.equal(calculation.values.period,123);assert.equal(calculation.comparison.percentDifference,200);
  assert.equal(closestSample(rows,utc+50).sampleId,1);assert.equal(closestSample(rows,utc-1),null);
  assert.equal(inputNumber(''),null);assert.equal(inputNumber('Infinity'),null);
  s.inputs.sensor='1e308';s.inputs.orbital='1e-308';assert.equal(calculationModel(s,interval).comparison.percentDifference,200);
  const extreme=intervalModel(s,[row(1,0,1e308),row(2,100,1),row(3,400,1)]);
  assert.ok(extreme.accelerationProblem);assert.equal(extreme.mean,null);assert.equal(calculationModel(s,extreme).reference.period,.2);
});

// Viewing locked work must not mutate its saved selection, and exports must not reveal unused help.
test('read-only worksheets remain independent and exports omit automatic answers even for legacy help',async()=>{
  const {store,repository,lockManager}=await fixture({context:getExperiment('motion-magnetic','centripetal')});
  let reader;
  try {
    for(let i=0;i<21;i++)store.appendSample(row(i+1,i*100));
    const workspace=createWorkspace({store});
    workspace.editActivity({type:'range',startId:1,endId:21});
    assert.throws(()=>workspace.editActivity({type:'range',startId:10,endId:2}));
    assert.equal(workspace.getCentripetalModel().sheet.startId,1);
    workspace.editActivity({type:'range',startId:2,endId:20});workspace.undo();
    assert.equal(workspace.getCentripetalModel().sheet.startId,1);
    assert.equal(workspace.getCentripetalModel().sheet.endId,21);
    workspace.editActivity({type:'input',key:'n',value:'2'});
    const rows=()=>reportContent(workspace.getCentripetalModel());
    assert.equal(workspace.getCentripetalModel().sheet.meanRequested,false);
    assert.equal(rows().mean,null);
    workspace.editActivity({type:'mean'});
    assert.equal(rows().mean,12.25);
    workspace.editActivity({type:'range',startId:2,endId:20});
    assert.equal(workspace.getCentripetalModel().sheet.meanRequested,false);
    workspace.undo();assert.equal(workspace.getCentripetalModel().sheet.meanRequested,true);
    for(const key of ['sensor','period','omega','orbital'])assert.equal(rows().numbers[key].value,'');
    for(const key of ['sensor','period','omega','orbital','reference'])workspace.editActivity({type:'help',key});
    for(const key of ['sensor','period','omega','orbital'])assert.equal(rows().numbers[key].value,'');
    assert.equal(workspace.getCentripetalModel().sheet.inputs.period,'');
    workspace.editActivity({type:'new'});
    await store.flush();
    reader=await openRunStore({repository,id:'test',locks:lockManager,timers});
    const view=createWorkspace({store:reader}),before=reader.getSnapshot();
    assert.equal(view.isWritable(),false);
    assert.equal(view.getCentripetalModel(false,1).sheet.inputs.n,'2');
    assert.equal(view.getCentripetalModel(false,1).sheet.meanRequested,true);
    assert.equal(view.getCentripetalModel(false,2).sheet.inputs.n,'');
    assert.equal(view.getCentripetalModel().sheet.id,2);
    assert.deepEqual(reader.getSnapshot(),before);
    assert.throws(()=>view.editActivity({type:'input',key:'n',value:'9'}));
  }finally{await reader?.close();await store.close();}
});

test('discontinuities block mixed-interval comparisons while bad acceleration preserves period',()=>{
  const rows=Array.from({length:10},(_,i)=>row(i+1,i*100));const s=sheet(1,10);s.inputs.n='3';
  for(const type of ['discontinuity','recording-paused','recording-resumed','interrupted'])assert.ok(intervalModel(s,rows,[{type,receivedAt:utc+250}]).problem);
  assert.ok(intervalModel(s,rows,[],[{sampleId:4}]).problem);
  const duplicated=structuredClone(rows);duplicated[3].receivedAt=duplicated[2].receivedAt;assert.ok(intervalModel(s,duplicated).problem);
  const gap=structuredClone(rows);gap.slice(5).forEach(r=>r.receivedAt+=4000);assert.ok(intervalModel(s,gap).problem);
  const invalid=structuredClone(rows);invalid[4].validity.accelerationStrength='missing';invalid[4].values.accelerationStrength=null;
  const interval=intervalModel(s,invalid),c=calculationModel(s,interval);assert.equal(interval.problem,'');assert.ok(interval.accelerationProblem);assert.equal(c.reference.period,.3);assert.equal(c.reference.sensor,null);
  assert.equal(calculationModel(s,intervalModel(s,rows.map(r=>row(r.sampleId,r.receivedAt-utc,9.8)))).reference.sensor,null);
  assert.deepEqual(peakCandidates(rows),[]);
});

test('worksheet inputs, undo, frozen evidence and JSON round trip retain provenance and raw samples',async()=>{
  const context=getExperiment('motion-magnetic','centripetal');
  context.setup={...context.setup,centripetalRadiusM:'0.2'};
  const {store}=await fixture({context});
  try {
    for(let i=0;i<21;i++)store.appendSample(row(i+1,i*100));
    const workspace=createWorkspace({store}),before=store.getSamples();
    assert.equal(workspace.getCentripetalModel().sheet.inputs.radius,'0.2');
    workspace.editActivity({type:'endpoint',key:'startId',sampleId:1});workspace.editActivity({type:'endpoint',key:'endId',sampleId:21});
    workspace.editActivity({type:'mean'});
    for(const [key,value]of Object.entries({n:'2',radius:'0.2',period:'1',omega:'6.28',sensor:'7.35',orbital:'7.9',difference:'0.6',percentDifference:'7.5',orbitalThinking:'반지름에 각속도의 제곱을 곱했다.',evidenceText:'같은 구간에서 관찰',differenceReason:'구간 후반의 회전 간격이 달랐다.',agreementReason:'여러 회전을 세어 주기를 구했다.',accuracyReflection:'반지름 측정 방법을 다시 확인한다.'}))workspace.editActivity({type:'input',key,value});
    workspace.editActivity({type:'comparison-mode',mode:'agreement'});
    workspace.undo();assert.equal(workspace.getCentripetalModel().sheet.comparisonMode,'difference');
    workspace.redo();assert.equal(workspace.getCentripetalModel().sheet.comparisonMode,'agreement');
    workspace.captureActivity();const frozen=workspace.getCentripetalModel(true);
    workspace.editActivity({type:'input',key:'radius',value:'0.3'});
    assert.equal(workspace.getCentripetalModel().help.orbital,0.3*6.28**2);
    workspace.undo();assert.equal(workspace.getCentripetalModel().sheet.inputs.radius,'0.2');
    workspace.editActivity({type:'input',key:'n',value:'1'});
    let model=workspace.getCentripetalModel();assert.equal(model.interval.mean,12.25);assert.equal(model.reference.period,2);assert.equal(model.sheet.inputs.period,'1');assert.ok(model.sheet.review.includes('period'));assert.ok(!model.sheet.review.includes('sensor'));
    assert.deepEqual(workspace.getCentripetalModel(true).sheet,frozen.sheet);
    workspace.undo();assert.equal(workspace.getCentripetalModel().sheet.inputs.n,'2');workspace.redo();assert.equal(workspace.getCentripetalModel().sheet.inputs.n,'1');
    workspace.editActivity({type:'input',key:'period',value:'2',source:'help'});
    workspace.editActivity({type:'input',key:'n',value:'2'});
    workspace.editActivity({type:'input',key:'n',value:'1'});
    assert.ok(workspace.getCentripetalModel().sheet.review.includes('period'));
    workspace.editActivity({type:'input',key:'period',value:'2',source:'help'});
    assert.ok(!workspace.getCentripetalModel().sheet.review.includes('period'));
    workspace.undo();assert.ok(workspace.getCentripetalModel().sheet.review.includes('period'));
    workspace.redo();assert.equal(workspace.getCentripetalModel().sheet.sources.period,'help');
    workspace.editActivity({type:'endpoint',key:'startId',sampleId:2});model=workspace.getCentripetalModel();assert.equal(model.sheet.inputs.n,'1');assert.ok(model.sheet.review.includes('n'));assert.equal(model.reference.period,null);
    assert.equal(model.sheet.meanRequested,false);
    workspace.editActivity({type:'mean'});
    workspace.editActivity({type:'input',key:'thinking',value:'<script>not executable</script>'});
    workspace.editActivity({type:'new'});workspace.editActivity({type:'select',id:1});
    const restored=parseExperimentJson(buildExperimentJson(store.getSnapshot()));assert.deepEqual(restored.samples,before);
    assert.equal(restored.run.context.setup.centripetalRadiusM,'0.2');
    assert.equal(restored.workspace.bySource.recorded.centripetal.version,2);
    assert.deepEqual(restored.workspace.bySource.recorded.centripetal,workspace.getState().centripetal);
    for(const change of [
      snapshot=>{snapshot.run.context.activity.version=1;},
      snapshot=>{snapshot.run.context.setup.centripetalRadiusCm='20';},
      snapshot=>{snapshot.workspace.bySource.recorded.centripetal.version=1;},
    ]) {
      const legacy=JSON.parse(buildExperimentJson(store.getSnapshot()));change(legacy);
      assert.throws(()=>parseExperimentJson(JSON.stringify(legacy)));
    }
    const corrupt=JSON.parse(buildExperimentJson(store.getSnapshot()));corrupt.workspace.bySource.recorded.centripetal.sheets[0].startId=999;
    assert.throws(()=>parseExperimentJson(JSON.stringify(corrupt)));
    const rebuilt=createWorkspace({store});assert.equal(rebuilt.getCentripetalModel().sheet.inputs.thinking,'<script>not executable</script>');
  }finally{await store.close();}
});

// A distorted diagram would teach a different component relation from the measured magnitude.
test('component vectors share one scale with gravity fixed and no invented missing measurement',()=>{
  for(const mean of [9.8,10,12.25,19.6,156.8]){
    const r=componentRatios(mean);
    assert.equal(r.vertical,1);
    assert.ok(Math.abs(Math.hypot(r.horizontal,r.vertical)-mean/9.8)<1e-12);
    assert.equal(r.diagonal,mean/9.8);
  }
  assert.equal(componentRatios(9.8).horizontal,0);
  assert.ok(Math.abs(componentRatios(12.25).horizontal-.75)<1e-12);
  for(const mean of [null,undefined,NaN,Infinity,-1,9.7])assert.equal(componentRatios(mean),null);
});

test('deleting a named sheet preserves other answers and active selection',()=>{
  let book=editCentripetal(blankBook(),{type:'input',key:'thinking',value:'첫 풀이'});
  book=editCentripetal(book,{type:'new'});
  book=editCentripetal(book,{type:'input',key:'thinking',value:'두 번째 풀이'});
  const remaining=editCentripetal(book,{type:'delete',id:1});
  assert.equal(remaining.activeId,2);
  assert.equal(remaining.sheets[0].inputs.thinking,'두 번째 풀이');
  assert.equal(book.sheets.length,2);
  const deletedActive=editCentripetal(book,{type:'delete',id:2});
  assert.equal(deletedActive.activeId,1);
  assert.equal(deletedActive.sheets[0].inputs.thinking,'첫 풀이');
  assert.throws(()=>editCentripetal(book,{type:'delete',id:99}));
  assert.throws(()=>editCentripetal(remaining,{type:'delete',id:2}));
});
