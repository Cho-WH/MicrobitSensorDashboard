import { defineConfig } from '@playwright/test';
import { availableParallelism } from 'node:os';

// A separate server and fresh browser context keep tests away from the user's
// open lab, device permissions and IndexedDB. No retries hide first failures.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 2 : Math.min(4, availableParallelism()),
  fullyParallel: true,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8081',
    browserName: 'chromium',
    viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/dev.mjs',
    env: { PORT: '8081' },
    url: 'http://127.0.0.1:8081/lab.html',
    reuseExistingServer: false,
  },
});
