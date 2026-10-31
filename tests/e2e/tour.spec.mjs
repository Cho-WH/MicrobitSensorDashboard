import {test,expect} from '@playwright/test';
import {chooseTourDevice} from './support/tour.mjs';
import {readFile} from 'node:fs/promises';

const count=async page=>Number((await page.locator('#sample-count').textContent()).replace(/\D/g,''));
async function download(page) {
  await page.locator('.luminous-export > summary').click();
  const pending=page.waitForEvent('download');await page.locator('#export-json').click();
  return JSON.parse(await readFile(await (await pending).path(),'utf8'));
}

test('tour chooser, paused one-minute replay and automatic finish preserve data without writing real records',async({page},info)=>{
  await page.clock.install();
  await page.goto('/sensors/accelerometer/?view=preview');
  await page.locator('#preview-tour').click();
  await expect(page).toHaveURL(/mock=1/);
  await expect(page.locator('#tour-status')).toBeVisible();
  if(await page.locator('.experiment-guide').isVisible())await page.locator('.experiment-guide .experiment-guide-close').click();
  await page.locator('#measurement-reconnect').click();
  const picker=page.getByRole('dialog',{name:'연결할 micro:bit 선택'});
  await expect(picker.getByRole('button',{name:'연결',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#measurement-reconnect')).toBeEnabled();
  await page.locator('#measurement-reconnect').click();
  await page.setViewportSize({width:390,height:844});
  await expect(picker.getByRole('radio')).toBeVisible();
  await picker.screenshot({path:info.outputPath('device-picker-mobile.png')});
  await chooseTourDevice(page);
  await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-connection-state','connecting');
  await expect(page.locator('#start-recording')).toBeEnabled();
  await page.locator('#start-recording').click();await page.clock.runFor(3000);
  await page.locator('#pause-recording').click();const paused=await count(page);
  await page.clock.runFor(5000);expect(await count(page)).toBe(paused);
  await page.locator('#resume-recording').click();await page.clock.runFor(61000);
  await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-recording-state','ended');
  await expect(page.locator('#measurement-analyze')).toBeEnabled();
  const completed=await count(page);expect(completed).toBe(600);
  await page.clock.runFor(2000);expect(await count(page)).toBe(completed);
  await page.screenshot({path:info.outputPath('measure-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1366,height:900});
  await page.screenshot({path:info.outputPath('measure-desktop.png'),fullPage:true});
  await page.locator('#measurement-analyze').click();
  await expect(page.locator('[data-screen="analysis"]')).toBeVisible();
  const file=await download(page);expect(file.run.source).toBe('replay');expect(file.samples).toHaveLength(600);
  expect(file.events.filter(e=>e.type==='measurement-end')).toHaveLength(1);
  const original=await page.evaluate(async()=>{
    const {createRepository}=await import('/src/data/repository.js');const repository=createRepository();
    try{return await repository.listRuns();}finally{repository.close();}
  });expect(original).toHaveLength(0);
  await page.locator('#exit-tour').click();await page.locator('#leave-save').click();
  await expect(page).toHaveURL(/sensors\/accelerometer\/\?view=preview$/);
  await expect(page.locator('#tour-status')).toBeHidden();
});

test('tour works without hardware or persistent storage and resets after reload',async({page})=>{
  await page.addInitScript(()=>{
    for(const name of ['locks','bluetooth','usb'])Object.defineProperty(navigator,name,{configurable:true,value:undefined});
    Object.defineProperty(window,'indexedDB',{configurable:true,get(){throw new Error('Storage must not be opened during a tour');}});
  });
  await page.clock.install();
  await page.goto('/sensors/temperature/?mock=1&view=measure');
  await page.locator('.experiment-guide .experiment-guide-close').click();
  await page.locator('#measurement-reconnect').click();await chooseTourDevice(page);
  await expect(page.locator('#start-recording')).toBeEnabled();
  await page.locator('#start-recording').click();await page.clock.runFor(61000);
  await expect(page.locator('#additional-recording')).toBeEnabled();
  expect((await download(page)).samples).toHaveLength(60);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-app-state','ready');
  expect(await count(page)).toBe(0);
  await expect(page.locator('[data-view="analysis"]')).toBeDisabled();
  await expect(page.locator('#measurement-reconnect')).toBeEnabled();
});

for(const sensor of ['temperature','light-level','bmp280','ds18b20','magnetometer','mlx90393'])test(`${sensor} tour connects and completes its prepared stream`,async({page})=>{
  await page.clock.install();
  await page.goto(`/sensors/${sensor}/?mock=1&view=measure`);
  await expect(page.locator('html')).toHaveAttribute('data-app-state','ready');
  if(await page.locator('.experiment-guide').isVisible())await page.locator('.experiment-guide .experiment-guide-close').click();
  await page.locator('#measurement-reconnect').click();await chooseTourDevice(page);
  await expect(page.locator('#start-recording')).toBeEnabled();
  await page.locator('#start-recording').click();await page.clock.runFor(61000);
  await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-recording-state','ended');
  const file=await download(page);
  expect(file.samples.length).toBeGreaterThanOrEqual(60);expect(file.samples.length).toBeLessThanOrEqual(600);
  expect(file.samples.every(sample=>Object.values(sample.validity).some(value=>value==='valid'))).toBe(true);
});
