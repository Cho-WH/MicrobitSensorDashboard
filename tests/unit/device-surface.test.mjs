import test from 'node:test';
import assert from 'node:assert/strict';
import { contactLayout, clipRearStroke } from '../../public/assets/devices/microbit-v2/contact-layout.js';

test('rings and narrow contacts share a symmetric grid with equal edge gaps',()=>{
  const {x,pitch,padHalfWidth,fingerWidth,fingers,ringFirstColumns}=contactLayout;
  assert.equal(x[2],0);
  for(let i=0;i<x.length;i++)assert.ok(Math.abs(x[i]+x[x.length-1-i])<1e-10);
  assert.equal(fingers.length,20);
  const intervals=[...x.map(center=>[center-padHalfWidth,center+padHalfWidth]),
    ...fingers.map(({x})=>[x-fingerWidth/2,x+fingerWidth/2])].sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<intervals.length;i++)assert.ok(Math.abs(intervals[i][0]-intervals[i-1][1]-(pitch-fingerWidth))<1e-10,'Uneven gap or overlapping contact');
  assert.equal(new Set([...fingers.map(f=>f.column),...ringFirstColumns.flatMap(c=>[c,c+1,c+2,c+3])]).size,40);
});

function assertOutsideBores(segments,width){
  for(const [a,b] of segments)for(const x of contactLayout.x){
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((-x-a[0])*dx+(contactLayout.y-a[1])*dy)/(dx*dx+dy*dy)));
    const distance=Math.hypot(a[0]+t*dx+x,a[1]+t*dy-contactLayout.y);
    assert.ok(distance-width/2>=contactLayout.radius+.099,'A rendered stroke overlaps a plated bore');
  }
}
test('rear graphics split around all five bores, including their stroke width',()=>{
  const segments=clipRearStroke([[-26,contactLayout.y],[26,contactLayout.y]],.2);
  assert.equal(segments.length,6);assertOutsideBores(segments,.2);
});
test('central circuit line terminates before the hole and an internal stroke disappears',()=>{
  const x=-contactLayout.x[2],y=contactLayout.y;
  const segments=clipRearStroke([[x-4,y+5],[x,y]],.065);
  assert.equal(segments.length,1);assertOutsideBores(segments,.065);
  assert.deepEqual(clipRearStroke([[x-.3,y],[x+.3,y]],.065),[]);
});
test('routing away from the edge contacts keeps its original endpoints',()=>{
  const points=[[-10,10],[0,10],[5,5]];
  assert.deepEqual(clipRearStroke(points),[[points[0],points[1]],[points[1],points[2]]]);
});
