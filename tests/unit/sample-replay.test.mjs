import test from 'node:test';
import assert from 'node:assert/strict';
import { createSampleReplay,prepareSampleFrames } from '../../src/device/sample-replay.js';
import { createTourRepository } from '../../src/data/tour-repository.js';
import { openRunStore } from '../../src/data/run-store.js';
import { getExperiment } from '../../src/catalog/index.js';
import { tour as centripetalTour } from '../../src/catalog/activities/centripetal/tour.js';
import { tour as gayLussacTour } from '../../src/catalog/activities/gay-lussac/tour.js';
import { decodeMotionMagnetic } from '../../src/catalog/sensors/motion-magnetic/codec.js';
import { decodeBmp280 } from '../../src/catalog/sensors/bmp280/codec.js';

test('a finite replay starts at the first frame, preserves paused progress and ends once after its last frame',()=>{
  const frames=prepareSampleFrames(ms=>ms,1000,3000),replay=createSampleReplay(frames);
  assert.deepEqual(frames,[0,1000,2000]);
  assert.equal(replay.read().frame,0);assert.equal(replay.read().frame,1000);
  const read=(state='recording',key='run')=>replay.read({state,key});
  assert.deepEqual(read(),{frame:0,ended:false});
  for(let i=0;i<20;i++)assert.deepEqual(read('paused'),{frame:0,ended:false});
  assert.deepEqual(read(),{frame:1000,ended:false});
  assert.deepEqual(read(),{frame:2000,ended:true});
  assert.deepEqual(read(),{frame:2000,ended:false});
  assert.deepEqual(read('ended'),{frame:2000,ended:false});
  assert.deepEqual(read(),{frame:0,ended:false});
  assert.deepEqual(read('recording','another'),{frame:0,ended:false});
  assert.equal(prepareSampleFrames(String,100).length,600);
});

test('reconnecting can update protocol metadata without restarting a paused sequence',()=>{
  const replay=createSampleReplay(['old-0','old-1','old-2']);
  replay.read({state:'recording',key:'run'});replay.read({state:'paused',key:'run'});
  replay.replaceFrames(['new-0','new-1','new-2']);
  assert.equal(replay.read({state:'recording',key:'run'}).frame,'new-1');
  assert.equal(replay.read({state:'recording',key:'run'}).ended,true);
});

test('scheduled activity notes follow recorded frames, not preview or paused wall time, and repeat only for a new recording',()=>{
  const replay=createSampleReplay([0,1,2],[{frameIndex:1,note:'water'},{frameIndex:2,note:'fall'}]);
  for(let i=0;i<6;i++)assert.equal(replay.read().notes,undefined);
  const read=(state='recording',key='run')=>replay.read({state,key});
  read();assert.deepEqual(read().notes,['water']);
  for(let i=0;i<20;i++)assert.equal(read('paused').notes,undefined);
  assert.deepEqual(read(),{frame:2,ended:true,notes:['fall']});
  assert.equal(read().notes,undefined);
  assert.equal(read('recording','new').notes,undefined);
  assert.deepEqual(read('recording','new').notes,['water']);
});

test('centripetal tour keeps period, radius and measured acceleration physically consistent in both speed intervals',()=>{
  const data=prepareSampleFrames(centripetalTour.lineAt,100,centripetalTour.durationMs).map(line=>decodeMotionMagnetic(line).values);
  assert.equal(data.length,1800);
  const radius=Number(centripetalTour.setup.centripetalRadiusM);
  assert.ok(Math.abs(data[0].accelerationStrength-9.8)<.03);
  assert.ok(Math.abs(data.at(-1).accelerationStrength-9.8)<.03);
  for(const [start,end,period] of [[300,700,1.5],[1000,1450,.95]]){
    const section=data.slice(start,end),peaks=[];
    for(let i=1;i<section.length-1;i++)if(section[i].magneticStrength>section[i-1].magneticStrength&&section[i].magneticStrength>section[i+1].magneticStrength&&section[i].magneticStrength>65)peaks.push(i);
    const measuredPeriod=(peaks.at(-1)-peaks[0])*.1/(peaks.length-1);
    assert.ok(Math.abs(measuredPeriod-period)<.01);
    const mean=section.reduce((sum,row)=>sum+row.accelerationStrength,0)/section.length;
    const acceleration=Math.sqrt(mean**2-9.8**2),expected=4*Math.PI**2*radius/period**2;
    assert.ok(Math.abs(acceleration/expected-1)<.02);
  }
});

test('compressed first trial retains its original endpoints and falling temperature with rising pressure near the incident',()=>{
  const data=prepareSampleFrames(gayLussacTour.lineAt,100,gayLussacTour.durationMs).map(line=>decodeBmp280(line).values);
  assert.equal(data.length,1800);
  assert.deepEqual(data[0],{temperatureC:29.26,pressureHpa:1006.11215714444});
  assert.equal(data.at(-1).temperatureC,39.05);
  assert.ok(data[750].temperatureC<data[740].temperatureC-.05);
  assert.ok(data[750].pressureHpa>data[740].pressureHpa);
});

test('tour storage supports the existing writer, isolated reopening and disposal without persistent storage',async()=>{
  const repository=createTourRepository(),other=createTourRepository();
  const store=await openRunStore({repository,locks:repository.locks,create:true,context:getExperiment('temperature'),source:'replay'});
  const id=store.getState().id;
  store.updateRun({name:'test'});await store.flush();
  const snapshot=await repository.readSnapshot(id);snapshot.run.name='mutation';
  assert.equal((await repository.readSnapshot(id)).run.name,'test');
  assert.equal((await other.listRuns()).length,0);
  store.dispose();
  const reopened=await openRunStore({repository,locks:repository.locks,id});
  assert.equal(reopened.getRun().name,'test');reopened.dispose();
  repository.close();assert.equal(await repository.readSnapshot(id),null);
});
