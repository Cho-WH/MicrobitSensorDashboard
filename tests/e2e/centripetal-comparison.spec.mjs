import { test, expect } from '@playwright/test';
import { fixture, utc } from '../unit/storage-support.mjs';
import { getExperiment } from '../../src/catalog/index.js';
import { buildExperimentJson } from '../../src/data/files/json.js';

test('comparison gates incomplete work, restores inert drafts and automatically saves edits and exports the current worksheet',async({page},testInfo)=>{
  const context=getExperiment('motion-magnetic','centripetal');context.setup={centripetalRadiusM:'0.2'};
  const {store}=await fixture({context});let file;
  try {
    for(let i=0;i<=120;i++){
      const values={accelerationX:7.35,accelerationY:0,accelerationZ:-9.8,accelerationStrength:12.25,magneticStrength:50+20*Math.cos(i*Math.PI/5)};
      store.appendSample({sampleId:i+1,receivedAt:utc+i*100,values,validity:Object.fromEntries(Object.keys(values).map(key=>[key,'valid']))});
    }
    file=buildExperimentJson(store.getSnapshot());
  }finally{await store.close();}
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/lab.html');
  await expect(page.locator('#activity-cards a[href*="centripetal"]')).toBeVisible();
  await page.locator('#file-input').setInputFiles({name:'comparison.json',mimeType:'application/json',buffer:Buffer.from(file)});
  await expect(page.locator('#centripetal-workspace')).toBeVisible();
  const compare=page.locator('[data-cp-step="compare"]'),panel=page.locator('[data-cp-panel="compare"]');
  const edit=key=>page.locator(`[data-cp-input="${key}"]`);
  for(const button of await compare.all())await expect(button).toBeDisabled();
  await page.locator('[data-cp-action="range"]').click();await page.locator('#cp-time-range-start').fill('2');await page.locator('#cp-time-range-end').fill('8');await page.locator('#cp-apply-time-range').click();
  await page.locator('[data-cp-action="mean"]').click();await edit('n').fill('6');
  for(const button of await compare.all())await expect(button).toBeDisabled();
  await page.locator('[data-cp-adopt="period"]').click();
  // Unit caution alone must never block valid, independently calculated answers.
  for(const [key,value] of Object.entries({radius:'3.01',sensor:'7.35',omega:'6.28'}))await edit(key).fill(value);
  for(const button of await compare.all())await expect(button).toBeDisabled();
  await edit('orbital').fill('7.9');
  for(const button of await compare.all())await expect(button).toBeEnabled();
  await compare.last().click();await expect(panel).toBeVisible();
  await page.locator('[data-cp-action="undo"]').click();
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-cp-revisit="sensor"]')).toBeDisabled();
  await expect(panel.locator('[data-cp-compare-picture] svg')).toHaveCount(0);
  await expect(edit('evidenceText')).toBeDisabled();await expect(panel.locator('[data-cp-comparison-mode]')).toBeDisabled();
  for(const button of await compare.all())await expect(button).toBeDisabled();
  await page.locator('[data-cp-action="redo"]').click();await expect(edit('evidenceText')).toBeEditable();
  await expect(edit('difference')).toHaveValue('');await expect(edit('percentDifference')).toHaveValue('');
  await edit('difference').fill('0.6');await edit('percentDifference').fill('7.5');
  const exports=page.locator('[data-cp-export]');
  await expect(exports).toBeEnabled();
  await edit('evidenceText').fill('처음 비교한 설명');await edit('improvement').fill('회전수를 다시 확인한다.');
  await edit('evidenceText').fill('수정한 비교 설명');await edit('differenceReason').fill('구간 끝에서 회전 간격이 길어졌다.');
  await page.locator('[data-cp-action="evidence"]').click();
  const preview=page.getByRole('dialog',{name:'구심가속도 활동지'});
  await preview.getByLabel('학급',{exact:true}).fill('2학년 1반');
  await preview.getByLabel('학번',{exact:true}).fill('07');
  await preview.getByLabel('이름',{exact:true}).fill('김탐구');
  await expect(preview).toContainText('0.6');await expect(preview).toContainText('7.5');
  await expect(preview).toContainText('수정한 비교 설명');await expect(preview).not.toContainText('처음 비교한 설명');await expect(preview).toContainText('구간 끝에서 회전 간격이 길어졌다.');
  await preview.getByRole('button',{name:'닫기',exact:true}).click();
  await panel.screenshot({path:testInfo.outputPath('comparison-desktop.png')});
  await page.setViewportSize({width:390,height:844});await panel.screenshot({path:testInfo.outputPath('comparison-mobile.png')});
  for(const help of await panel.locator('.cp-error-analysis .cp-help').all()){
    await help.locator(':scope > summary').click();await help.locator('details > summary').click();
    await expect(help.locator('[data-cp-formula] svg')).toBeVisible();
  }
  await panel.locator('.cp-error-analysis').screenshot({path:testInfo.outputPath('comparison-help-mobile.png')});
  await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-storage-state','clean');
  await page.reload();await expect(edit('sensor')).toBeVisible();await compare.first().click();
  await expect(edit('evidenceText')).toHaveValue('수정한 비교 설명');await expect(edit('differenceReason')).toHaveValue('구간 끝에서 회전 간격이 길어졌다.');
  await expect(edit('difference')).toHaveValue('0.6');await expect(edit('percentDifference')).toHaveValue('7.5');
  const switcher=panel.locator('[data-cp-comparison-mode]');
  await switcher.click();
  await expect(edit('differenceReason')).toBeHidden();await expect(edit('agreementReason')).toBeEditable();
  await edit('agreementReason').fill('측정 구간에서 반복되는 신호 간격을 확인했다.');
  await edit('accuracyReflection').fill('센서 상태를 점검하고 다른 방법으로 다시 측정한다.');
  await switcher.click();await expect(edit('differenceReason')).toHaveValue('구간 끝에서 회전 간격이 길어졌다.');
  await page.locator('[data-cp-action="undo"]').click();await expect(edit('accuracyReflection')).toHaveValue('센서 상태를 점검하고 다른 방법으로 다시 측정한다.');
  await page.locator('[data-cp-action="evidence"]').click();
  await expect(preview).toContainText('센서 상태를 점검하고 다른 방법으로 다시 측정한다.');
  await expect(preview.getByLabel('학급',{exact:true})).toHaveValue('2학년 1반');
  await expect(preview.getByLabel('학번',{exact:true})).toHaveValue('07');
  await expect(preview.getByLabel('이름',{exact:true})).toHaveValue('김탐구');
  await expect(preview).not.toContainText('구간 끝에서 회전 간격이 길어졌다.');
  await preview.getByRole('button',{name:'닫기',exact:true}).click();
  await page.setViewportSize({width:1280,height:900});await panel.screenshot({path:testInfo.outputPath('agreement-desktop.png')});
  await page.setViewportSize({width:390,height:844});await panel.screenshot({path:testInfo.outputPath('agreement-mobile.png')});
  await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-storage-state','clean');
  await page.reload();await expect(edit('sensor')).toBeVisible();await compare.first().click();
  await expect(edit('agreementReason')).toHaveValue('측정 구간에서 반복되는 신호 간격을 확인했다.');
  await expect(edit('accuracyReflection')).toHaveValue('센서 상태를 점검하고 다른 방법으로 다시 측정한다.');
  await switcher.click();await expect(edit('differenceReason')).toHaveValue('구간 끝에서 회전 간격이 길어졌다.');
  await expect(edit('improvement')).toHaveValue('회전수를 다시 확인한다.');
  // Revisit goes directly to the appropriate field and keeps written interpretation.
  await page.locator('[data-cp-revisit="sensor"]').click();await expect(edit('sensor')).toBeFocused();
  await edit('sensor').fill('');await edit('sensor').blur();await edit('sensor').fill('8');await compare.last().click();
  await expect(edit('difference')).toHaveValue('');await expect(edit('percentDifference')).toHaveValue('');
  await page.locator('[data-cp-action="undo"]').click();
  await expect(panel).toBeVisible();await expect(edit('evidenceText')).toHaveValue('');await expect(edit('evidenceText')).toBeDisabled();
  await page.locator('[data-cp-action="redo"]').click();await expect(edit('evidenceText')).toHaveValue('수정한 비교 설명');
  await page.locator('[data-cp-revisit="orbital"]').click();await expect(edit('orbital')).toBeFocused();
  await edit('radius').fill('0.3');
  for(const button of await compare.all())await expect(button).toBeDisabled();
  await edit('orbital').press('Enter');
  for(const button of await compare.all())await expect(button).toBeEnabled();
  await compare.last().click();
  await edit('difference').fill('1');await edit('percentDifference').fill('2');
  await edit('difference').fill('0.1');await edit('percentDifference').press('Enter');
  await expect(edit('percentDifference')).toBeEditable();
  await page.locator('[data-cp-revisit="orbital"]').click();await edit('orbital').fill('0');await compare.last().click();
  await expect(edit('difference')).toBeEditable();await expect(edit('percentDifference')).toBeEditable();
  await page.locator('[data-cp-revisit="sensor"]').click();await edit('sensor').fill('0');await compare.last().click();
  await expect(edit('percentDifference')).toBeDisabled();
  await expect(edit('percentDifference')).toHaveValue('');
});
