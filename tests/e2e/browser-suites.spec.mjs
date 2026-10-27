import { test, expect } from '@playwright/test';

// Preserve the existing assertions while separating browser execution from an
// interactive extension session. Each suite receives a fresh BrowserContext.
// Start expensive independent suites first; short cases fill the tail.
const suites = ['large-import', 'large-recording', 'layout', 'accessibility', 'workspace',
  'navigation', 'app-activity', 'preparation', 'ui', 'luminous', 'app-start-race',
  'app-temperature', 'app-magnetic', 'records', 'measurement', 'app-accelerometer',
  'app-light-level', 'startup', 'copy', 'storage', 'guide', 'files', 'devices'];
for (const suite of suites) {
  test(`browser suite: ${suite}`, { tag: suite === 'large-import' ? '@large-import' : suite === 'large-recording' ? '@large' : '@ui' }, async ({ page }, testInfo) => {
    try {
      // Functional flows need the final UI state, not repeated decorative motion.
      // Layout/workspace/luminous still exercise the default animation paths.
      if (suite.startsWith('app-') || suite === 'preparation') await page.emulateMedia({ reducedMotion: 'reduce' });
      if (suite.startsWith('app-')) {
        await page.clock.install();
        await page.exposeFunction('advanceReceptionClock', ms => page.clock.runFor(ms));
      }
      await page.goto(`/tests/browser/?suite=${suite}`);
      await page.getByRole('button', { name: '검사 실행', exact: true }).click();
      await expect(page.locator('#status')).toHaveAttribute('data-result', /passed|failed/, { timeout: 160_000 });
      // The terminal result cannot turn into a pass; fail immediately instead of polling 15s.
      expect(await page.locator('#status').getAttribute('data-result'), await page.locator('#status').innerText()).toBe('passed');
      if (suite.startsWith('large-')) console.log(await page.locator('#results').innerText());
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
