import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivePreview } from '../../src/measurement/live-preview.js';

test('preview retains sixty seconds across changing frequencies without accumulating old history', () => {
  const view = createLivePreview();
  for (let t=0;t<=180000;t+=t<90000?1000:20) view.accept({type:'reading',attemptId:1,receivedAt:1000000+t,monotonicAt:t,values:{x:t}});
  const snapshot=view.snapshot(1180000,180000);
  assert.ok(snapshot.points[0].monotonicAt<=120000);
  assert.ok(snapshot.points[1].monotonicAt>=120000);
  assert.ok(snapshot.points.at(-1).monotonicAt>=179980);
  assert.equal(snapshot.origin,1000000);
});

test('pause freezes values and time through disconnect; resume excludes paused observations', () => {
  const view=createLivePreview();
  const input=t=>({type:'reading',attemptId:1,receivedAt:1000+t,monotonicAt:t,values:{x:t}});
  view.accept(input(0));view.freeze(true,1000,0);
  view.accept(input(50));view.reset();
  assert.equal(view.snapshot(80000,79000).latest.values.x,0);
  assert.equal(view.snapshot().now,1000);
  view.freeze(false);view.accept(input(80000));
  assert.deepEqual(view.snapshot(81000,80000).points.map(p=>p.values.x),[80000]);
});
