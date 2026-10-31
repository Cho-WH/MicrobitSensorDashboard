import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`home sensor and related activity open independent previews at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/lab.html');
    const sensor = page.locator('#sensor-cards a[href*="/sensors/bmp280/"]');
    await expect(sensor).toBeVisible();
    const betaHelp = page.locator('#sensor-cards [data-action-help="betaTool"]');
    await betaHelp.first().click();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.locator('[data-screen="home"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toBeHidden();
    if (viewport.width > 1000) await sensor.hover();
    await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
    await page.locator('#sensor-cards a[href*="/activities/gay-lussac/"]').click();
    await expect(page).toHaveURL(/\/activities\/gay-lussac\/\?view=preview$/);
    await expect(page.locator('#activate-experiment')).toBeVisible();
    await expect(page.locator('[data-screen="prepare"]')).toBeHidden();
    await page.goBack();
    await sensor.click();
    await expect(page).toHaveURL(/\/sensors\/bmp280\/\?view=preview$/);
    await page.goBack();
    await page.locator('#activity-cards a[href*="/activities/gay-lussac/"]').click();
    await expect(page).toHaveURL(/\/activities\/gay-lussac\/\?view=preview$/);
  });
}

test('a longer related activity list supports keyboard dismissal and selects the requested activity', async ({ page }) => {
  await page.goto('/lab.html');
  await expect(page.locator('#sensor-cards a[href*="/sensors/bmp280/"]')).toBeVisible();
  await page.evaluate(async () => {
    const { renderHomeCards } = await import('/src/ui/home-view.js');
    const { getExperiment } = await import('/src/catalog/index.js');
    const { getLabCopy } = await import('/src/catalog/ui-copy.js');
    const context = getExperiment('bmp280');
    const activities = [1, 2, 3].map(n => {
      const next = getExperiment('bmp280', 'gay-lussac'); next.activity.id = 'example-' + n;
      return { context: next, copy: { ...getLabCopy(next).home, activityTitle: '검사 활동 ' + n } };
    });
    renderHomeCards(document, { sensors: [{ context, copy: getLabCopy(context).home }], activities,
      linkTo: next => '#'+(next.activity?.id ?? next.sensor.id),
      onSelect: next => { window.selectedHomeActivity = next.activity?.id; }, signal: new AbortController().signal });
  });
  const summary = page.locator('#sensor-cards summary');
  const activity = page.locator('#sensor-cards').getByRole('link', { name: /^검사 활동 3/ });
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(activity).toBeVisible();
  await page.keyboard.press('Tab'); await page.keyboard.press('Escape');
  await expect(activity).toBeHidden(); await expect(summary).toBeFocused();
  await summary.click(); await activity.click();
  expect(await page.evaluate(() => window.selectedHomeActivity)).toBe('example-3');
  await expect(activity).toBeHidden();
});
