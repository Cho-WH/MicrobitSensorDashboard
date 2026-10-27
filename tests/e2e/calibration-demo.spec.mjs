import {test,expect} from '@playwright/test';

// A graphics failure must never hide the instructions or block the device's completion response.
// Device facts are injected explicitly; this does not verify physical compass calibration.
for(const failure of ['loading','webgl','context-loss']) {
  test(`compass guidance survives ${failure}`,async({page})=>{
    if(failure==='loading')await page.route('**/magnetometer/calibration-scene.js',route=>route.abort());
    if(failure==='webgl')await page.addInitScript(()=>{
      const getContext=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){
        return type.startsWith('webgl')?null:getContext.call(this,type,...args);
      };
    });
    await page.goto('/tests/browser/');
    await page.evaluate(async()=>{
      const {mountLabFixture}=await import('/tests/browser/lab-fixture.js');
      const {createGuideView}=await import('/src/ui/guide-view.js');
      const {getExperiment}=await import('/src/catalog/index.js');
      const fixture=await mountLabFixture({component:true});fixture.showScreen('prepare');
      const view=createGuideView(fixture.host.querySelector('#guide-host'),{
        onDeviceAction:action=>{if(action==='calibrate')window.showCalibrationPhase('calibrating');},
      });
      window.showCalibrationPhase=(phase)=>view.render({attemptId:'compass-demo',connected:true,
        canConnect:true,receptionReady:phase==='receiving',calibration:phase==='receiving'?'device-reported':'unknown',
        devicePreparation:{phase,allowReadings:phase==='receiving'}});
      window.disposeCalibration=()=>{view.dispose();fixture.dispose();};
      view.open(getExperiment('magnetometer'),{reset:true});
      window.showCalibrationPhase('handshake');fixture.host.querySelector('[data-guide-group="connection"]').click();
      window.showCalibrationPhase('choice');
    });
    try {
      await page.getByRole('button',{name:'보정 시작',exact:true}).click();
      const demo=page.locator('.magnetic-demo');await demo.scrollIntoViewIfNeeded();
      if(failure==='context-loss') {
        await expect(demo.locator('canvas')).toBeVisible();
        await demo.locator('canvas').evaluate(canvas=>canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
      }
      await expect(demo.locator('img')).toBeVisible();
      await expect.poll(()=>demo.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
      await expect(demo.locator('canvas')).toBeHidden();
      await expect(page.getByRole('link',{name:/공식 보정 영상/})).toBeVisible();
      await expect(page.locator('.magnetic-preparation')).toHaveAttribute('data-phase','calibrating');
      await page.evaluate(()=>window.showCalibrationPhase('receiving'));
      await expect(page.locator('.guide-reception')).toBeVisible();
      await expect(page.locator('[data-guide-action="measure"]')).toBeEnabled();
    } finally {await page.evaluate(()=>window.disposeCalibration());}
  });
}
