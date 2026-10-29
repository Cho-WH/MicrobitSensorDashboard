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
    repository.commitBatch = async batch => {
      if (api.failSave) throw new Error('검사용 저장 실패');
      if (api.delaySave) { api.delaySave = false; await new Promise(resolve => { api.releaseSave = resolve; }); }
      return commit(batch);
    };
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
  await page.locator('[data-point-action="variable"]').click();
  await page.locator('[data-point-field="conditionName"]').fill('거리');
  await page.locator('[data-point-field="conditionUnit"]').fill('cm');
  await page.locator('.luminous-connection').click();
}
async function editCondition(page, id, value) {
  const field = page.locator('[data-point-id="' + id + '"] input');
  await field.fill(value); await field.press('Enter');
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
  await page.evaluate(() => { window.pointTest.delayOpen = true; });
  await page.locator('#capture-point').click();
  await expect.poll(() => page.evaluate(() => !!window.pointTest.releaseOpen)).toBe(true);
  await receive(page, 90);
  await page.evaluate(() => { document.querySelector('#capture-point').click(); window.pointTest.releaseOpen(); });
  await expect.poll(async () => (await readState(page)).storage?.sampleCount).toBe(1);
  let snapshot = await page.evaluate(() => window.pointTest.snapshot());
  expect(snapshot.samples[0].values.lightLevel).toBe(40);
  expect(snapshot.pointRecords[0].manualValues['manual-condition']).toBeNull();
  await editCondition(page, 1, '0');
  expect(snapshot.pointRecords[0].capturedAt).toBeGreaterThanOrEqual(snapshot.samples[0].receivedAt);
  await expect(page.locator('.point-live-cards strong')).toContainText('90');
  await capture(page); // New observation with identical numerical values is still a distinct point.
  await expect(page.locator('#capture-point')).toBeDisabled();
  await page.clock.runFor(6000);
  expect((await readState(page)).storage.sampleCount).toBe(2);
  await expect(page.locator('#capture-point')).toBeDisabled();
  await expect(page.locator('#continuous-recording')).toBeDisabled();
  await page.locator('button[data-recording-mode="continuous"]').click();
  expect((await readState(page)).storage.recordingMode).toBe('point');
  await page.locator('button[data-recording-mode="point"]').click();
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
  await capture(page); await editCondition(page, 2, '0');
  await expect(field).toHaveValue('한');
  await page.locator('[data-view="prepare"]').click();
  expect((await readState(page)).screen).toBe('measure');
  await expect(field).toBeFocused();
  await field.press('Escape'); await expect(field).toHaveValue('');
  await field.fill('-2.5'); await field.press('Enter');
  await page.clock.runFor(250);
  await row.locator('[data-point-action="note"]').click();
  await page.locator('#point-note-editor textarea').fill('자석에서 멀어짐');
  await field.click();
  await row.locator('[data-point-action="options"]').click();
  await page.locator('#point-options [data-point-action="withdraw"]').click(); await page.clock.runFor(250);
  expect((await readState(page)).storage.pointCount).toBe(1);
  await row.locator('[data-point-action="options"]').click();
  await page.locator('#point-options [data-point-action="withdraw"]').click(); await page.clock.runFor(250);
  await field.fill('Infinity'); await field.press('Enter');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.press('Escape');
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
  await expect(page.locator('#measurement-action-message')).toBeVisible();
  await expect(page.locator('#measurement-action-message')).toContainText('검사용 저장 실패');
  await page.evaluate(() => { window.pointTest.failSave = false; });
  await page.locator('#retry-save').click();
  await expect.poll(async () => (await readState(page)).storage.status).toBe('clean');
  await expect(page.locator('#measurement-action-message')).not.toContainText('검사용 저장 실패');
  await page.locator('#resume-recording').click();
  expect((await readState(page)).storage.sampleCount).toBe(2);
  await expect(page.locator('#capture-point')).toBeDisabled();
  await receive(page, 80); await capture(page);
  const snapshot = await finishSnapshot(page);
  expect(snapshot.samples.map(sample => sample.values.lightLevel)).toEqual([60, 70, 80]);
  expect(snapshot.pointRecords).toHaveLength(3);
});

test('variable and note bubbles commit on leaving, preserve invalid drafts and clear only editable values', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await defineCondition(page);
  const outside=page.locator('.luminous-connection'); await capture(page); await editCondition(page, 1, '3');
  const row=page.locator('[data-point-id="1"]'), value=row.locator('input'), note=row.locator('[data-point-action="note"]');
  await value.fill('4'); await outside.click(); await page.clock.runFor(1200);
  expect((await page.evaluate(()=>window.pointTest.snapshot())).pointRecords[0].manualValues['manual-condition']).toBe(4);
  await note.click(); await page.locator('#point-note-editor textarea').fill('첫 줄\n둘째 줄');
  await receive(page,60); await page.locator('.luminous-connection').click(); await page.clock.runFor(1200);
  expect((await page.evaluate(()=>window.pointTest.snapshot())).pointRecords[0].note).toBe('첫 줄\n둘째 줄');
  await expect(note).toHaveAccessibleName(/메모 있음/);
  await note.click(); await page.locator('#point-note-editor textarea').fill('저장 실패 시 보존');
  await page.evaluate(()=>{ window.pointTest.failSave=true; });
  await outside.click(); await page.clock.runFor(1200);
  await note.click(); await expect(page.locator('#point-note-editor textarea')).toHaveValue('저장 실패 시 보존');
  await page.getByRole('button',{name:'메모 비우기',exact:true}).click();
  await expect(page.locator('#point-note-editor textarea')).toHaveValue('');
  await outside.click(); await expect(page.locator('#point-note-editor')).not.toBeVisible();
  await expect(note).not.toHaveAccessibleName(/메모 있음/);
  await page.evaluate(()=>{window.pointTest.failSave=false;}); await page.locator('#retry-save').click();
  await expect.poll(async ()=>(await readState(page)).storage.status).toBe('clean');
  expect((await page.evaluate(()=>window.pointTest.snapshot())).pointRecords[0].note).toBe('');
  await expect(note).not.toHaveAccessibleName(/메모 있음/);
  await row.getByRole('button',{name:'1번 변인값 비우기',exact:true}).click(); await note.click(); await page.keyboard.press('Escape'); await page.clock.runFor(1200);
  const snapshot=await page.evaluate(()=>window.pointTest.snapshot());
  expect(snapshot.pointRecords[0].manualValues['manual-condition']).toBeNull();expect(snapshot.samples[0].values.lightLevel).toBe(40);
  await page.locator('[data-point-action="variable"]').click();
  await page.getByRole('button',{name:'변인 이름 비우기',exact:true}).click(); await page.locator('.luminous-connection').click();
  await expect(page.locator('#point-column-error')).not.toBeEmpty();
  await page.locator('[data-point-field="conditionName"]').fill('각도');
  await page.getByRole('button',{name:'단위 비우기',exact:true}).click(); await page.locator('.luminous-connection').click();await page.clock.runFor(1200);
  expect((await page.evaluate(()=>window.pointTest.snapshot())).run.manualColumns[0]).toMatchObject({name:'각도',unit:null});
});

test('small screens scroll all points without losing focused drafts; starting a new experiment finishes and preserves the Run', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await defineCondition(page); await capture(page);
  // Burst individual explicit commands after confirmed reception. No automatic
  // sample generation or UI state mutation is used to populate the table.
  for (let i = 0; i < 52; i++) {
    await page.evaluate(value => window.pointTest.send(value), i);
    await page.clock.runFor(210); await capture(page);
  }
  expect((await readState(page)).storage.sampleCount).toBe(53);
  await page.locator('[data-point-action="variable"]').click();
  await page.locator('[data-point-field="conditionName"]').fill('자석의 중심에서 자기장 센서까지 측정한 거리');
  await page.locator('.luminous-connection').click(); await page.clock.runFor(250);
  const scroller = page.getByRole('region', {name:'한 점 기록표 스크롤'});
  await scroller.focus(); await scroller.press('Home'); await page.clock.runFor(250);
  const field = page.locator('[data-point-id="1"] input');
  await field.fill('-12.5'); await field.focus();
  await receive(page, 90);
  await page.evaluate(() => document.querySelector('#capture-point').click());
  await expect(field).toBeFocused(); await expect(field).toHaveValue('-12.5');
  await expect(page.locator('[data-point-action="newRecords"]')).toBeVisible();
  await scroller.evaluate(node => { node.scrollTop = node.scrollHeight; node.dispatchEvent(new Event('scroll')); });
  await page.clock.runFor(250);
  await expect(page.locator('[data-point-id="54"] input')).toBeAttached();
  expect(await page.locator('[data-point-id="54"] input').evaluate(node => {
    const row = node.getBoundingClientRect(), viewport = node.closest('[role="region"]').getBoundingClientRect();
    return row.top >= viewport.top && row.bottom <= viewport.bottom;
  })).toBe(true);
  await expect(field).toBeFocused(); await expect(field).toHaveValue('-12.5');
  await scroller.evaluate(node => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
  await page.clock.runFor(250);
  await expect(field).toHaveValue('-12.5');
  await field.fill('5'); // Transition must commit valid drafts before finishing.
  const id = (await readState(page)).storage.id;
  await page.locator('#prepare-new-experiment').click();
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

test('new experiments retain policy, view and device, require fresh capture and preserve the old Run on failed save', async ({page}) => {
  await capture(page);
  const firstId = (await readState(page)).storage.id;
  // The selected screen and stored policy may intentionally differ.
  await page.locator('button[data-recording-mode="continuous"]').click();
  await page.evaluate(() => { window.pointTest.failSave = true; });
  await page.locator('#prepare-new-experiment').click(); await page.locator('#leave-save').click();
  await expect.poll(async () => (await readState(page)).busy).toBe(false);
  expect((await readState(page)).storage.id).toBe(firstId);
  expect(await page.evaluate(() => window.pointTest.transport.getState().status)).toBe('connected');
  await page.evaluate(() => { window.pointTest.failSave = false; });
  await page.locator('#prepare-new-experiment').click(); await page.locator('#leave-save').click();
  await expect.poll(async () => (await readState(page)).storage).toBeUndefined();
  expect((await readState(page)).screen).toBe('measure');
  await expect(page.locator('button[data-recording-mode="continuous"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#continuous-recording')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#continuous-recording')).toBeEnabled();
  await expect(page.locator('#capture-continuous-point')).toBeDisabled();
  expect(await page.evaluate(() => window.pointTest.transport.getState().status)).toBe('connected');
  await page.locator('#continuous-recording').click();
  await page.locator('#start-recording').click();
  await expect.poll(async () => (await readState(page)).busy).toBe(false);
  expect((await readState(page)).storage.sampleCount).toBe(0);
  await receive(page, 71); await page.locator('#capture-continuous-point').click();
  const continuous = await finishSnapshot(page);
  expect(continuous.samples.every(sample => sample.values.lightLevel === 71)).toBe(true);
  expect(continuous.run.id).not.toBe(firstId);
  await page.locator('button[data-recording-mode="point"]').click();
  await page.locator('#prepare-new-experiment').click();
  await expect.poll(async () => (await readState(page)).storage).toBeUndefined();
  await expect(page.locator('button[data-recording-mode="point"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#continuous-recording')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#continuous-recording')).toBeEnabled();
  await page.locator('#continuous-recording').click();
  await expect(page.locator('#capture-point')).toBeDisabled();
  await receive(page, 83); await capture(page);
  const manual = await finishSnapshot(page);
  expect(manual.samples.map(sample => sample.values.lightLevel)).toEqual([83]);
  const original = await page.evaluate(id => window.pointTest.repository.readSnapshot(id), firstId);
  expect(original.run.status).toBe('complete');
  expect(original.samples.map(sample => sample.values.lightLevel)).toEqual([40]);
});

test('new experiment after a lost connection keeps saved data and opens preparation', async ({page}) => {
  await capture(page);
  const id = (await readState(page)).storage.id;
  await page.evaluate(() => window.pointTest.transport.disconnect());
  await page.locator('#prepare-new-experiment').click(); await page.locator('#leave-save').click();
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
    await page.locator('.point-live-cards [data-point-field="maximum"]').press('Enter');
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
    await page.locator('#start-recording').click(); await receive(page,50);
    await page.locator('#capture-continuous-point').click(); await editCondition(page, 1, '2');
    await page.locator('[data-view="analysis"]').click();
    await page.clock.runFor(1200);
    const before = (await page.evaluate(()=>window.pointTest.snapshot())).workspace.bySource.recorded;
    await receive(page,60); await page.locator('[data-view="measure"]').click();
    await page.locator('#capture-continuous-point').click(); await editCondition(page, 2, '4');
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
    // Finish from measurement while the recorded Workspace is cached behind
    // the point source; both sources must be current when returning.
    await page.locator('#analysis-source').selectOption('points');
    await page.locator('[data-view="measure"]').click();
    await receive(page,70); await page.locator('#capture-continuous-point').click();
    await editCondition(page,3,'6');
    const finished=await finishSnapshot(page);
    await page.locator('[data-view="analysis"]').click();
    await expect(page.locator('#raw-rows [data-sample-id]')).toHaveCount(3);
    await expect(page.locator('#apply-new-data')).toBeHidden();
    await page.locator('#analysis-source').selectOption('recorded');
    await expect(page.locator('#apply-new-data')).toBeHidden();
    await page.clock.runFor(1200);
    const after=(await page.evaluate(()=>window.pointTest.snapshot())).workspace.bySource.recorded;
    expect(after.appliedIds).toHaveLength(finished.samples.length);
  });

  test('collapsed capture and table edits preserve the continuous stream, sample origins and recording gates', async ({ page }) => {
    const button = page.locator('#capture-continuous-point'), panel = page.locator('#point-panel > summary');
    await expect(button).toBeDisabled();
    expect((await readState(page)).storage).toBeUndefined();
    await panel.click(); await defineCondition(page);
    await panel.click();
    await page.locator('#start-recording').click();
    await expect(button).toBeDisabled(); // Confirmed preview is not yet accepted continuous data.
    await receive(page, 50);
    const origin1 = (await readState(page)).storage.lastSampleId;
    await button.click(); await page.clock.runFor(250);
    await expect(button).toBeDisabled();
    expect((await readState(page)).storage.sampleCount).toBe(origin1);
    await panel.click();
    const field = page.locator('[data-point-id="1"] input');
    await field.fill('잘못');
    // Reflow and disclosure must preserve editable drafts and keyboard access.
    for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(viewport); await page.clock.runFor(250);
      await expect(field).toBeFocused(); await expect(field).toHaveValue('잘못');
      await panel.focus(); await panel.press('Space');
      await expect(field).toBeHidden();
      await panel.press('Enter');
      await expect(field).toBeVisible(); await expect(field).toHaveValue('잘못');
      await field.focus();
    }
    await receive(page, 60);
    await expect(field).toHaveValue('잘못');
    const origin2 = (await readState(page)).storage.lastSampleId;
    await button.click(); await page.clock.runFor(250);
    expect((await readState(page)).session.state).toBe('recording');
    expect((await readState(page)).storage.sampleCount).toBe(origin2);
    await expect(field).toHaveValue('잘못');
    await editCondition(page, 2, '5');
    await panel.click();
    await page.locator('[data-point-marker="1"]').click();
    await page.locator('[data-point-open="2"]').click(); await page.clock.runFor(250);
    await expect(field).toBeFocused(); await expect(field).toHaveValue('잘못');
    await field.press('Escape'); await field.fill('-2.5'); await field.press('Enter');
    await field.fill('Infinity'); await field.press('Enter');
    await expect(field).toHaveAttribute('aria-invalid','true');
    await receive(page, 70); // Invalid row drafts never stop continuous samples.
    expect((await readState(page)).storage.sampleCount).toBeGreaterThan(origin2);
    await field.press('Escape');
    await page.locator('[data-view="analysis"]').click();
    await receive(page, 80);
    await page.locator('[data-view="measure"]').click();
    expect((await readState(page)).session.state).toBe('recording');
    await expect(field).toHaveValue('-2.5');
    const noticeBeforePause = await page.locator('#measurement-action-message').textContent();
    await page.locator('#pause-recording').click();
    const count = (await readState(page)).storage.sampleCount;
    await receive(page, 90); await expect(button).toBeDisabled();
    await expect(page.locator('#measurement-action-message')).toHaveText(noticeBeforePause);
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
    await page.locator('#add-note').click(); await page.locator('#event-note').fill('같은 위치에서 관찰'); await page.locator('#event-note').press('Escape');
    await receive(page, 60); await button.click(); await page.clock.runFor(250);
    await expect(page.locator('[data-point-marker="1"]')).toBeVisible();
    await expect(page.locator('.measurement-event-marker button')).toBeVisible();
    await page.locator('[data-point-marker="1"]').click();
    await expect(page.locator('dialog[open] [data-point-marker-id]')).toHaveCount(2);
    await page.locator('[data-point-open="2"]').click(); await page.clock.runFor(250);
    const row = page.locator('[data-point-id="2"]');
    await expect(row.locator('[data-point-action="options"]')).toBeFocused();
    await page.locator('#point-options').press('Escape');
    await row.locator('[data-point-action="options"]').click();
  await page.locator('#point-options [data-point-action="withdraw"]').click(); await page.clock.runFor(250);
    expect((await readState(page)).storage.pointCount).toBe(1);
    await page.locator('[data-point-marker="1"]').click();
    await expect(page.locator('dialog[open] [data-point-marker-id]')).toHaveCount(1);
    await page.locator('dialog[open]').press('Escape');
    await expect(page.locator('[data-point-marker="1"]')).toBeFocused();
    await row.locator('[data-point-action="options"]').click();
  await page.locator('#point-options [data-point-action="withdraw"]').click(); await page.clock.runFor(250);
    await page.evaluate(() => window.pointTest.transport.disconnect()); await page.clock.runFor(250);
    await expect(button).toBeHidden();
    await page.locator('#measurement-reconnect').click();
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


test('point analysis selects records in the table and keeps mobile axis controls available', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await defineCondition(page);
  for (let id=1;id<=3;id++) { await receive(page,40+id); await capture(page); await editCondition(page,id,String(id)); }
  await page.locator('#analyze-points').click();
  await expect(page.locator('#toggle-axis-settings')).toHaveAttribute('aria-expanded','false');
  await page.locator('#toggle-axis-settings').click();
  await page.locator('#graph-x').selectOption('sampleId');
  await page.locator('#toggle-axis-settings').click();
  await page.locator('#tab-overview').click();
  await page.locator('#choose-range').click();
  await expect(page.locator('#time-range-start')).not.toBeVisible();
  await expect(page.locator('#raw-rows [data-select="1"]')).toBeFocused();
  await page.locator('#raw-rows [data-select="1"]').check();
  await page.locator('#raw-rows [data-select="3"]').check();
  await page.locator('#analyze-selection').click();
  await expect(page.locator('#analysis-chart')).toBeVisible();
  await expect(page.locator('#toggle-axis-settings')).toHaveAttribute('aria-expanded','false');
  await page.clock.runFor(1200);
  const selected=(await page.evaluate(()=>window.pointTest.snapshot())).workspace.bySource.points;
  expect(selected.appliedIds).toEqual([1,3]); expect(selected.graph.xColumnId).toBe('sampleId');
  await page.locator('#edit-analysis-range').click();
  await page.locator('#use-all-points').click();
  await page.clock.runFor(1200);
  const all=(await page.evaluate(()=>window.pointTest.snapshot())).workspace.bySource.points;
  expect(all.appliedIds).toEqual([1,2,3]); expect(all.appliedScope).toBe('all');
});

test('point analysis edits apply automatically, preserve evidence and export the latest values', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await defineCondition(page); await capture(page); await editCondition(page, 1, '0');
  await receive(page,60); await capture(page); await editCondition(page, 2, '3');
  await page.locator('#analyze-points').click();
  await expect(page.locator('#analysis-source')).toHaveValue('points');
  await page.locator('#use-graph-for-reflection').click();
  await page.locator('#tab-relationship').click();
  await page.locator('[data-edit-condition="1"]').click();
  await page.locator('#point-condition-dialog input').fill('wrong');
  await page.locator('#point-condition-dialog input').press('Escape');
  await expect(page.locator('#point-condition-dialog [role="alert"]')).not.toBeEmpty();
  await page.locator('#point-condition-dialog input').fill('7');
  await page.locator('#point-condition-dialog input').press('Escape');
  await expect(page.locator('#point-condition-dialog')).toHaveCount(0);
  await expect(page.locator('[data-edit-condition="1"]')).toHaveText('7');
  await expect(page.locator('[data-edit-condition="1"]')).toBeFocused();
  await expect(page.locator('#apply-new-data')).toBeHidden();
  await page.locator('[data-export="analysis-csv"]:visible').click();
  const appliedCsv = await downloadCsv(page, () => page.locator('#analysis-export-dialog [data-confirm]').click());
  const applied = await page.evaluate(async csv => {const {parseExperimentCsv}=await import('/src/data/files/csv.js');return parseExperimentCsv(csv);},appliedCsv);
  expect(applied.samples[0].importedValues['data-manual-condition'].value).toBe(7);
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

for (const tab of ['point','continuous']) for (const continuous of [false,true]) {
  test('display and storage are independent: '+tab+' / continuous '+continuous, async ({page})=>{
    await page.locator('button[data-recording-mode="'+tab+'"]').click();
    const toggle=page.locator('#continuous-recording');
    if ((await toggle.getAttribute('aria-checked'))!==String(continuous)) await toggle.click();
    const captureAction=page.locator(tab==='point'?'#capture-point':'#capture-continuous-point');
    if (continuous) {
      await expect(captureAction).toBeHidden();
      await page.locator('#start-recording').click(); await receive(page,41);
    } else await expect(page.locator('#start-recording')).toBeHidden();
    await captureAction.click();
    await expect.poll(async()=> (await readState(page)).storage?.pointCount).toBe(1);
    const initial=(await readState(page)).storage;
    await expect(toggle).toBeDisabled();
    await page.locator('#pause-recording').click();
    const values=page.locator(tab==='point'?'.point-live-cards strong':'#live-cards strong');
    const frozen=await values.allTextContents();
    const count=(await readState(page)).storage.sampleCount;
    await receive(page,90);
    expect(await values.allTextContents()).toEqual(frozen);
    expect((await readState(page)).storage.sampleCount).toBe(count);
    await expect(captureAction).toBeVisible();
    await expect(captureAction).toBeDisabled();
    const other=tab==='point'?'continuous':'point';
    await page.locator('button[data-recording-mode="'+other+'"]').click();
    expect((await readState(page)).storage.id).toBe(initial.id);
    await expect(toggle).toHaveAttribute('aria-checked',String(continuous));
    if(other==='continuous') {
      if(continuous) await expect(page.locator('[data-live-range="all"]')).toBeEnabled();
      else await expect(page.locator('[data-live-range="all"]')).toBeDisabled();
    }
    await page.locator('#resume-recording').click();
    await receive(page,60);
    if(!continuous) expect((await readState(page)).storage.sampleCount).toBe(count);
    await page.locator(other==='point'?'#capture-point':'#capture-continuous-point').click();
    await expect.poll(async()=> (await readState(page)).storage.pointCount).toBe(2);
    expect((await readState(page)).storage.recordingMode).toBe(continuous?'continuous':'point');
    await page.locator('#finish-recording').click();
    await expect(page.locator('#capture-point')).toBeHidden();
    await expect(page.locator('#capture-continuous-point')).toBeHidden();
    await expect(page.locator('#additional-recording')).toBeEnabled();
    await expect(page.locator('#prepare-new-experiment')).toBeEnabled();
  });
}

test('memos share one editable timeline across views and preserve time, drafts and withdrawn records', async ({page}) => {
  await capture(page);
  await page.locator('#add-note').click();
  const opened=await page.evaluate(()=>Date.now());
  await page.locator('#event-note').fill('관찰 내용');
  await receive(page,55);
  await expect(page.locator('#event-note')).toHaveValue('관찰 내용');
  await page.locator('#event-note').press('Escape');
  await page.locator('#finish-recording').click();
  const snapshot=await page.evaluate(()=>window.pointTest.snapshot());
  const memo=snapshot.events.find(event=>event.type==='note');
  expect(memo.receivedAt).toBeLessThanOrEqual(opened);
  expect(memo.payload.note).toBe('관찰 내용');
  const row=page.locator('[data-memo-id="'+memo.eventId+'"]');
  await page.locator('button[data-recording-mode="continuous"]').click();
  await row.locator('[data-memo-action="edit"]').click();
  await page.locator('#event-note').fill('수정한 관찰');
  // Reopening the anchor first commits its draft, then reads the latest memo.
  await row.locator('[data-memo-action="edit"]').click();
  await expect(page.locator('#event-note')).toHaveValue('수정한 관찰');
  await page.locator('#event-note').press('Escape');
  await row.locator('[data-memo-action="options"]').click();
  await page.locator('[data-memo-action="withdraw"]').click();
  await expect(page.locator('.measurement-event-marker button')).toHaveCount(0);
  await row.locator('[data-memo-action="options"]').click();
  await page.locator('[data-memo-action="withdraw"]').click();
  await expect(page.locator('.measurement-event-marker button')).toHaveCount(1);
  await page.locator('.measurement-event-marker button').click();
  await expect(page.locator('#event-note')).toBeFocused();
  await expect(page.locator('#event-note')).toHaveValue('수정한 관찰');
  await page.locator('#event-note').press('Escape');
  await page.locator('.luminous-settings').click();
  await page.locator('.measurement-system-events > summary').click();
  await expect(page.locator('#measurement-system-list')).toBeVisible();
  await page.locator('.luminous-close').click();
  await page.locator('[data-view="analysis"]').click();
  await page.locator('[data-screen="analysis"] > .event-log > summary').click();
  const analysisMemo=page.locator('#analysis-events [data-event-id="'+memo.eventId+'"]');
  await analysisMemo.click();
  await expect(page.locator('#event-note')).toBeVisible();
  await expect(page.locator('#event-note')).toBeFocused();
  await page.locator('#event-note').fill('분석에서 수정한 관찰');
  await page.locator('#event-note').press('Escape');
  await expect(analysisMemo).toBeFocused();
  await expect(page.locator('#analysis-events')).toContainText('분석에서 수정한 관찰');
  await page.locator('[data-view="saved"]').click();
  await expect.poll(async()=>{await page.clock.runFor(1100);return (await readState(page)).storage.status;}).toBe('clean');
  const saved=await page.evaluate(()=>window.pointTest.snapshot());
  const updated=saved.events.find(event=>event.eventId===memo.eventId);
  expect(updated.receivedAt).toBe(memo.receivedAt);
  expect(updated.payload).toEqual({note:'분석에서 수정한 관찰',withdrawn:false});
  expect(saved.samples).toEqual(snapshot.samples);
});

for (const paused of [false,true]) {
  test('finishing preserves disabled controls until saving completes: paused '+paused, async ({page}) => {
    await capture(page);
    if (paused) await page.locator('#pause-recording').click();
    const control=page.locator(paused?'#resume-recording':'#pause-recording');
    await page.evaluate(() => { window.pointTest.delaySave=true; });
    await page.locator('#finish-recording').click();
    await expect.poll(() => page.evaluate(() => !!window.pointTest.releaseSave)).toBe(true);
    await page.clock.runFor(250);
    await expect(control).toBeVisible();
    await expect(control).toBeDisabled();
    await expect(page.locator('#capture-point')).toBeDisabled();
    await expect(page.locator('#finish-recording')).toBeDisabled();
    await expect(page.locator('#prepare-new-experiment')).toBeDisabled();
    await page.evaluate(() => window.pointTest.releaseSave());
    await expect.poll(async () => (await readState(page)).session.state).toBe('ended');
    await expect(control).toBeHidden();
    await expect(page.locator('#additional-recording')).toBeEnabled();
    expect((await page.evaluate(() => window.pointTest.snapshot())).pointRecords).toHaveLength(1);
  });
}

for (const continuous of [false,true]) {
  test('reconnect replaces capture and waits for explicit resume: continuous '+continuous, async ({page}) => {
    if (continuous) {
      await page.locator('#continuous-recording').click();
      await page.locator('#start-recording').click();
      await receive(page,41);
    }
    await capture(page);
    const original=(await readState(page)).storage;
    await page.evaluate(() => window.pointTest.transport.disconnect());
    await page.clock.runFor(250);
    await expect(page.locator('#measurement-reconnect')).toBeEnabled();
    await expect(page.locator('#capture-point')).toBeHidden();
    await expect(page.locator('#pause-recording')).toBeHidden();
    await expect(page.locator('#finish-recording')).toBeEnabled();
    await page.locator('#measurement-reconnect').click();
    await expect.poll(async () => (await readState(page)).session.state).toBe('paused');
    await receive(page,70);
    expect((await readState(page)).storage.id).toBe(original.id);
    expect((await readState(page)).storage.sampleCount).toBe(original.sampleCount);
    await expect(page.locator('#measurement-reconnect')).toBeHidden();
    await expect(page.locator('#capture-point')).toBeVisible();
    await expect(page.locator('#capture-point')).toBeDisabled();
    await page.locator('#resume-recording').click();
    await receive(page,80); await capture(page);
    expect((await readState(page)).storage.pointCount).toBe(2);
  });
}
