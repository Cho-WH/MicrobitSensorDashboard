import { test, expect } from '@playwright/test';

// Preserve the existing assertions while separating browser execution from an
// interactive extension session. Each suite receives a fresh BrowserContext.
const suites = ['startup', 'copy', 'storage', 'files', 'guide', 'preparation', 'luminous',
  'workspace', 'accessibility', 'ui', 'app', 'records', 'measurement', 'navigation', 'layout', 'devices', 'large-recording'];
for (const suite of suites) {
  test(`browser suite: ${suite}`, { tag: suite === 'large-recording' ? '@large' : '@ui' }, async ({ page }, testInfo) => {
    try {
      // Functional flows need the final UI state, not repeated decorative motion.
      // Layout/workspace/luminous still exercise the default animation paths.
      if (['app', 'preparation'].includes(suite)) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/tests/browser/?suite=${suite}`);
      await page.getByRole('button', { name: '검사 실행', exact: true }).click();
      await expect(page.locator('#status')).toHaveAttribute('data-result', /passed|failed/, { timeout: 160_000 });
      // The terminal result cannot turn into a pass; fail immediately instead of polling 15s.
      expect(await page.locator('#status').getAttribute('data-result'), await page.locator('#status').innerText()).toBe('passed');
      if (suite === 'large-recording') console.log(await page.locator('#results').innerText());
    } catch (error) {
      // Successful runs need no diagnostic copies. Network and console events
      // are already retained in the failure trace configured by Playwright.
      await testInfo.attach('browser-results', {
        body: await page.locator('#results').innerText({ timeout: 1000 }).catch(() => '검사 결과 영역을 읽지 못했습니다.'),
        contentType: 'text/plain',
      });
      throw error;
    }
  });
}
