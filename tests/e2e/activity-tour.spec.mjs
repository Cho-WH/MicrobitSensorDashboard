import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {chooseTourDevice} from './support/tour.mjs';

async function enter(page,activity){
  await page.clock.install();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(`/activities/${activity}/?view=preview`);
  await page.locator('#preview-tour').click();
  await expect(page.locator('[data-screen="prepare"]')).toBeVisible();
  await page.locator('#to-measure').click();
  await expect(page.locator('[data-screen="measure"]')).toBeVisible();
  await expect(page.locator('#tour-status')).toBeVisible();
  if(await page.locator('.experiment-guide').isVisible())await page.locator('.experiment-guide .experiment-guide-close').click();
}
async function connect(page){
  await page.locator('#measurement-reconnect').click();await chooseTourDevice(page);
  await expect(page.locator('#start-recording')).toBeEnabled();
}
async function download(page){
  await page.locator('.luminous-export > summary').click();
  const pending=page.waitForEvent('download');await page.locator('#export-json').click();
  return JSON.parse(await readFile(await (await pending).path(),'utf8'));
}

test('centripetal tour supplies its radius on entry and completes both rotation speeds before analysis',async({page},info)=>{
  await enter(page,'centripetal');
  await expect(page.getByLabel('기록할 회전 반지름')).toHaveValue('20');
  await expect(page.getByLabel('미터로 환산한 회전 반지름')).toHaveText('0.2');
  await connect(page);await page.locator('#start-recording').click();
  await page.clock.runFor(181000);
  await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-recording-state','ended');
  await page.locator('#measurement-analyze').click();
  await expect(page.locator('#centripetal-workspace')).toBeVisible();
  const file=await download(page);
  expect(file.samples).toHaveLength(1800);
  expect(file.run.context.setup.centripetalRadiusM).toBe('0.2');
  expect(file.events.filter(e=>e.type==='measurement-end')).toHaveLength(1);
  expect(file.events.filter(e=>e.type==='note')).toHaveLength(0);
  expect(file.samples[1200].values.accelerationStrength).toBeGreaterThan(file.samples[500].values.accelerationStrength+2);
  const book=file.workspace.bySource.recorded.centripetal;
  expect(book.sheets[0].inputs.radius).toBe('0.2');
  await page.screenshot({path:info.outputPath('centripetal-tour-analysis.png'),fullPage:true});
});

test('Gay-Lussac replays actual values and scheduled water and incident memos without consuming paused time',async({page},info)=>{
  await enter(page,'gay-lussac');await connect(page);
  await page.clock.runFor(40000);
  await expect(page.locator('#lab-events tr')).toHaveCount(0);
  await page.locator('#start-recording').click();await page.clock.runFor(30000);
  await page.locator('#pause-recording').click();
  await page.clock.runFor(40000);
  await expect(page.locator('#lab-events tr')).toHaveCount(0);
  await page.locator('#resume-recording').click();await page.clock.runFor(10000);
  await expect(page.locator('#lab-events tr')).toHaveCount(1);
  await page.clock.runFor(38000);
  await expect(page.locator('#lab-events tr')).toHaveCount(3);
  await page.clock.runFor(105000);
  await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-recording-state','ended');
  await expect(page.locator('#lab-events tr')).toHaveCount(7);
  await page.screenshot({path:info.outputPath('gay-lussac-tour-memos.png'),fullPage:true});
  await page.locator('#measurement-analyze').click();
  const file=await download(page);
  expect(file.samples).toHaveLength(1800);
  expect(file.samples[0].values).toEqual({temperatureC:29.26,pressureHpa:1006.11215714444});
  const notes=file.events.filter(e=>e.type==='note');expect(notes).toHaveLength(7);
  const fall=notes.find(e=>e.payload.note.includes('병 넘어짐'));
  expect(fall).toBeTruthy();
  // The marker follows the same recorded sample despite preview time and pause.
  expect(Math.abs(fall.receivedAt-file.samples[747].receivedAt)).toBeLessThan(100);
  expect(file.samples[750].values.temperatureC).toBeLessThan(file.samples[740].values.temperatureC);
  expect(file.samples[750].values.pressureHpa).toBeGreaterThan(file.samples[740].values.pressureHpa);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:info.outputPath('gay-lussac-tour-analysis-mobile.png'),fullPage:true});
});
