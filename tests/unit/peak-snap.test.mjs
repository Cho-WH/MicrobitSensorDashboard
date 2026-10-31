import test from 'node:test';
import assert from 'node:assert/strict';
import {snapToPeak} from '../../src/ui/centripetal/peak-snap.js';

test('peak attraction uses screen proximity and respects visible and endpoint bounds',()=>{
 const peaks=[{receivedAt:1000},{receivedAt:3000}],limits={startAt:0,endAt:4000};
 const geometry={left:0,width:400,pixel:at=>at/10};
 assert.equal(snapToPeak(1040,peaks,geometry,limits),1000);
 assert.equal(snapToPeak(1120,peaks,geometry,limits),1120);
 assert.equal(snapToPeak(1040,peaks,geometry,{startAt:1020,endAt:4000}),1040);
 assert.equal(snapToPeak(1040,[],geometry,limits),1040);
 assert.equal(snapToPeak(1040,peaks,{...geometry,pixel:at=>at/2},limits),1040);
 assert.equal(snapToPeak(1040,peaks,{...geometry,left:110},limits),1040);
});
