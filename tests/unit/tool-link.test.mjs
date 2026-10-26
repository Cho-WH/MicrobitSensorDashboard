import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolLink, normalizePublicBase } from '../../src/sharing/tool-link.js';
import { entryRoutes, parseRoute } from '../../src/app/routes.js';
import { getExperiment } from '../../src/catalog/index.js';
import { renderEntry, renderPublicMetadata } from '../../scripts/entry-pages.mjs';

test('every shared tool returns to its preview under root or project hosting without local state', () => {
  for (const base of ['https://lab.sco.pe.kr/', 'https://example.test/apps/lab']) {
    for (const entry of entryRoutes) {
      const context = getExperiment(entry.sensorId, entry.activityId);
      context.mock = true; context.runId = 'private-run'; context.classConfig = {title:'private-title'};
      const before = structuredClone(context), link = createToolLink(context, base);
      assert.equal(link, normalizePublicBase(base) + entry.path + '?view=preview');
      const opened = parseRoute(link, normalizePublicBase(base));
      assert.equal(opened.screen, 'preview'); assert.equal(opened.context.sensor.id, entry.sensorId);
      assert.equal(opened.context.activity?.id ?? null, entry.activityId);
      assert.deepEqual(context, before);
    }
  }
});

test('sharing rejects unregistered targets and unusable public destinations instead of falling back', () => {
  const context = getExperiment('bmp280');
  for (const base of ['', 'http://localhost:8080/', 'https://name:secret@example.test/', 'https://example.test/?mock=1', 'https://example.test/#local'])
    assert.throws(() => createToolLink(context, base));
  for (const target of [null, {sensor:{id:'unknown'}}, {...context, activity:{id:'unknown'}}])
    assert.throws(() => createToolLink(target));
});

test('deployment metadata and generated entry canonical agree with the configured public base', () => {
  const base = 'https://lab.sco.pe.kr/', entry = entryRoutes[0];
  const source = '<html><head><meta property="og:url" content="https://old.test/"><meta property="og:image" content="https://old.test/image.png"><meta name="twitter:image" content="https://old.test/image.png"></head></html>';
  const html = renderEntry(renderPublicMetadata(source, base), entry);
  assert.ok(html.includes(`property="og:url" content="${base}${entry.path}"`));
  assert.ok(html.includes(`rel="canonical" href="${base}${entry.path}"`));
  assert.equal((html.match(new RegExp(base.replaceAll('.', '\\.') + 'public/assets/branding/sensor-lab-social.png', 'g')) ?? []).length, 2);
  assert.ok(!html.includes('old.test'));
});
