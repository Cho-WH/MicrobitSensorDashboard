import { test as base, expect } from '@playwright/test';
const test = base.extend({ sensorId: ['light-level', { option: true }], recordingMode: ['point', { option: true }] });

test.beforeEach(async ({ page, sensorId, recordingMode }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tests/browser/');
  await page.evaluate(async sensorId => {
    const { mountLabFixture } = await import('/tests/browser/lab-fixture.js');
    const { startApp } = await import('/src/app/startup.js');
    const { createRepository } = await import('/src/data/repository.js');
    const fixture = await mountLabFixture(), repository = createRepository({ databaseName: 'point-ui-' + crypto.randomUUID() });
    let receive, stateChange, channels;
    let state = { status: 'disconnected', attemptId: 0, confirmed: false };
    const transport = { getState: () => state, isSupported: () => true,
      async connect(context, input, changed) { channels = context.channels; receive = input; stateChange = changed; state = { status: 'connected', attemptId: state.attemptId + 1, confirmed: true }; changed(state); },
      async disconnect() { state = { ...state, status: 'disconnected', confirmed: false }; stateChange?.(state); }, forgetDevice() {},
    };
    const api = { fixture, repository, transport, app: null,
      send(value = 40) { receive({ type: 'reading', attemptId: state.attemptId, receivedAt: Date.now(), monotonicAt: performance.now(), values: typeof value === 'number' ? Object.fromEntries(channels.map(channel => [channel.id, value])) : value, validity: Object.fromEntries(channels.map(channel => [channel.id, 'valid'])) }); },
      async snapshot() { return repository.readSnapshot(api.app.getState().storage.id); },
    };
    const open = repository.open;
    repository.open = async () => { if (api.delayOpen) { api.delayOpen = false; await new Promise(resolve => { api.releaseOpen = resolve; }); } return open(); };
    const commit = repository.commitBatch;
    repository.commitBatch = async batch => { if (api.failSave) throw new Error('검사용 저장 실패'); return commit(batch); };
    window.pointTest = api;
    api.app = await startApp(fixture.host, { repository, deviceTransport: transport, historyEnabled: false,
      initialUrl: new URL('/sensors/' + sensorId + '/?mock=1&view=measure', location.href).href });
  }, sensorId);
  await page.locator('.experiment-guide[open] .experiment-guide-close').click();
  await page.locator('button[data-recording-mode="' + recordingMode + '"]').click();
  await page.locator('.luminous-settings').click();
  await page.locator('#connect').click();
  await page.locator('.luminous-close').click();
  await receive(page, 40);
});

async function receive(page, value) {
  for (let index = 0; index < 3; index++) {
    await page.evaluate(value => window.pointTest.send(value), value);
    await page.clock.runFor(500);
  }
}
const readState = page => page.evaluate(() => window.pointTest.app.getState());
async function defineCondition(page) {
  await page.locator('.point-condition > details > summary').click();
  await page.locator('[data-point-field="conditionName"]').fill('거리');
  await page.locator('[data-point-field="conditionUnit"]').fill('cm');
  await page.locator('.point-condition > details > [data-point-action="apply"]').click();
}
async function capture(page) {
  await page.locator('#capture-point').click();
  await expect.poll(async () => (await readState(page)).busy).toBe(false);
}
async function downloadCsv(page, trigger) {
  const pending = page.waitForEvent('download'); await trigger();
  const download = await pending, chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
async function finishSnapshot(page) {
  await page.locator('#finish-recording').click();
  await expect.poll(async () => (await readState(page)).session.state).toBe('ended');
  return page.evaluate(() => window.pointTest.snapshot());
}

test('first manual capture freezes the click across async creation; reception, duplicate and mode boundaries preserve records', async ({ page }) => {
  expect((await readState(page)).storage).toBeUndefined();
  expect(await page.evaluate(() => window.pointTest.repository.listRuns())).toHaveLength(0);
  await defineCondition(page);
  await page.locator('[data-point-field="condition"]').fill('0');
  await page.evaluate(() => { window.pointTest.delayOpen = true; });
  await page.locator('#capture-point').click();
  await expect.poll(() => page.evaluate(() => !!window.pointTest.releaseOpen)).toBe(true);
  await receive(page, 90);
  await page.evaluate(() => { document.querySelector('#capture-point').click(); window.pointTest.releaseOpen(); });
  await expect.poll(async () => (await readState(page)).storage?.sampleCount).toBe(1);
  let snapshot = await page.evaluate(() => window.pointTest.snapshot());
  expect(snapshot.samples[0].values.lightLevel).toBe(40);
  expect(snapshot.pointRecords[0].manualValues['manual-condition']).toBe(0);
  expect(snapshot.pointRecords[0].capturedAt).toBeGreaterThanOrEqual(snapshot.samples[0].receivedAt);
  await expect(page.locator('.point-live-cards strong')).toContainText('90');
  await capture(page); // New observation with identical numerical values is still a distinct point.
  await expect(page.locator('#capture-point')).toBeDisabled();
  await page.clock.runFor(6000);
  expect((await readState(page)).storage.sampleCount).toBe(2);
  await expect(page.locator('#capture-point')).toBeDisabled();
  await expect(page.locator('button[data-recording-mode="continuous"]')).toBeDisabled();
  snapshot = await finishSnapshot(page);
  expect(snapshot.samples.map(sample => sample.values.lightLevel)).toEqual([40, 90]);
  expect(snapshot.run.recordingMode).toBe('point');
  expect(snapshot.workspace).toBeNull();
  const json = await page.evaluate(async () => {
    const { buildExperimentJson } = await import('/src/data/files/json.js');
    return buildExperimentJson(await window.pointTest.snapshot());
  });
  await page.locator('#file-input').setInputFiles({ name: 'points.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect.poll(async () => (await readState(page)).storage?.source).toBe('import');
  expect((await readState(page)).screen).toBe('analysis');
  await expect(page.locator('#analysis-source')).toHaveValue('points');
  await page.locator('[data-view="measure"]').click();
  await expect(page.locator('[data-point-id="1"] input')).toHaveValue('0');
});

test('table drafts survive live updates and IME; invalid past edits do not block valid captures, cancel and restore keep origins', async ({ page }) => {
  await defineCondition(page); await capture(page);
  const row = page.locator('[data-point-id="1"]'), field = row.locator('input');
  await field.fill('한');
  await field.evaluate(node => { node.focus(); node.setSelectionRange(1, 1); node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
  await receive(page, 50);
  await field.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(field).toBeFocused(); await expect(field).toHaveValue('한');
  expect(await field.evaluate(node => node.selectionStart)).toBe(1);
  expect((await readState(page)).storage.sampleCount).toBe(1);
  await field.dispatchEvent('compositionend');
  await page.locator('[data-point-field="condition"]').fill('0'); await capture(page);
  await expect(field).toHaveValue('한');
  await page.locator('[data-view="prepare"]').click();
  expect((await readState(page)).screen).toBe('measure');
  await expect(field).toBeFocused();
  await field.press('Escape'); await expect(field).toHaveValue('');
  await field.fill('-2.5'); await field.press('Enter');
  await page.clock.runFor(250);
  await row.locator('summary').click();
  await row.locator('textarea').fill('자석에서 멀어짐'); await row.locator('textarea').press('Enter');
  await row.locator('[data-point-action="withdraw"]').click(); await page.clock.runFor(250);
  expect((await readState(page)).storage.pointCount).toBe(1);
  await row.locator('[data-point-action="withdraw"]').click(); await page.clock.runFor(250);
  await page.locator('[data-point-field="condition"]').fill('Infinity');
  await page.clock.runFor(250); await expect(page.locator('#capture-point')).toBeDisabled();
  await page.locator('[data-point-field="condition"]').fill('');
  const snapshot = await finishSnapshot(page);
  expect(snapshot.pointRecords.map(point => point.manualValues['manual-condition'])).toEqual([-2.5, 0]);
  expect(snapshot.pointRecords[0].note).toBe('자석에서 멀어짐');
  expect(snapshot.pointRecords.map(point => point.pointRecordId)).toEqual([1, 2]);
  expect(snapshot.samples.map(sample => sample.values.lightLevel)).toEqual([40, 50]);
});

test('creation invalidation leaves no Run; save failure pauses capture and explicit recovery never adds an automatic point', async ({ page }) => {
  await page.evaluate(() => { window.pointTest.delayOpen = true; });
  await page.locator('#capture-point').click();
  await expect.poll(() => page.evaluate(() => !!window.pointTest.releaseOpen)).toBe(true);
  await page.evaluate(() => window.pointTest.transport.disconnect());
  await page.evaluate(() => window.pointTest.releaseOpen());
  await expect.poll(async () => (await readState(page)).busy).toBe(false);
  expect(await page.evaluate(() => window.pointTest.repository.listRuns())).toHaveLength(0);
  await page.locator('.luminous-settings').click(); await page.locator('#connect').click(); await page.locator('.luminous-close').click();
  await receive(page, 60); await capture(page);
  await receive(page, 70); await capture(page);
  await page.evaluate(() => { window.pointTest.failSave = true; });
  await page.clock.runFor(1200);
  await expect.poll(async () => (await readState(page)).session.state).toBe('paused');
  await expect(page.locator('#capture-point')).toBeDisabled();
  await page.evaluate(() => { window.pointTest.failSave = false; });
  await page.locator('#retry-save').click();
  await expect.poll(async () => (await readState(page)).storage.status).toBe('clean');
  await page.locator('#resume-recording').click();
  expect((await readState(page)).storage.sampleCount).toBe(2);
  await expect(page.locator('#capture-point')).toBeDisabled();
  await receive(page, 80); await capture(page);
  const snapshot = await finishSnapshot(page);
  expect(snapshot.samples.map(sample => sample.values.lightLevel)).toEqual([60, 70, 80]);
  expect(snapshot.pointRecords).toHaveLength(3);
});

test('small screens keep long-table drafts and explicit page navigation usable; changing mode finishes and preserves the Run', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await defineCondition(page); await capture(page);
  // Burst individual explicit commands after confirmed reception. No automatic
  // sample generation or UI state mutation is used to populate the table.
  for (let i = 0; i < 52; i++) {
    await page.evaluate(value => window.pointTest.send(value), i);
    await page.clock.runFor(210); await capture(page);
  }
  expect((await readState(page)).storage.sampleCount).toBe(53);
  await page.locator('[data-point-action="previous"]').click();
  const field = page.locator('[data-point-id="1"] input');
  await field.fill('-12.5'); await field.focus();
  await receive(page, 90);
  await page.evaluate(() => document.querySelector('#capture-point').click());
  await expect(field).toBeFocused(); await expect(field).toHaveValue('-12.5');
  await expect(page.locator('[data-point-action="newRecords"]')).toBeVisible();
  await page.locator('[data-point-action="next"]').click();
  await page.locator('[data-point-action="previous"]').click();
  await expect(field).toHaveValue('-12.5');
  await field.fill('5'); // Transition must commit valid drafts before finishing.
  const id = (await readState(page)).storage.id;
  await page.locator('#change-recording-mode').click();
  await page.locator('#leave-save').click();
  await expect.poll(async () => (await readState(page)).busy).toBe(false);
  expect((await readState(page)).screen).toBe('measure');
  expect(await page.evaluate(() => window.pointTest.transport.getState().status)).toBe('connected');
  expect((await readState(page)).storage).toBeUndefined();
  const snapshot = await page.evaluate(id => window.pointTest.repository.readSnapshot(id), id);
  expect(snapshot.run.status).toBe('complete');
  expect(snapshot.pointRecords[0].manualValues['manual-condition']).toBe(5);
  expect(snapshot.pointRecords).toHaveLength(54);
  await page.locator('[data-view="saved"]').click();
  await page.locator('#saved-runs').getByRole('button', { name: '실험 열기', exact: true }).click();
  await expect.poll(async () => (await readState(page)).storage?.id).toBe(id);
  expect((await readState(page)).screen).toBe('analysis');
  expect((await readState(page)).storage.pointCount).toBe(54);
  expect((await readState(page)).session.state).toBe('ended');
});

test('mode changes retain the device, wait for fresh capture and keep the old Run on failed save', async ({page}) => {
  await capture(page);
  const firstId = (await readState(page)).storage.id;
  await page.evaluate(() => { window.pointTest.failSave = true; });
  await page.locator('#change-recording-mode').click(); await page.locator('#leave-save').click();
  await expect.poll(async () => (await readState(page)).busy).toBe(false);
  expect((await readState(page)).storage.id).toBe(firstId);
  expect(await page.evaluate(() => window.pointTest.transport.getState().status)).toBe('connected');
  await page.evaluate(() => { window.pointTest.failSave = false; });
  await page.locator('#change-recording-mode').click(); await page.locator('#leave-save').click();
  await expect.poll(async () => (await readState(page)).storage).toBeUndefined();
  expect((await readState(page)).screen).toBe('measure');
  await page.locator('#start-recording').click();
  await expect.poll(async () => (await readState(page)).busy).toBe(false);
  expect((await readState(page)).storage.sampleCount).toBe(0);
  await receive(page, 71); await page.locator('#capture-continuous-point').click();
  const continuous = await finishSnapshot(page);
  expect(continuous.samples.every(sample => sample.values.lightLevel === 71)).toBe(true);
  expect(continuous.run.id).not.toBe(firstId);
  await page.locator('#change-recording-mode').click();
  await expect.poll(async () => (await readState(page)).storage).toBeUndefined();
  await expect(page.locator('#capture-point')).toBeDisabled();
  await receive(page, 83); await capture(page);
  const manual = await finishSnapshot(page);
  expect(manual.samples.map(sample => sample.values.lightLevel)).toEqual([83]);
  const original = await page.evaluate(id => window.pointTest.repository.readSnapshot(id), firstId);
  expect(original.run.status).toBe('complete');
  expect(original.samples.map(sample => sample.values.lightLevel)).toEqual([40]);
});

test('mode change after a lost connection keeps saved data and opens preparation', async ({page}) => {
  await capture(page);
  const id = (await readState(page)).storage.id;
  await page.evaluate(() => window.pointTest.transport.disconnect());
  await page.locator('#change-recording-mode').click(); await page.locator('#leave-save').click();
  await expect.poll(async () => (await readState(page)).busy).toBe(false);
  expect((await readState(page)).screen).toBe('prepare');
  expect((await readState(page)).storage).toBeUndefined();
  const snapshot = await page.evaluate(id => window.pointTest.repository.readSnapshot(id), id);
  expect(snapshot.run.status).toBe('complete'); expect(snapshot.pointRecords).toHaveLength(1);
});

test.describe('acceleration readout', () => {
  test.use({ sensorId: 'accelerometer' });
  test('unit display and gauge bounds preserve all SI values through capture and reconnect', async ({ page }) => {
    const values = { accelerationX: -9.80665, accelerationY: 0, accelerationZ: 0, accelerationStrength: 9.80665 };
    await receive(page, values);
    await page.locator('[data-point-action="unitToggle"]').click(); await page.clock.runFor(250);
    await expect(page.locator('.point-live-cards strong')).toHaveText('1 g');
    await page.locator('.point-live-cards summary').click();
    await page.locator('.point-live-cards [data-point-field="minimum"]').fill('0');
    await page.locator('.point-live-cards [data-point-field="maximum"]').fill('0.5');
    await page.locator('.point-live-cards [data-point-action="apply"]').click();
    await expect(page.locator('.point-live-cards meter')).toBeVisible();
    await expect(page.locator('.point-live-cards strong')).toHaveText('1 g');
    await capture(page);
    await page.evaluate(() => window.pointTest.transport.disconnect()); await page.clock.runFor(250);
    await expect(page.locator('#capture-point')).toBeDisabled();
    await page.locator('.luminous-settings').click(); await page.locator('#connect').click(); await page.locator('.luminous-close').click();
    await expect(page.locator('#capture-point')).toBeDisabled();
    await receive(page, values); await capture(page);
    const snapshot = await finishSnapshot(page);
    expect(snapshot.samples.map(sample => sample.values)).toEqual([values, values]);
    expect(snapshot.run.context.channels.every(channel => channel.unit === 'm/s²')).toBe(true);
    expect(snapshot.pointRecords.map(point => point.pointRecordId)).toEqual([1, 2]);
  });
});

test.describe('continuous point capture', () => {
  test.use({ recordingMode: 'continuous' });

  test('source switching and origin preview preserve independent analysis boundaries and point context', async ({page}) => {
    await page.locator('#point-panel > summary').click(); await defineCondition(page);
    await page.locator('[data-point-field="condition"]').fill('2');
    await page.locator('#start-recording').click(); await receive(page,50);
    await page.locator('#capture-continuous-point').click();
    await page.locator('[data-view="analysis"]').click();
    await page.clock.runFor(1200);
    const before = (await page.evaluate(()=>window.pointTest.snapshot())).workspace.bySource.recorded;
    await receive(page,60); await page.locator('[data-view="measure"]').click();
    await page.locator('[data-point-field="condition"]').fill('4'); await page.locator('#capture-continuous-point').click();
    await page.locator('#analyze-points').click();
    await expect(page.locator('#analysis-source')).toHaveValue('points');
    const row=page.locator('#raw-rows [data-sample-id]').last(); await row.press('Enter');
    await expect(page.locator('#point-origin')).toBeVisible();
    await page.locator('#point-origin').click();
    await expect(page.locator('#point-origin-banner')).toBeVisible();
    await expect(page.locator('#analysis-source')).toHaveValue('recorded');
    await expect(page.locator('#apply-new-data')).toBeVisible();
    await page.clock.runFor(1200);
    const during=(await page.evaluate(()=>window.pointTest.snapshot())).workspace.bySource.recorded;
    expect(during.appliedIds).toEqual(before.appliedIds); expect(during.analysisInputRevision).toBe(before.analysisInputRevision);
    expect(during.tableLastSampleId).toBeGreaterThan(before.tableLastSampleId);
    await page.locator('#return-to-points').click();
    await expect(page.locator('#analysis-source')).toHaveValue('points');
    await expect(page.locator('#point-inspector')).toBeVisible();
    await expect(page.locator('#tab-relationship')).toHaveAttribute('aria-current','page');
    await page.locator('#analysis-source').selectOption('recorded');
    await expect(page.locator('#tab-overview')).toHaveAttribute('aria-current','page');
    await expect(page.locator('#point-origin-banner')).toBeHidden();
  });

  test('collapsed capture and table edits preserve the continuous stream, sample origins and recording gates', async ({ page }) => {
    const button = page.locator('#capture-continuous-point'), panel = page.locator('#point-panel > summary');
    await expect(button).toBeDisabled();
    expect((await readState(page)).storage).toBeUndefined();
    await panel.click(); await defineCondition(page);
    await page.locator('[data-point-field="condition"]').fill('0');
    await panel.click();
    await page.locator('#start-recording').click();
    await expect(button).toBeDisabled(); // Confirmed preview is not yet accepted continuous data.
    await receive(page, 50);
    const origin1 = (await readState(page)).storage.lastSampleId;
    await button.click(); await page.clock.runFor(250);
    await expect(button).toBeDisabled();
    expect((await readState(page)).storage.sampleCount).toBe(origin1);
    await expect(page.locator('#point-condition-summary')).toContainText('0');
    await panel.click();
    const field = page.locator('[data-point-id="1"] input');
    await field.fill('잘못');
    await receive(page, 60);
    await expect(field).toHaveValue('잘못');
    await page.locator('[data-point-field="condition"]').fill('5');
    const origin2 = (await readState(page)).storage.lastSampleId;
    await button.click(); await page.clock.runFor(250);
    expect((await readState(page)).session.state).toBe('recording');
    expect((await readState(page)).storage.sampleCount).toBe(origin2);
    await expect(field).toHaveValue('잘못');
    await panel.click();
    await page.locator('[data-point-marker="1"]').click();
    await page.locator('[data-point-open="2"]').click(); await page.clock.runFor(250);
    await expect(field).toBeFocused(); await expect(field).toHaveValue('잘못');
    await field.press('Escape'); await field.fill('-2.5'); await field.press('Enter');
    await page.locator('[data-point-field="condition"]').fill('Infinity'); await page.clock.runFor(250);
    await expect(button).toBeDisabled();
    await receive(page, 70); // Invalid condition never stops continuous samples.
    expect((await readState(page)).storage.sampleCount).toBeGreaterThan(origin2);
    await page.locator('[data-point-field="condition"]').fill('');
    await page.locator('[data-view="analysis"]').click();
    await receive(page, 80);
    await page.locator('[data-view="measure"]').click();
    expect((await readState(page)).session.state).toBe('recording');
    await expect(field).toHaveValue('-2.5');
    await page.locator('#pause-recording').click();
    const count = (await readState(page)).storage.sampleCount;
    await receive(page, 90); await expect(button).toBeDisabled();
    expect((await readState(page)).storage.sampleCount).toBe(count);
    await page.locator('#resume-recording').click(); await expect(button).toBeDisabled();
    await receive(page, 100);
    const origin3 = (await readState(page)).storage.lastSampleId;
    await button.click();
    const snapshot = await finishSnapshot(page);
    await expect(button).toBeDisabled();
    expect(snapshot.run.recordingMode).toBe('continuous');
    expect(snapshot.samples.map(sample => sample.sampleId)).toEqual(Array.from({ length: snapshot.samples.length }, (_, index) => index + 1));
    expect(snapshot.samples.some(sample => sample.values.lightLevel === 90)).toBe(false);
    expect(snapshot.pointRecords.map(point => point.capturedSampleId)).toEqual([origin1, origin2, origin3]);
    expect(snapshot.pointRecords.map(point => point.manualValues['manual-condition'])).toEqual([-2.5, 5, null]);
    expect(snapshot.pointRecords.map(point => snapshot.samples.find(sample => sample.sampleId === point.capturedSampleId).values.lightLevel)).toEqual([50, 60, 100]);
  });

  test('grouped point markers coexist with notes, open the original rows and survive reconnect and withdrawal on a small screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const button = page.locator('#capture-continuous-point');
    await page.locator('#start-recording').click(); await receive(page, 50); await button.click();
    await page.locator('#event-note').fill('같은 위치에서 관찰'); await page.locator('#add-note').click();
    await receive(page, 60); await button.click(); await page.clock.runFor(250);
    await expect(page.locator('[data-point-marker="1"]')).toBeVisible();
    await expect(page.locator('.measurement-event-marker button')).toBeVisible();
    await page.locator('[data-point-marker="1"]').click();
    await expect(page.locator('dialog[open] [data-point-marker-id]')).toHaveCount(2);
    await page.locator('[data-point-open="2"]').click(); await page.clock.runFor(250);
    const row = page.locator('[data-point-id="2"]');
    await expect(row.locator('summary')).toBeFocused();
    await row.locator('[data-point-action="withdraw"]').click(); await page.clock.runFor(250);
    expect((await readState(page)).storage.pointCount).toBe(1);
    await page.locator('[data-point-marker="1"]').click();
    await expect(page.locator('dialog[open] [data-point-marker-id]')).toHaveCount(1);
    await page.locator('dialog[open]').press('Escape');
    await expect(page.locator('[data-point-marker="1"]')).toBeFocused();
    await row.locator('[data-point-action="withdraw"]').click(); await page.clock.runFor(250);
    await page.evaluate(() => window.pointTest.transport.disconnect()); await page.clock.runFor(250);
    await expect(button).toBeDisabled();
    await page.locator('#pause-recording').click();
    await page.locator('.luminous-settings').click(); await page.locator('#connect').click(); await page.locator('.luminous-close').click();
    await receive(page, 70); await expect(button).toBeDisabled();
    await page.locator('#resume-recording').click(); await expect(button).toBeDisabled();
    await receive(page, 80); await button.click();
    const snapshot = await finishSnapshot(page);
    expect(snapshot.pointRecords).toHaveLength(3);
    expect(snapshot.pointRecords.every(point => !point.withdrawn)).toBe(true);
    expect(snapshot.pointRecords.map(point => snapshot.samples.find(sample => sample.sampleId === point.capturedSampleId).values.lightLevel)).toEqual([50, 60, 80]);
    expect(snapshot.events.filter(event => event.type === 'note')).toHaveLength(1);
  });
});


test('point analysis edits wait for apply, preserve evidence and export an independent CSV', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await defineCondition(page); await page.locator('[data-point-field="condition"]').fill('0'); await capture(page);
  await receive(page,60); await page.locator('[data-point-field="condition"]').fill('3'); await capture(page);
  await page.locator('#analyze-points').click();
  await expect(page.locator('#analysis-source')).toHaveValue('points');
  await page.locator('#use-graph-for-reflection').click();
  await page.locator('#tab-relationship').click();
  await page.locator('[data-edit-condition="1"]').click();
  await page.locator('#point-condition-dialog input').fill('wrong');
  await page.locator('#point-condition-dialog [data-confirm]').click();
  await expect(page.locator('#point-condition-dialog [role="alert"]')).not.toBeEmpty();
  await page.locator('#point-condition-dialog input').fill('7');
  await page.locator('#point-condition-dialog [data-confirm]').click();
  await expect(page.locator('#point-condition-dialog')).toHaveCount(0);
  await expect(page.locator('[data-edit-condition="1"]')).toHaveText('7');
  await expect(page.locator('[data-edit-condition="1"]')).toBeFocused();
  await expect(page.locator('#condition-pending-1')).toContainText('0');
  await expect(page.locator('#point-input-notice')).toBeVisible();
  await expect(page.locator('#apply-new-data')).toBeVisible();
  await page.locator('[data-export="analysis-csv"]:visible').click();
  const appliedCsv = await downloadCsv(page, () => page.locator('#analysis-export-dialog [data-confirm]').click());
  const applied = await page.evaluate(async csv => {const {parseExperimentCsv}=await import('/src/data/files/csv.js');return parseExperimentCsv(csv);},appliedCsv);
  expect(applied.samples[0].importedValues['data-manual-condition'].value).toBe(0);
  await page.locator('#apply-new-data').click();
  await expect(page.locator('[data-edit-condition="1"]')).toHaveText('7');
  await expect(page.locator('#condition-pending-1')).toHaveCount(0);
  await expect(page.locator('#point-input-notice')).toBeHidden();
  await page.locator('#raw-rows [data-sample-id]').first().press('Enter');
  await expect(page.locator('#point-origin')).toBeHidden();
  await page.locator('#tab-interpretation').click();
  await expect(page.locator('#reflection-stale')).toBeVisible();
  await page.clock.runFor(1200);
  const snapshot=await page.evaluate(()=>window.pointTest.snapshot());
  expect(snapshot.workspace.bySource.points.reflection.evidence.inputSnapshot.points[0].manualValues['manual-condition']).toBe(0);
  expect(snapshot.pointRecords[0].manualValues['manual-condition']).toBe(7);
  await page.locator('.luminous-export > summary').click();
  const csv=await downloadCsv(page, () => page.locator('#export-points-csv').click());
  await page.locator('[data-view="measure"]').click(); await page.locator('#finish-recording').click();
  await page.locator('#file-input').setInputFiles({name:'points.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await expect.poll(async()=>(await readState(page)).storage?.source).toBe('import');
  await expect(page.locator('#analysis-source')).toHaveValue('recorded');
  const imported=await page.evaluate(()=>window.pointTest.snapshot());
  expect(imported.pointRecords).toEqual([]); expect(imported.run.recordingMode).toBeNull();
  expect(imported.samples[0].importedValues['data-manual-condition'].value).toBe(7);
});
