import test from 'node:test';
import assert from 'node:assert/strict';
import { getExperiment, resolveExperiment } from '../../src/catalog/index.js';
import { decodeBmp280 } from '../../src/catalog/sensors/bmp280/codec.js';
import { validateChannels } from '../../src/domain/contracts.js';
test('BMP280 free measurement and Gay-Lussac share channels and firmware, activity alone supplies actions and calculations',()=>{
  const free=getExperiment(), activity=getExperiment('bmp280','gay-lussac');
  const measurementDefinition = channels => channels.map(({name, ...channel}) => channel);
  assert.deepEqual(measurementDefinition(free.channels),measurementDefinition(activity.channels));
  assert.deepEqual(activity.channels.map(channel=>channel.name),['센서 온도','용기 안 압력']);
  assert.deepEqual(free.channels.map(channel=>channel.name),['온도','기압']);
  assert.deepEqual(free.firmware,activity.firmware);
  assert.equal(free.activity,null); assert.deepEqual(free.analysisTemplates,[]); assert.equal(free.defaultGraph.xColumnId,'receivedAt');
  assert.equal(activity.defaultGraph.xColumnId,'temperatureC'); assert.equal(activity.analysisTemplates[0].columns[0].rhs.value,273.15);
  free.channels[0].name='changed'; assert.notEqual(getExperiment().channels[0].name,'changed');
});
test('configuration rejects unknown versions, incompatible activities and command overrides before side effects',()=>{
  assert.throws(()=>resolveExperiment({sensor:{id:'bmp280',version:2}}));
  assert.throws(()=>resolveExperiment({sensor:{id:'bmp280',version:1}}, {v:2,sensor:{id:'bmp280',version:1},activity:null,startCommand:'bad'}));
  assert.throws(()=>resolveExperiment({sensor:{id:'bmp280',version:1}}, {v:2,sensor:{id:'bmp280',version:1},activity:{id:'gay-lussac',version:1}}));
  assert.throws(()=>validateChannels([{id:'receivedAt',name:'bad'}]));
});
test('BMP280 codec preserves zero and finite range failures, missing channels and unsupported humidity independently',()=>{
  const sample=decodeBmp280('0,0,1000');assert.equal(sample.values.temperatureC,0);assert.equal(sample.validity.temperatureC,'valid');assert.equal(sample.values.humidityPct,undefined);assert.equal(sample.rawExtra.humidityValidity,'unsupported');
  const invalid=decodeBmp280(',0,1200');assert.equal(invalid.values.temperatureC,null);assert.equal(invalid.validity.temperatureC,'missing');assert.equal(invalid.values.pressureHpa,1200);assert.equal(invalid.validity.pressureHpa,'out-of-range');
  assert.equal(decodeBmp280('1,2').type,'parse-error');assert.equal(decodeBmp280('abc,0,1000').validity.temperatureC,'error');
});
