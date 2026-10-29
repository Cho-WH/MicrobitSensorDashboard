import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { entryRoutes } from '../../src/app/routes.js';

const officialBase = 'https://lab.sco.pe.kr/';
const projectBase = 'http://127.0.0.1:8082/dist/';

test('Cloudflare HTML normalization preserves routes and queries; missing files remain 404', async ({ page, request }) => {
  const redirected = await request.get('/lab.html?view=saved', { maxRedirects: 0 });
  expect(redirected.status()).toBe(307);
  expect(new URL(redirected.headers().location, 'http://127.0.0.1:8787').pathname).toBe('/lab');
  expect(new URL(redirected.headers().location, 'http://127.0.0.1:8787').search).toBe('?view=saved');
  await page.goto('/lab.html?view=saved');
  await expect(page.locator('[data-screen="saved"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-screen="saved"]')).toBeVisible();
  for (const entry of entryRoutes) {
    const canonical = '/' + entry.path;
    for (const suffix of [canonical.slice(0, -1), canonical + 'index.html']) {
      const response = await request.get(suffix + '?view=preview');
      expect(response.status()).toBe(200);
      expect(new URL(response.url()).pathname).toBe(canonical);
      expect(new URL(response.url()).search).toBe('?view=preview');
    }
    await page.goto(canonical + '?view=preview');
    await expect(page.locator('[data-screen="preview"]')).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', officialBase + entry.path);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', officialBase + entry.path);
  }
  for (const path of ['/sensors/unknown/', '/assets/missing.js']) {
    expect((await request.get(path)).status()).toBe(404);
  }
  await page.goto('/');
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
  const manifestUrl = new URL(await page.locator('link[rel="manifest"]').getAttribute('href'), page.url());
  const manifest = await (await request.get(manifestUrl.href)).json();
  expect(new URL(manifest.scope, manifestUrl).pathname).toBe('/');
  expect((await request.get(new URL(manifest.start_url, manifestUrl).href)).status()).toBe(200);
  const social = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(new URL(social).origin).toBe(new URL(officialBase).origin);
  expect((await request.get(new URL(social).pathname)).status()).toBe(200);
});

test('production build shares the official link and QR and loads lazy USB/firmware assets', async ({ page }) => {
  const failures = [], requests = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      async writeText(text) { window.copiedLink = text; },
    } });
  });
  await page.goto('/sensors/temperature/?view=preview');
  const share = page.locator('#tool-share-inline');
  await expect(share.locator('svg')).toBeVisible();
  await share.getByRole('button', { name: '링크 복사', exact: true }).click();
  const expected = officialBase + 'sensors/temperature/?view=preview';
  expect(await page.evaluate(() => window.copiedLink)).toBe(expected);
  // Existing QR encoder contract: check that the built UI encodes the public destination.
  expect(await page.evaluate(url => {
    const wanted = new DOMParser().parseFromString(window.SimpleQRCode.toSvg(url), 'image/svg+xml');
    return document.querySelector('#tool-share-inline svg path').getAttribute('d') === wanted.querySelector('path').getAttribute('d');
  }, expected)).toBe(true);
  await page.locator('#activate-experiment').click();
  await page.locator('[data-guide-group="program"]').click();
  await expect(page.locator('.guide-program')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-guide-action="install"]')).toBeEnabled();
  expect(requests.some(url => /\/assets\/microbit-usb-.*\.js$/.test(url))).toBe(true);
  expect(requests.some(url => /\/public\/firmware\/.*\.hex$/.test(url))).toBe(true);
  expect(failures).toEqual([]);
});

async function savedSnapshot(page, moduleBase) {
  return page.evaluate(async base => {
    const { createRepository } = await import(base + 'src/data/repository.js');
    const repo = createRepository();
    try {
      const runs = await repo.listRuns();
      return runs.length ? await repo.readSnapshot(runs[0].id) : null;
    } finally { repo.close(); }
  }, moduleBase);
}

test('project-hosted saved JSON reopens at the new origin without erasing its source', async ({ page, context }) => {
  await page.goto(projectBase);
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('../fixtures/gay-lussac-v2.json', import.meta.url)));
  await expect(page.locator('[data-screen="analysis"]')).toBeVisible();
  const before = await savedSnapshot(page, '/dist/');
  expect(before.samples.length).toBeGreaterThan(0);
  // Exercise persisted data and the root-relative deployment independently.
  await page.goto(projectBase + 'lab.html?view=saved');
  await expect(page.locator('#saved-runs li')).toHaveCount(1);
  await page.locator('#saved-runs li button').first().click();
  await expect(page.locator('[data-screen="analysis"]')).toBeVisible();
  await page.locator('.luminous-export summary').click();
  const downloading = page.waitForEvent('download');
  await page.locator('#export-json').click();
  const text = await readFile(await (await downloading).path(), 'utf8');
  const exported = JSON.parse(text);
  const next = await context.newPage();
  await next.goto('/lab?view=saved');
  await expect(next.locator('[data-screen="saved"]')).toBeVisible();
  expect(await savedSnapshot(next, '/')).toBeNull();
  await next.locator('#file-input').setInputFiles({ name: 'migrated.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(next.locator('[data-screen="analysis"]')).toBeVisible();
  const imported = await savedSnapshot(next, '/');
  const withoutRunId = rows => rows.map(({ runId, ...row }) => row);
  expect(imported.samples).toHaveLength(before.samples.length);
  expect(withoutRunId(imported.samples)).toEqual(withoutRunId(exported.samples));
  expect(withoutRunId(imported.events)).toEqual(withoutRunId(exported.events));
  // Compare the exported contract, including future source-specific analysis,
  // without depending on one version's workspace layout. Import creates a new
  // run identity, including nested analysis references; the content stays intact.
  const comparable = JSON.parse(JSON.stringify(imported.workspace,
    (key, value) => key === 'runId' && value === imported.run.id ? exported.run.id : value));
  for (const key of Object.keys(exported.workspace).filter(key => key !== 'workspaceRevision')) {
    expect(comparable[key]).toEqual(exported.workspace[key]);
  }
  expect(imported.run.id).not.toBe(before.run.id);
  expect((await savedSnapshot(page, '/dist/')).samples).toEqual(before.samples);
});
