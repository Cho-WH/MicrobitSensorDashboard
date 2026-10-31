import { test, expect } from '@playwright/test';
import { fixture, utc } from '../unit/storage-support.mjs';
import { getExperiment } from '../../src/catalog/index.js';
import { buildExperimentJson } from '../../src/data/files/json.js';

test('worksheet menu confirms named deletion and preserves selection through cancel, undo and reload',async({page},testInfo)=>{
  const {store}=await fixture({context:getExperiment('motion-magnetic','centripetal')});let file;
  try {
    for(let i=0;i<3;i++){
      const values={accelerationX:7.35,accelerationY:0,accelerationZ:-9.8,accelerationStrength:12.25,magneticStrength:50};
      store.appendSample({sampleId:i+1,receivedAt:utc+i*100,values,validity:Object.fromEntries(Object.keys(values).map(key=>[key,'valid']))});
    }
    file=buildExperimentJson(store.getSnapshot());
  }finally{await store.close();}
  await page.goto('/lab.html');
  await expect(page.locator('html')).toHaveAttribute('data-app-state','ready');
  await page.locator('#file-input').setInputFiles({name:'sheets.json',mimeType:'application/json',buffer:Buffer.from(file)});
  const menu=page.locator('[data-cp-sheets]'),trigger=menu.locator('summary');
  await expect(page.locator('[data-cp-panel="worksheet"]')).toBeVisible();
  await page.locator('[data-cp-step="raw"]').click();
  await expect(page.locator('[data-cp-rows] tr')).toHaveCount(3);
  await expect(page.locator('[data-cp-rows] tr').first().locator('td')).toHaveText(['0','12.25','50','7.35','0','-9.8']);
  await page.screenshot({path:testInfo.outputPath('raw-components-desktop.png')});
  await page.locator('[data-cp-step="worksheet"]').click();
  await expect(page.locator('[data-cp-panel="worksheet"]')).toBeVisible();
  await trigger.click();await expect(page.locator('[data-cp-delete="1"]')).toBeDisabled();
  await page.locator('[data-cp-action="new"]').click();
  await trigger.click();await page.locator('[data-cp-action="new"]').click();
  await trigger.click();await page.locator('[data-cp-select="2"]').click();
  await trigger.click();await page.locator('[data-cp-delete="1"]').click();
  const dialog=page.locator('#record-confirm-dialog');
  await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'취소',exact:true}).click();
  await expect(trigger).toBeFocused();
  await trigger.click();await expect(page.locator('[data-cp-select]')).toHaveCount(3);
  await page.locator('[data-cp-delete="1"]').click();await dialog.locator('[data-confirm]').click();
  await trigger.click();await expect(page.locator('[data-cp-select]')).toHaveCount(2);
  await expect(page.locator('[data-cp-select="2"]')).toHaveAttribute('aria-current','true');
  await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
  await page.locator('[data-cp-action="undo"]').click();
  await trigger.click();await expect(page.locator('[data-cp-select]')).toHaveCount(3);
  await expect(page.locator('[data-cp-select="2"]')).toHaveAttribute('aria-current','true');
  await page.screenshot({path:testInfo.outputPath('sheets-desktop.png'),fullPage:true});
  await page.setViewportSize({width:360,height:800});
  await page.screenshot({path:testInfo.outputPath('sheets-mobile.png'),fullPage:true});
  await page.locator('[data-cp-delete="2"]').click();await dialog.locator('[data-confirm]').click();
  await expect(trigger).toBeFocused();
  await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-storage-state','clean');
  await page.reload();await trigger.click();
  await expect(page.locator('[data-cp-select]')).toHaveCount(2);
  await expect(page.locator('[data-cp-select="1"]')).toHaveAttribute('aria-current','true');
  await page.locator('[data-cp-delete="3"]').click();await dialog.locator('[data-confirm]').click();
  await trigger.click();await expect(page.locator('[data-cp-delete="1"]')).toBeDisabled();
});
