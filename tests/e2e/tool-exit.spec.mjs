import { test, expect } from '@playwright/test';

async function savedSnapshot(page) {
  return page.evaluate(async () => {
    const { createRepository } = await import('/src/data/repository.js');
    const repo = createRepository();
    try { const runs = await repo.listRuns(); return runs.length ? await repo.readSnapshot(runs[0].id) : null; }
    finally { repo.close(); }
  });
}

test('exit confirmation preserves recording on cancel and saves before loading home', async ({ page }) => {
  await page.goto('/sensors/temperature/?mock=1');
  await page.evaluate(() => { window.documentMarker = 'original'; });
  await page.locator('[data-guide-group="connection"]').click();
  await page.locator('[data-guide-action="connect"]').click();
  await expect(page.locator('[data-guide-step="reception"]')).toHaveAttribute('data-complete', 'true');
  await page.locator('#to-measure').click();
  await page.locator('.experiment-guide [data-guide-next]').click();
  await page.locator('#start-recording').click();
  await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-recording-state', 'recording');
  await expect.poll(async () => (await savedSnapshot(page))?.samples.length ?? 0).toBeGreaterThan(0);
  await page.locator('[data-view="analysis"]').click();
  await expect(page.locator('#leave-dialog')).not.toBeVisible();
  await page.locator('#tab-interpretation').click();
  await page.locator('#reflection-observation').fill('도구를 나가도 남아야 하는 관찰');
  await page.getByRole('button', { name: '실험 선택', exact: true }).click();
  await expect(page.locator('#leave-dialog')).toBeVisible();
  await expect(page.locator('#leave-dialog button[value="cancel"]')).toBeFocused();
  await page.locator('#leave-dialog button[value="cancel"]').click();
  await expect(page.locator('[data-screen="analysis"]')).toBeVisible();
  await expect(page.locator('[data-screen="measure"]')).toHaveAttribute('data-recording-state', 'recording');
  expect(await page.evaluate(() => window.documentMarker)).toBe('original');

  await page.getByRole('button', { name: '실험 선택', exact: true }).click();
  await page.locator('#leave-save').click();
  await page.waitForURL('**/lab.html?mock=1');
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
  expect(await page.evaluate(() => window.documentMarker)).toBeUndefined();
  const saved = await savedSnapshot(page);
  expect(saved.run.status).toBe('complete');
  expect(saved.samples.length).toBeGreaterThan(0);
  expect(saved.workspace.bySource.recorded.reflection.answers.observation).toBe('도구를 나가도 남아야 하는 관찰');
  expect(saved.events.filter(event => event.type === 'measurement-end')).toHaveLength(1);
  await page.locator('#sensor-cards a[href*="/sensors/light-level/"]').click();
  await expect(page.locator('[data-screen="preview"]')).toBeVisible();
  await expect(page.locator('#leave-dialog')).not.toBeVisible();
});

test('cross-tool history navigation confirms even without a recording and loads the destination document', async ({ page }) => {
  await page.goto('/sensors/temperature/?mock=1');
  await expect(page.locator('[data-screen="prepare"]')).toBeVisible();
  await page.evaluate(() => { window.documentMarker = 'original'; });
  const changeTool = () => page.evaluate(() => {
    history.pushState(null, '', '/sensors/light-level/?mock=1');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await changeTool();
  await expect(page.locator('#leave-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/sensors\/temperature\/\?mock=1$/);
  expect(await page.evaluate(() => window.documentMarker)).toBe('original');
  await changeTool();
  await page.locator('#leave-save').click();
  await expect(page.locator('#experiment-title')).toContainText('밝기');
  await expect(page.locator('[data-screen="prepare"]')).toBeVisible();
  expect(await page.evaluate(() => window.documentMarker)).toBeUndefined();
  await expect(page.locator('#leave-dialog')).not.toBeVisible();
});
