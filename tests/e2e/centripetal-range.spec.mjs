import {test,expect} from '@playwright/test';
import {fixture,utc} from '../unit/storage-support.mjs';
import {getExperiment} from '../../src/catalog/index.js';
import {buildExperimentJson} from '../../src/data/files/json.js';

test('range handles attract nearby magnetic peaks but leave direct and keyboard adjustments free',async({page})=>{
 const {store}=await fixture({context:getExperiment('motion-magnetic','centripetal')});let file;
 try{
  for(let i=0;i<=60;i++){
   const values={accelerationX:7.35,accelerationY:0,accelerationZ:-9.8,accelerationStrength:12.25,magneticStrength:50-30*Math.cos(i*Math.PI/10)};
   store.appendSample({sampleId:i+1,receivedAt:utc+i*100,values,validity:Object.fromEntries(Object.keys(values).map(key=>[key,'valid']))});
  }
  file=buildExperimentJson(store.getSnapshot());
 }finally{await store.close();}
 await page.goto('/lab.html');await expect(page.locator('html')).toHaveAttribute('data-app-state','ready');
 await page.locator('#file-input').setInputFiles({name:'peaks.json',mimeType:'application/json',buffer:Buffer.from(file)});
 await page.locator('[data-cp-action="range"]').click();
 const start=page.locator('#cp-time-range-start'),end=page.locator('#cp-time-range-end');
 const drag=async(edge,seconds,offset)=>{
  const handle=page.locator('#cp-range-'+edge+'-handle');await handle.scrollIntoViewIfNeeded();
  const box=await handle.boundingBox();
  const x=await page.locator('#cp-overview-chart').evaluate((canvas,seconds)=>canvas.getBoundingClientRect().left+Chart.getChart(canvas).scales.x.getPixelForValue(seconds),seconds);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(x+offset,box.y+box.height/2,{steps:4});await page.mouse.up();
 };
 await drag('start',1,4);await expect(start).toHaveValue('1');
 await drag('start',1,14);await expect(start).not.toHaveValue('1');
 await drag('end',5,-4);await expect(end).toHaveValue('5');
 await start.fill('1.02');await expect(start).toHaveValue('1.02');
 await page.locator('#cp-range-start-handle').focus();await page.keyboard.press('ArrowRight');
 await expect(start).toHaveValue('1.026');
 await page.locator('#cp-apply-time-range').click();await expect(page.locator('#cp-range-form')).toBeHidden();
});
