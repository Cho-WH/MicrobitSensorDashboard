import {test,expect} from '@playwright/test';

test('math loads locally on demand, latest display wins and failures retain readable content',async({page})=>{
  const requests=[];page.on('request',r=>requests.push(r.url()));
  await page.goto('/lab.html');
  await expect(page.locator('html')).toHaveAttribute('data-app-state','ready');
  await page.waitForLoadState('networkidle');
  expect(requests.some(url=>url.includes('mathjax-svg'))).toBe(false);
  await page.evaluate(async()=>{
    const {setMath}=await import('/src/ui/math-view.js');
    const host=document.createElement('div');host.id='math-check';document.body.append(host);
    const old=setMath(host,String.raw`\frac{1}{2}`,'이전 식');
    const latest=setMath(host,String.raw`\sqrt{9.8^2+3^2}`,'현재 식');
    await Promise.all([old,latest]);
  });
  await expect(page.locator('#math-check').getByRole('img',{name:'현재 식'})).toBeVisible();
  expect(requests.some(url=>url.includes('mathjax-svg'))).toBe(true);
  expect(requests.filter(url=>url.includes('mathjax-svg')).every(url=>new URL(url).hostname==='127.0.0.1')).toBe(true);
  await page.evaluate(async()=>{const {setMath}=await import('/src/ui/math-view.js');await setMath(document.querySelector('#math-check'),String.raw`\notAnAllowedCommand{a}`,'수식 설명 유지');});
  await expect(page.locator('#math-check')).toHaveText('수식 설명 유지');
});
