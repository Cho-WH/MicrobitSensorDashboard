import test from 'node:test';
import assert from 'node:assert/strict';
import { entryRoutes, parseRoute, routeUrl, sameExperiment } from '../../src/app/routes.js';
import { getExperiment } from '../../src/catalog/index.js';
import { renderEntry } from '../../scripts/entry-pages.mjs';

test('static-host home aliases preserve the requested screen at root and project paths', () => {
  for (const base of ['https://lab.sco.pe.kr/', 'https://example.test/MicrobitSensorDashboard/']) {
    for (const path of ['', 'index.html', 'lab', 'lab.html']) {
      assert.deepEqual(parseRoute(path + '?view=saved', base), { context: null, screen: 'saved' });
    }
    assert.throws(() => parseRoute('lab?cfg=arbitrary', base));
    assert.throws(() => parseRoute('lab?view=unknown', base));
  }
});

test('home has no selected context; sensor/activity links resolve independently under a project path', () => {
  const base = new URL('https://example.test/MicrobitSensorDashboard/');
  assert.deepEqual(parseRoute('lab.html',base),{context:null,screen:'home'});
  for(const entry of entryRoutes) {
    const expected=getExperiment(entry.sensorId,entry.activityId), url=routeUrl(expected,'prepare',{base});
    const actual=parseRoute(url,base);
    assert.ok(sameExperiment(expected,actual.context)); assert.equal(actual.screen,'prepare');
    assert.equal(parseRoute(new URL('index.html',url),base).context.sensor.id,entry.sensorId);
    const preview=routeUrl(expected,'preview',{base});
    assert.equal(preview.searchParams.get('view'),'preview');
    assert.equal(parseRoute(preview,base).screen,'preview');
    assert.ok(sameExperiment(parseRoute(preview,base).context,expected));
    const shell=renderEntry(`<html><head><meta property="og:url" content="${base.href}"><meta property="og:image" content="${base.href}public/assets/branding/sensor-lab-social.png"></head></html>`,entry);
    const relative=shell.match(/base href="([^"]+)"/)[1];
    assert.equal(new URL(relative,url).href,base.href);
    assert.equal(shell.match(/property="og:url" content="([^"]+)"/)[1],url.href);
    assert.equal(shell.match(/property="og:image" content="([^"]+)"/)[1],new URL('public/assets/branding/sensor-lab-social.png',base).href);
  }
});
test('navigation preserves trusted sensor/activity only and rejects unsupported configuration',()=>{
  const base=new URL('https://example.test/lab/'), context=getExperiment('bmp280','gay-lussac');
  const analysis=routeUrl(context,'analysis',{base,mock:true});
  assert.equal(parseRoute(analysis,base).screen,'analysis'); assert.equal(analysis.searchParams.get('mock'),'1');
  assert.equal(analysis.searchParams.has('visual'),false);
  assert.ok(sameExperiment(parseRoute(analysis.href+'&visual=luminous',base).context,context));
  assert.equal(routeUrl(context,'prepare',{base}).searchParams.has('visual'),false);
  assert.equal(parseRoute(routeUrl(context,'home',{base}),base).context,null);
  for(const path of ['sensors/unknown/','lab.html?cfg=arbitrary','lab.html?view=preview','lab.html?view=unknown','../outside/','https://other.test/lab/']) assert.throws(()=>parseRoute(path,base));
  assert.ok(!sameExperiment(context,getExperiment('bmp280')));
});
