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
