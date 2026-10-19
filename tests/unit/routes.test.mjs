import test from 'node:test';
import assert from 'node:assert/strict';
import { entryRoutes, parseRoute, routeUrl, sameExperiment } from '../../src/app/routes.js';
import { getExperiment } from '../../src/catalog/index.js';
import { renderEntry } from '../../scripts/entry-pages.mjs';

test('home has no selected context; sensor/activity links resolve independently under a project path', () => {
  const base = new URL('https://example.test/MicrobitSensorDashboard/');
  assert.deepEqual(parseRoute('lab.html',base),{context:null,screen:'home'});
  for(const entry of entryRoutes) {
    const expected=getExperiment(entry.sensorId,entry.activityId), url=routeUrl(expected,'prepare',{base});
    const actual=parseRoute(url,base);
    assert.ok(sameExperiment(expected,actual.context)); assert.equal(actual.screen,'prepare');
    assert.equal(parseRoute(new URL('index.html',url),base).context.sensor.id,entry.sensorId);
    const shell=renderEntry('<html><head></head></html>',entry);
    const relative=shell.match(/base href="([^"]+)"/)[1];
    assert.equal(new URL(relative,url).href,base.href);
  }
});
test('navigation preserves trusted sensor/activity only and rejects unsupported configuration',()=>{
  const base=new URL('https://example.test/lab/'), context=getExperiment('bmp280','gay-lussac');
  const analysis=routeUrl(context,'analysis',{base,mock:true});
  assert.equal(parseRoute(analysis,base).screen,'analysis'); assert.equal(analysis.searchParams.get('mock'),'1');
  assert.equal(parseRoute(routeUrl(context,'home',{base}),base).context,null);
  for(const path of ['sensors/unknown/','lab.html?cfg=arbitrary','lab.html?view=unknown','../outside/','https://other.test/lab/']) assert.throws(()=>parseRoute(path,base));
  assert.ok(!sameExperiment(context,getExperiment('bmp280')));
});
