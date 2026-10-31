import { test, expect } from '@playwright/test';
import { installSimulatedHardware } from './support/tour.mjs';

test('Gay-Lussac records continuously and retains selected-point analysis after reload', async ({page,context}, testInfo) => {
  await installSimulatedHardware(context,'bmp280');
  await page.goto('/activities/gay-lussac/?view=measure');
  await page.locator('.experiment-guide[open] .experiment-guide-close').click();
  await expect(page.locator('button[data-recording-mode="continuous"]')).toBeVisible();
  await expect(page.locator('button[data-recording-mode="point"]')).toBeHidden();
  await expect(page.locator('#continuous-recording')).toBeHidden();
  await page.locator('#measurement-reconnect').click();
  await page.locator('#start-recording').click();
  await expect(page.locator('#capture-continuous-point')).toBeEnabled();
  await page.locator('#capture-continuous-point').click();
  await page.locator('#point-panel summary').click();
  await expect(page.locator('#point-recording tbody tr')).toHaveCount(1);
  await page.locator('#analyze-points').click();
  await expect(page.locator('#analysis-source')).toHaveValue('points');
  await expect.poll(()=>page.evaluate(()=>{
    const chart=Chart.getChart(document.querySelector('#analysis-chart'));
    return chart?.data.datasets.flatMap(series=>series.data).filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)).length??0;
  })).toBeGreaterThan(0);
  await page.locator('#analysis-source').selectOption('recorded');
  await expect(page.locator('#analysis-source')).toHaveValue('recorded');
  await page.locator('[data-view="measure"]').click();
  await page.locator('#finish-recording').click();
  const expected = await page.evaluate(async()=>{
    const {createRepository}=await import('/src/data/repository.js');
    const repo=createRepository();
    try {
      const snapshot=await repo.readSnapshot((await repo.listRuns())[0].id);
      const sample=snapshot.samples.find(row=>row.sampleId===snapshot.pointRecords[0].capturedSampleId);
      return ['temperatureC','pressureHpa'].map(id=>{
        const channel=snapshot.run.context.channels.find(channel=>channel.id===id);
        return {name:channel.name,value:sample.values[id].toLocaleString('ko-KR',{maximumFractionDigits:channel.digits??2})+'\u00a0'+channel.unit};
      });
    } finally {repo.close();}
  });
  for(const {name,value} of expected) {
    const headings=await page.locator('#point-recording thead th').allTextContents();
    const index=headings.indexOf(name);
    expect(index).toBeGreaterThanOrEqual(0);
    await expect(page.locator('#point-recording tbody tr').first().locator('th, td').nth(index)).toHaveText(value);
  }
  await page.screenshot({path:testInfo.outputPath('gay-lussac-desktop.png'),fullPage:true});
  await page.setViewportSize({width:360,height:800});
  await page.screenshot({path:testInfo.outputPath('gay-lussac-mobile.png'),fullPage:true});
  await page.reload();
  await expect(page.locator('#continuous-recording')).toBeHidden();
  await expect(page.locator('button[data-recording-mode="point"]')).toBeHidden();
  await expect(page.locator('#point-recording')).toBeVisible();
  await page.locator('[data-view="analysis"]').click();
  await page.locator('#analysis-source').selectOption('points');
  await expect(page.locator('#analysis-source')).toHaveValue('points');
});
