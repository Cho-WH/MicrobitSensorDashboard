import test from 'node:test';
import assert from 'node:assert/strict';
import { groupChartAxes } from '../../src/ui/chart-axes.js';
import { getExperiment } from '../../src/catalog/index.js';

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
});
