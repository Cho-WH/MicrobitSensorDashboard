import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

// Exercise Cloudflare asset routing and the same build at a separate origin/subpath.
// Neither server uses the user's browser or DB.
export default defineConfig({
  ...base,
  testDir: './tests/deployment',
  testMatch: 'cloudflare.spec.mjs',
  use: { ...base.use, baseURL: 'http://127.0.0.1:8787' },
  webServer: [
    {
      command: 'npx wrangler dev --local --ip 127.0.0.1 --port 8787 --inspector-port 0 --infer-origin-from-routes=false',
      env: { WRANGLER_SEND_METRICS: 'false' },
      url: 'http://127.0.0.1:8787/',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node scripts/dev.mjs',
      env: { PORT: '8082' },
      url: 'http://127.0.0.1:8082/dist/',
      reuseExistingServer: false,
    },
  ],
});
