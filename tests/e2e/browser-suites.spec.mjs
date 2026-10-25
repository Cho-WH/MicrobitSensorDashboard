import { test, expect } from '@playwright/test';

// Preserve the existing assertions while separating browser execution from an
// interactive extension session. Each suite receives a fresh BrowserContext.
const suites = ['startup', 'guide', 'preparation', 'luminous', 'workspace', 'accessibility',
  'ui', 'app', 'records', 'measurement', 'navigation'];
for (const suite of suites) {
  test(`browser suite: ${suite}`, async ({ page }, testInfo) => {
    try {
      await page.goto(`/tests/browser/?suite=${suite}`);
      await page.getByRole('button', { name: '검사 실행', exact: true }).click();
      await expect(page.locator('#status')).toHaveAttribute('data-result', /passed|failed/, { timeout: 160_000 });
      await expect(page.locator('#status')).toHaveAttribute('data-result', 'passed');
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
