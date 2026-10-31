import test from 'node:test';
import assert from 'node:assert/strict';
import { groupChartAxes } from '../../src/ui/chart-axes.js';
import { getExperiment, getTimeAxisPolicies, resolveExperiment } from '../../src/catalog/index.js';
import { createAxisRangeState, axisRangeKey, axisRangePolicy, sampleExtent } from '../../src/ui/chart-ranges.js';

test('vector components and magnitude share one quantity/unit axis; BMP280 keeps separate quantities',()=>{
  for(const sensor of ['magnetometer','accelerometer']) {
    const channels=getExperiment(sensor).channels, groups=groupChartAxes(channels);
    assert.equal(groups.length,1);
    assert.deepEqual(groups[0].channels,channels);
    assert.equal(groupChartAxes(channels.slice(0,2)).length,1);
  }
  assert.equal(groupChartAxes(getExperiment('bmp280').channels).length,2);
});

test('future channels group by metadata, never by names, matching units alone or absent quantity',()=>{
  const channel=(id,quantity,unit)=>({id,name:id,quantity,unit});
  const channels=[channel('east','velocity','m/s'),channel('north','velocity','m/s'),
    channel('speed','velocity','m/s'),channel('converted','velocity','km/h'),
    channel('other','different-quantity','m/s'),channel('unknownA',undefined,'m/s'),
    channel('unknownB',undefined,'m/s'),channel('unitlessA','velocity',undefined),channel('unitlessB','velocity',undefined)];
  const before=structuredClone(channels), groups=groupChartAxes(channels);
  assert.deepEqual(groups.map(group=>group.channels.map(c=>c.id)),[
    ['east','north','speed'],['converted'],['other'],['unknownA'],['unknownB'],['unitlessA'],['unitlessB'],
  ]);
  assert.deepEqual(channels,before);
  const blankQuantity=[channel('one',' ','m/s'),channel('two',' ','m/s')];
  assert.equal(new Set(groupChartAxes(blankQuantity).map(group=>axisRangeKey(group.channels))).size,2);
});

test('time-axis defaults preserve stable acceleration, detail restores history, and a new run resets it',()=>{
  const context=getExperiment('motion-magnetic','centripetal'), channels=context.channels.filter(c=>c.id==='accelerationStrength');
  const policy=axisRangePolicy(channels,getTimeAxisPolicies(context)), key=axisRangeKey(channels), state=createAxisRangeState();
  const points=[12.2,12.3].map((value,i)=>({sampleId:i+1,receivedAt:i*100,values:{accelerationStrength:value}}));
  const original=structuredClone(points), extent=sampleExtent(points,channels);
  state.setScope('first');state.update(key,extent,policy);
  const base=state.view(key,extent,policy.detailSpan).bounds;
  assert.ok(base.min<=0&&base.max>=20);
  state.toggle(key);
  const detail=state.view(key,extent,policy.detailSpan).bounds;
  assert.ok(detail.min<=12.2&&detail.max>=12.3&&detail.max-detail.min<1);
  // A changing time window cannot rewrite the baseline, even while expanded.
  state.update(key,{min:35,max:36},policy);
  state.update(key,extent,policy);state.toggle(key);
  const extended=state.view(key,extent,policy.detailSpan).bounds;
  assert.ok(extended.min<=0&&extended.max>=36);
  state.update(key,{min:12.25,max:12.25},policy);
  assert.deepEqual(state.view(key,extent,policy.detailSpan).bounds,extended);
  state.toggle(key);state.setScope('second');state.update(key,extent,policy);
  assert.deepEqual(state.view(key,extent,policy.detailSpan),{expanded:false,bounds:base});
  assert.deepEqual(points,original);
});

test('axis fitting keeps negative components, independent quantities, constants and missing data meaningful',()=>{
  const context=getExperiment('motion-magnetic'), groups=groupChartAxes(context.channels), policies=getTimeAxisPolicies(context);
  const state=createAxisRangeState(), [acceleration,magnetic]=groups.map(group=>({key:axisRangeKey(group.channels),channels:group.channels,policy:axisRangePolicy(group.channels,policies)}));
  const samples=[{values:{accelerationX:-30,accelerationStrength:32,magneticStrength:50}},
    {values:{accelerationX:-9999,magneticStrength:NaN},validity:{accelerationX:'error'}}];
  for(const axis of [acceleration,magnetic]) {
    const extent=sampleExtent(samples,axis.channels);state.update(axis.key,extent,axis.policy);
    const base=state.view(axis.key,extent,axis.policy.detailSpan).bounds;
    assert.ok(base.min<=extent.min&&base.max>=extent.max&&base.min<base.max);
    assert.ok(base.min>-9999);
  }
  const magneticBefore=state.view(magnetic.key,{min:50,max:50},magnetic.policy.detailSpan);
  assert.ok(magneticBefore.bounds.min>0);
  state.toggle(acceleration.key);
  assert.deepEqual(state.view(magnetic.key,{min:50,max:50},magnetic.policy.detailSpan),magneticBefore);
  const constant=state.view(acceleration.key,{min:0,max:0},acceleration.policy.detailSpan).bounds;
  assert.ok(Number.isFinite(constant.min)&&constant.min<0&&constant.max>0);
  assert.equal(sampleExtent([{values:{accelerationX:1},validity:{accelerationX:'missing'}}],acceleration.channels),null);
});

test('time-axis defaults resolve registered storage units and never assume units from channel names',()=>{
  const old=resolveExperiment({sensor:{id:'accelerometer',version:1}}), current=getExperiment('accelerometer');
  assert.equal(getTimeAxisPolicies(old).accelerationStrength.max,2000);
  assert.equal(getTimeAxisPolicies(current).accelerationStrength.max,20);
  current.channels=current.channels.map(channel=>({...channel,unit:'unknown'}));
  assert.deepEqual(getTimeAxisPolicies(current),{});
  assert.deepEqual(getTimeAxisPolicies({channels:old.channels,sensor:{id:'unknown',version:1}}),{});
});
