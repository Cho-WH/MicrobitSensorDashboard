import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { blankSheet, intervalModel, calculationModel } from '../../src/analysis/activities/centripetal.js';
import { getExperiment } from '../../src/catalog/index.js';

// The submitted artifact must preserve student answers and remain two A4 pages,
// including on narrow screens and with the maximum supported answer length.
test('report preserves answers in fixed pages and exports both page images',async({page},testInfo)=>{
  const origin=Date.UTC(2026,9,31),context=getExperiment('motion-magnetic','centripetal');
  const samples=Array.from({length:61},(_,n)=>({sampleId:n+1,receivedAt:origin+2000+n*100,
    values:{accelerationStrength:12.25,magneticStrength:50+20*Math.cos(n*Math.PI/5)},validity:{accelerationStrength:'valid',magneticStrength:'valid'}}));
  const sheet={...blankSheet(1),startId:1,endId:61,meanRequested:true};
  Object.assign(sheet.inputs,{n:'6',period:'1',radius:'0.2',omega:'6.28',sensor:'7.35',orbital:'7.89',difference:'0.54',percentDifference:'7.1',
    thinking:'센서 가속도의 제곱에서 9.8의 제곱을 뺀 뒤 제곱근을 구했다. √(12.25² − 9.8²) = 7.35 m/s²',
    orbitalThinking:'6초 동안 6회 회전했으므로 주기는 1초이다. ω = 2π / 1 = 6.28 rad/s, a = 0.2 × 6.28² = 7.89 m/s²',
    evidenceText:'주기로 구한 값이 0.54 m/s² 더 컸다. 백분율 차이는 7.1%로, 두 방법의 결과가 비슷하지만 완전히 같지는 않았다.',
    differenceReason:'회전 반지름을 센서의 중심이 아니라 보드 끝까지 재었다. 반지름이 실제보다 크게 입력되어 주기로 구한 구심가속도가 더 크게 나왔을 수 있다.',
    improvement:'반지름을 크게 측정하면 주기로 구한 구심가속도도 커지므로 내 결과와 방향이 맞는다. 센서 중심까지 반지름을 다시 재고 같은 빠르기로 회전시켜 두 결과의 차이가 줄어드는지 확인하겠다.',
    roles:'나는 반지름과 회전수를 측정했고, 모둠원과 그래프의 반복 간격을 함께 확인했다.'});
  const interval=intervalModel(sheet,samples),options={model:{sheet,interval,...calculationModel(sheet,interval)},samples,context,origin,createdAt:origin,name:'원운동 탐구 · 1차 측정'};
  await page.goto('/lab.html');
  await page.evaluate(async options=>{await (await import('/src/ui/centripetal/export.js')).exportWorksheet('preview',options);},options);
  const dialog=page.getByRole('dialog',{name:'구심가속도 활동지'}),pages=dialog.getByRole('document');
  await expect(pages).toHaveCount(2);
  for(const [index,key] of ['thinking','orbitalThinking','evidenceText','differenceReason','improvement','roles'].entries())await expect(dialog).toContainText(sheet.inputs[key]);
  await page.evaluate(()=>{window.print=()=>{window.__reportPrint=true;};});
  await dialog.getByRole('button',{name:'인쇄',exact:true}).click();
  expect(await page.evaluate(()=>window.__reportPrint)).not.toBe(true);
  await expect(dialog.getByLabel('학급',{exact:true})).toBeFocused();
  await expect(dialog.getByRole('status')).toBeVisible();
  await dialog.getByLabel('학급',{exact:true}).fill('2학년 3반');
  await dialog.getByRole('button',{name:'이미지로 저장'}).click();
  await expect(dialog.getByLabel('학번',{exact:true})).toBeFocused();
  await dialog.getByLabel('학번',{exact:true}).fill('12');
  await dialog.getByRole('button',{name:'인쇄',exact:true}).click();
  await expect(dialog.getByLabel('이름',{exact:true})).toBeFocused();
  await dialog.getByLabel('이름',{exact:true}).fill('김탐구');
  await expect(pages.first()).toContainText('김탐구');
  await dialog.screenshot({path:testInfo.outputPath('report-preview-desktop.png')});
  const saved=page.waitForEvent('download');await dialog.getByRole('button',{name:'이미지로 저장'}).click();
  const file=await saved,path=testInfo.outputPath('report.png');await file.saveAs(path);
  const png=await readFile(path);expect(png.subarray(1,4).toString()).toBe('PNG');expect(png.readUInt32BE(16)/png.readUInt32BE(20)).toBeCloseTo(210/594,2);
  // Capture the actual print route while replacing only the OS print dialog.
  await page.evaluate(()=>{window.print=()=>{window.__reportPrint=true;};});
  await dialog.getByRole('button',{name:'인쇄',exact:true}).click();expect(await page.evaluate(()=>window.__reportPrint)).toBe(true);
  await page.evaluate(()=>document.body.classList.add('cp-printing'));
  const pdf=await page.pdf({path:testInfo.outputPath('report.pdf'),preferCSSPageSize:true,printBackground:true});
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
  await page.evaluate(()=>document.body.classList.remove('cp-printing'));
  await dialog.getByRole('button',{name:'닫기',exact:true}).click();
  const long='측정한 값을 근거로 설명합니다. <script>입력은 글자로 보존</script> & '.repeat(80).slice(0,3000);
  for(const key of ['thinking','orbitalThinking','evidenceText','differenceReason','improvement','roles'])options.model.sheet.inputs[key]=long;
  Object.assign(options.model.sheet.inputs,{reportClass:'2학년 3반',reportNumber:'12',reportName:'김탐구'});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(async options=>{await (await import('/src/ui/centripetal/export.js')).exportWorksheet('preview',options);},options);
  await expect(pages).toHaveCount(2);
  const fitted=await pages.evaluateAll(pages=>pages.flatMap(page=>[...page.querySelectorAll('text')].filter(text=>text.textContent.startsWith('측정한 값을 근거로')).map(text=>({text:text.textContent,bounds:{x:text.getBBox().x,y:text.getBBox().y,width:text.getBBox().width,height:text.getBBox().height},size:Number(text.getAttribute('font-size'))}))));
  expect(fitted).toHaveLength(6);
  for(const answer of fitted){expect(answer.text).toBe(long);expect(answer.size).toBeLessThan(12);expect(answer.bounds.y+answer.bounds.height).toBeLessThan(1070);}
  await expect(dialog.locator('script')).toHaveCount(0);
  await dialog.screenshot({path:testInfo.outputPath('report-preview-mobile.png')});
  const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'이미지로 저장'}).click();await (await download).saveAs(testInfo.outputPath('report-long.png'));
  await page.evaluate(()=>document.body.classList.add('cp-printing'));
  const longPdf=await page.pdf({path:testInfo.outputPath('report-long.pdf'),preferCSSPageSize:true,printBackground:true});
  expect(longPdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
});
