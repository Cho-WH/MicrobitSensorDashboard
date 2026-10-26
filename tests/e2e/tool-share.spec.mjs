import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { entryRoutes } from '../../src/app/routes.js';
import { publicBaseUrl } from '../../src/app/deployment.js';

const inline = page => page.locator('#tool-share-inline');
const modal = page => page.locator('#tool-share-dialog');
async function preview(page, route = 'activities/gay-lussac/') {
  await page.goto('/' + route + '?view=preview&mock=1');
  await expect(page.locator('[data-screen="preview"]')).toBeVisible();
}
async function stubClipboard(page, reject = false) {
  await page.addInitScript(reject => {
    window.copiedLinks = [];
    Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{
      async writeText(text) { if (reject) throw new Error('clipboard denied'); window.copiedLinks.push(text); }
    }});
  }, reject);
}

test('desktop preview shares the correct tool and exports an opaque, sharp PNG of the same QR', async ({page}) => {
  await stubClipboard(page); await preview(page);
  const pane = inline(page), expected = publicBaseUrl + 'activities/gay-lussac/?view=preview';
  await expect(pane.locator('svg')).toBeVisible();
  await expect(page.locator('.tool-share-mobile')).toBeHidden();
  await pane.getByRole('button', {name:'링크 복사', exact:true}).click();
  expect(await page.evaluate(() => window.copiedLinks)).toEqual([expected]);
  const enlarge = pane.getByRole('button', {name:'크게 보기'});
  await enlarge.click(); await expect(modal(page)).toBeVisible();
  expect(await modal(page).locator('svg').innerHTML()).toBe(await pane.locator('svg').innerHTML());
  await page.keyboard.press('Escape'); await expect(enlarge).toBeFocused();

  const download = page.waitForEvent('download');
  await pane.getByRole('button', {name:'QR 저장'}).click();
  const file = await download; expect(file.suggestedFilename()).toBe('gay-lussac-qr.png');
  const bytes = await readFile(await file.path());
  const raster = await page.evaluate(async encoded => {
    const blob = await (await fetch('data:image/png;base64,' + encoded)).blob(), image = await createImageBitmap(blob);
    const svg = document.querySelector('#tool-share-inline svg'), modules = svg.viewBox.baseVal.width;
    const dark = new Set([...svg.querySelector('path').getAttribute('d').matchAll(/M(\d+),(\d+)/g)].map(m => m[1] + ',' + m[2]));
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const scale = image.width / modules; let mismatches = 0;
    for (let y=0;y<modules;y++) for (let x=0;x<modules;x++) {
      const [r,g,b,a] = ctx.getImageData(Math.floor((x+.5)*scale),Math.floor((y+.5)*scale),1,1).data;
      if (a !== 255 || (dark.has(x+','+y) ? r>40 || g>40 || b>60 : r!==255 || g!==255 || b!==255)) mismatches++;
    }
    image.close(); return {width:canvas.width,height:canvas.height,scale,mismatches};
  }, bytes.toString('base64'));
  expect(raster.width).toBeGreaterThanOrEqual(1024); expect(raster.height).toBe(raster.width);
  expect(Number.isInteger(raster.scale)).toBe(true); expect(raster.mismatches).toBe(0);
  await page.locator('#activate-experiment').click(); await expect(pane).toBeHidden();
  await expect(modal(page)).toBeHidden();
});

test('mobile sharing opens beside the title, supports manual copying and returns focus without overflow', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await stubClipboard(page, true); await preview(page);
  await expect(inline(page)).toBeHidden();
  const open = page.getByRole('button', {name:'도구 공유',exact:true});
  await open.click(); await expect(modal(page).locator('svg')).toBeVisible();
  await modal(page).getByRole('button', {name:'링크 복사',exact:true}).click();
  const address = modal(page).getByRole('textbox');
  await expect(address).toHaveValue(publicBaseUrl + 'activities/gay-lussac/?view=preview');
  await expect(address).toBeFocused();
  await page.setViewportSize({width:320,height:568});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await modal(page).evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  const download = page.waitForEvent('download'); await modal(page).getByRole('button', {name:'QR 저장'}).click();
  expect((await download).suggestedFilename()).toBe('gay-lussac-qr.png');
  await modal(page).getByRole('button', {name:'닫기',exact:true}).click(); await expect(open).toBeFocused();
});

test('changing preview targets refreshes both the copied link and encoded QR for every registered tool', async ({page}) => {
  await stubClipboard(page); await preview(page, entryRoutes[0].path);
  for (const entry of entryRoutes) {
    await page.evaluate(path => { history.pushState(null,'','/' + path + '?view=preview&mock=1'); window.dispatchEvent(new PopStateEvent('popstate')); }, entry.path);
    const expected = publicBaseUrl + entry.path + '?view=preview';
    await expect.poll(() => page.evaluate(url => {
      const svg = document.querySelector('#tool-share-inline svg');
      if (!svg || !window.SimpleQRCode) return false;
      const wanted = new DOMParser().parseFromString(window.SimpleQRCode.toSvg(url), 'image/svg+xml');
      return svg.querySelector('path').getAttribute('d') === wanted.querySelector('path').getAttribute('d');
    }, expected)).toBe(true);
    await inline(page).getByRole('button', {name:'링크 복사',exact:true}).click();
    expect(await page.evaluate(() => window.copiedLinks.at(-1))).toBe(expected);
  }
  // Preview sharing must never create a measurement record.
  expect(await page.evaluate(async () => {
    const {createRepository} = await import('/src/data/repository.js'); const repo=createRepository();
    try { return (await repo.listRuns()).length; } finally { repo.close(); }
  })).toBe(0);
});

test('QR loading failure preserves link copying and normal experiment preparation', async ({page}) => {
  await stubClipboard(page); await page.route('**/vendor/qrcodegen.js', route => route.abort()); await preview(page);
  await expect(inline(page).getByRole('status')).toContainText('QR을 만들지 못했어요');
  await expect(inline(page).getByRole('button', {name:'QR 저장'})).toBeDisabled();
  await inline(page).getByRole('button', {name:'링크 복사',exact:true}).click();
  expect(await page.evaluate(() => window.copiedLinks.at(-1))).toBe(publicBaseUrl + 'activities/gay-lussac/?view=preview');
  await page.locator('#activate-experiment').click(); await expect(page.locator('[data-screen="prepare"]')).toBeVisible();
});
