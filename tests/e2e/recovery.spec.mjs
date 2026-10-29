import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// The default DB belongs only to this isolated Playwright BrowserContext.
// A new page loses all controller/module memory while retaining actual disk state.
async function snapshot(page, id, excludeId) {
  return page.evaluate(async ({ id, excludeId }) => {
    const { createRepository } = await import('/src/data/repository.js');
    const repo = createRepository();
    try {
      const selected = id ?? (await repo.listRuns()).find(run => run.id !== excludeId)?.id;
      return selected ? await repo.readSnapshot(selected) : null;
    }
    finally { repo.close(); }
  }, { id, excludeId });
}

test('closed recording page restores saved samples and analysis without reconnecting; downloaded JSON reopens independently', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.goto('/sensors/accelerometer/?mock=1&view=measure');
  await page.locator('.experiment-guide [data-guide-next]').click();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
  await page.locator('.luminous-settings').click();
  await page.locator('#connect').click();
  await expect(page.locator('#start-recording')).toBeEnabled();
  await page.locator('.luminous-close').click();
  await page.locator('#start-recording').click();
  await expect.poll(async () => (await snapshot(page))?.samples.length ?? 0).toBeGreaterThanOrEqual(10);
  await page.locator('[data-view="analysis"]').click();
  await page.locator('#tab-relationship').click();
  await page.locator('#use-graph-for-reflection').click();
  const answer = '기록 중에 작성한 분석을 다시 열어 확인한다.';
  await page.locator('#reflection-observation').fill(answer);
  await expect.poll(async () => (await snapshot(page))?.workspace?.bySource?.recorded?.reflection?.answers?.observation).toBe(answer);
  const before = await snapshot(page);
  expect(before.run.status).toBe('open');
  // No finish/dispose call: emulate a closed tab, not the in-app exit flow.
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto('/lab.html?mock=1&view=saved');
  await expect(reopened.locator('#saved-runs li')).toHaveCount(1);
  await reopened.locator('#saved-runs li button').first().click();
  await expect(reopened.locator('[data-screen="analysis"]')).toBeVisible();
  await reopened.locator('#tab-interpretation').click();
  await expect(reopened.locator('#reflection-observation')).toHaveValue(answer);
  await expect.poll(async () => (await snapshot(reopened, before.run.id)).run.status).toBe('interrupted');
  const restored = await snapshot(reopened, before.run.id);
  expect(restored.samples.slice(0, before.samples.length)).toEqual(before.samples);
  expect(restored.workspace.bySource.recorded.reflection).toEqual(before.workspace.bySource.recorded.reflection);
  expect(restored.events.filter(e => e.type === 'interrupted')).toHaveLength(1);
  await reopened.locator('[data-view="measure"]').click();
  await reopened.locator('.experiment-guide [data-guide-next]').click();
  await expect(reopened.locator('#connect')).toBeEnabled();
  await expect(reopened.locator('#disconnect')).toBeDisabled();
  await expect(reopened.locator('#pause-recording')).toBeDisabled();

  await reopened.locator('.luminous-export summary').click();
  const downloadPromise = reopened.waitForEvent('download');
  await reopened.locator('#export-json').click();
  const download = await downloadPromise;
  const text = await readFile(await download.path(), 'utf8'), exported = JSON.parse(text);
  expect(exported.samples).toEqual(restored.samples);
  expect(exported.workspace.bySource.recorded.reflection).toEqual(restored.workspace.bySource.recorded.reflection);
  await reopened.locator('#file-input').setInputFiles({ name: '복원.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(reopened.locator('[data-screen="analysis"]')).toBeVisible();
  // Closing the old workspace can update its timestamp after import. Identify
  // the independent copy by ID, not by its position in the recently-saved list.
  await expect.poll(async () => (await snapshot(reopened, undefined, before.run.id))?.run.id).toBeTruthy();
  const imported = await snapshot(reopened, undefined, before.run.id);
  expect(imported.samples.map(({ runId, ...row }) => row)).toEqual(restored.samples.map(({ runId, ...row }) => row));
  expect(imported.workspace.bySource.recorded.reflection).toEqual(restored.workspace.bySource.recorded.reflection);
  expect((await snapshot(reopened, before.run.id)).samples).toEqual(restored.samples);
});


test('reload restores this tab and reconnect replaces the record action without automatic recording', async ({page}) => {
  await page.goto('/sensors/accelerometer/?mock=1&view=measure');
  await page.locator('.experiment-guide [data-guide-next]').click();
  await page.locator('#measurement-reconnect').click();
  await expect(page.locator('#start-recording')).toBeEnabled();
  // Recording actions must remain correct without the decorative theme.
  await page.evaluate(()=>delete document.documentElement.dataset.visualTheme);
  await expect(page.locator('#start-recording')).toBeVisible();
  for (const id of ['pause-recording','resume-recording','finish-recording']) await expect(page.locator('#'+id)).toBeHidden();
  await page.locator('#start-recording').click();
  await expect(page.locator('#start-recording')).toBeHidden();
  await expect(page.locator('#resume-recording')).toBeHidden();
  await expect(page.locator('#pause-recording')).toBeVisible();
  await expect(page.locator('#finish-recording')).toBeVisible();
  await page.evaluate(()=>{document.documentElement.dataset.visualTheme='luminous';});
  await expect.poll(async () => (await snapshot(page))?.samples.length ?? 0).toBeGreaterThanOrEqual(10);
  const before = await snapshot(page);
  await page.locator('[data-recording-mode="point"]').click();
  await expect(page.locator('#continuous-recording')).toHaveAttribute('aria-checked','true');
  page.on('dialog',dialog=>dialog.accept());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-app-state','ready');
  await expect(page.locator('[data-screen="measure"]')).toBeVisible();
  await expect(page.locator('.experiment-guide[open]')).toHaveCount(0);
  await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-recording-mode','point');
  await expect(page.locator('#continuous-recording')).toHaveAttribute('aria-checked','true');
  await expect(page.locator('#measurement-reconnect')).toBeVisible();
  await expect(page.locator('#resume-recording')).toBeHidden();
  const restored=await snapshot(page,before.run.id);
  expect(restored.samples.slice(0,before.samples.length)).toEqual(before.samples);
  expect((await page.evaluate(async()=>{const {createRepository}=await import('/src/data/repository.js'); const repo=createRepository(); try{return await repo.listRuns();}finally{repo.close();}}))).toHaveLength(1);
  await page.locator('#measurement-reconnect').click();
  await expect(page.locator('#resume-recording')).toBeEnabled();
  await expect(page.locator('#measurement-reconnect')).toBeHidden();
  expect((await snapshot(page,before.run.id)).samples).toEqual(restored.samples);
  await page.locator('#resume-recording').click();
  await expect.poll(async () => (await snapshot(page,before.run.id)).samples.length).toBeGreaterThan(restored.samples.length);
});


for (const sensor of ['temperature','magnetometer']) for (const permitted of [true,false]) test(sensor+' connection action reaches fresh readings with '+(permitted?'a remembered permission':'the chooser fallback'), async ({page}) => {
  await page.route('**/tests/fixtures/bluetooth-diagnostics.mjs', route=>route.fulfill({contentType:'application/javascript',path:'tests/fixtures/bluetooth-diagnostics.mjs'}));
  await page.addInitScript(permitted => {
    sessionStorage.setItem('sensor-lab:last-device','test-device-only');
    const fixture=import('/tests/fixtures/bluetooth-diagnostics.mjs').then(({bluetoothFixture})=>window.connectionFixture=bluetoothFixture());
    const bluetooth={requestDevice(){
      if (permitted || !navigator.userActivation.isActive) return Promise.reject(new Error('unexpected chooser or lost click activation'));
      return fixture.then(f=>f.device);
    }};
    if(permitted) bluetooth.getDevices=()=>fixture.then(f=>[f.device]);
    Object.defineProperty(navigator,'bluetooth',{configurable:true,value:bluetooth});
  },permitted);
  await page.goto('/sensors/'+sensor+'/?view=measure');
  await expect(page.locator('html')).toHaveAttribute('data-app-state','ready');
  await page.locator('.experiment-guide .experiment-guide-close').click();
  await expect(page.locator('#start-recording')).toBeHidden();
  await page.locator('#measurement-reconnect').click();
  await expect(page.locator('#measurement-reconnect')).toBeHidden();
  await expect(page.locator('[data-screen="measure"]')).toBeVisible();
  if(sensor==='magnetometer') {
    await page.evaluate(()=>window.connectionFixture.line('@mag,2,choice\n'));
    await expect(page.locator('[data-screen="measure"]')).toBeVisible();
    expect(await page.evaluate(()=>window.connectionFixture.writes)).toContain('skip\n');
    await page.evaluate(()=>window.connectionFixture.line('1,2,3,4\n'));
    await expect(page.locator('#start-recording')).toBeDisabled();
    await page.evaluate(()=>window.connectionFixture.line('@mag,2,skipped\n'));
  }
  for(let i=0;i<4;i++) {await page.evaluate(sensor=>window.connectionFixture.line(sensor==='magnetometer'?'1,2,3,4\n':'26\n'),sensor);await page.waitForTimeout(400);}
  await expect(page.locator('[data-screen="measure"]')).toBeVisible();
  await expect(page.locator('#start-recording')).toBeEnabled();
});
