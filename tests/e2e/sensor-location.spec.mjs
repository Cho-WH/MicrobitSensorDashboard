import { test, expect } from '@playwright/test';

// Protect first-entry guidance without interrupting measurement or trapping focus.
for(const sensor of ['magnetometer','accelerometer','temperature','light-level']) {
  test(`${sensor}: first-entry sensor guide${sensor==='light-level'?' and shared recording flow':''}`,async({page})=>{
    const sharedFlow=sensor==='light-level';
    await page.clock.install();
    await page.goto(`/sensors/${sensor}/?mock=1${sharedFlow?'':'&view=measure'}`);
    if(sharedFlow) {
      await page.locator('[data-guide-group="connection"]').click();
      await page.locator('[data-guide-action="connect"]').click();
      await page.clock.runFor(3100);
      await expect(page.locator('[data-guide-step="reception"]')).toHaveAttribute('data-complete','true');
      await page.locator('#to-measure').click();
    }
    const dialog=page.locator('.experiment-guide');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h2')).toBeFocused();
    await expect.poll(()=>dialog.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    if(sensor==='light-level') {
      await page.setViewportSize({width:320,height:640});
    }
    await dialog.locator('[data-guide-next]').click();
    await expect(page.locator('#show-experiment-guide')).toBeFocused();
    // Common reopen/focus/recording behavior needs one representative sensor.
    if(!sharedFlow)return;
    await page.locator('#start-recording').click();
    await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-recording-state','recording');
    await page.locator('[data-view="analysis"]').click();
    await page.locator('[data-view="measure"]').click();
    await expect(dialog).toBeHidden();
    await page.locator('#show-experiment-guide').click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-guide-recording]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#show-experiment-guide')).toBeFocused();
    await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-recording-state','recording');
  });
}

test('sensor switching preserves seen guides and the activity guide still supports paging',async({page})=>{
  await page.goto('/tests/browser/');
  await page.evaluate(async()=>{
    const {mountLabFixture}=await import('/tests/browser/lab-fixture.js');
    const {createExperimentGuide}=await import('/src/ui/experiment-guide.js');
    const {getExperiment}=await import('/src/catalog/index.js');
    const {host}=await mountLabFixture({component:true});
    const guide=createExperimentGuide(host);
    window.showTestGuide=(sensor,activity=null,automatic=true)=>guide.show(getExperiment(sensor,activity),{automatic});
    window.showTestGuide('temperature');
  });
  const dialog=page.locator('.experiment-guide');
  await dialog.locator('[data-suppress-guide]').check();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>window.showTestGuide('accelerometer'))).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>window.showTestGuide('temperature'))).toBe(false);
  expect(await page.evaluate(()=>window.showTestGuide('temperature',null,false))).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>window.showTestGuide('bmp280','gay-lussac'))).toBe(true);
  const tabs=dialog.locator('nav button');
  await tabs.first().focus();await page.keyboard.press('End');
  await expect(tabs.last()).toBeFocused();
  await expect(dialog.locator('section').last()).toBeVisible();
  await dialog.locator('[data-guide-next]').click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(()=>window.showTestGuide('accelerometer'))).toBe(false);
});
