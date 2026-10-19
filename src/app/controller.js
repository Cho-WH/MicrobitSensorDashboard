import { catalog, getExperiment, getSensorRuntime, getActivityPolicy } from '../catalog/index.js';
import { createTransport } from '../device/transport.js';
import { createMockBleClient } from '../device/mock-client.js';
import { createProgrammer } from '../device/programmer.js';
import { createGuideView } from '../ui/guide-view.js';
import { appBaseUrl, parseRoute, routeUrl, sameExperiment } from './routes.js';
import { createRepository } from '../data/repository.js';
import { openRunStore, openTemporaryRunStore } from '../data/run-store.js';
import { createSession, restoreSession } from '../measurement/session.js';
import { parseExperimentJson, buildExperimentJson } from '../data/files/json.js';
import { parseExperimentCsv, buildCsv, buildAnalysisCsv } from '../data/files/csv.js';
import { createAnalysisView } from '../ui/analysis-view.js';
import { createMeasurementView } from '../ui/measurement-view.js';
import { createExperimentGuide } from '../ui/experiment-guide.js';
import { getGuideContent } from '../guide/steps.js';
import { createActionHelp } from '../ui/action-help.js';
import { downloadText, downloadUrl } from '../ui/download.js';
import { LIMITS } from '../domain/limits.js';
import { findElement } from '../ui/dom.js';

// Connects modules and owns navigation only. Source records live exclusively in RunStore.
export function createController(root = document, { repository = null, deviceTransport = null, historyEnabled = true, initialUrl = location.href } = {}) {
  const $ = id => root.getElementById(id), abort = new AbortController(), { signal } = abort;
  const input = id => findElement(root, 'input', '#' + id);
  const button = id => findElement(root, 'button', '#' + id);
  const dialogElement = id => findElement(root, 'dialog', '#' + id);
  let context = getExperiment(), store = null, session = null, screen = 'home';
  let preview = null, previewPoints = [], previewSequence = 0, attempt = 0, connected = false, connecting = false, busy = false;
  let renderRequested = true, renderedEvents = -1, renderedContext = null, exportedRevision = -1;
  const mock = new URL(initialUrl).searchParams.get('mock') === '1';
  const repo = repository ?? createRepository({ onUnavailable: message => showError(message) });
  const transport = deviceTransport ?? createTransport(mock ? {ble:createMockBleClient(()=>context)} : {});
  let targetContext = null, runtime = null, programmer = null, programmerState = {}, installed = false;
  let deviceState = transport.getState();
  const guide = createGuideView($('guide-host'), { onInstall: () => act(install), onConnect: options => act(()=>connect(options)),
    onDisconnect: () => disconnect().catch(showError), onChange: () => { renderRequested = true; }, onMeasure:()=>navigate('measure'), onError: showError,
    onDeviceAction: action => act(async()=>{if(session?.getState().recording) return; await transport.performAction(action);}) });
  const measurement = createMeasurementView(root,()=>{renderRequested=true;});
  const experimentGuide = createExperimentGuide(root.querySelector('.lab-shell'));
  const analysis = createAnalysisView(root.querySelector('[data-screen="analysis"]'), { onError: showError, onExport: kind => act(() => exportFile(kind)) });
  const help = createActionHelp(root, { messages: { tableSelection: {label:'표 선택과 분석 대상',text:'체크한 행과 분석에 쓰는 자료는 별개입니다. 선택 자료로 분석을 누르면 분석 대상을 바꿀 수 있고, 분석에서 제외를 누르면 원자료를 보존하면서 계산에서 뺍니다.'} } });
  const policy = () => getActivityPolicy(context);
  const onChange = () => { renderRequested = true; };
  function showError(error) { $('lab-error').textContent = error?.message ?? String(error); $('lab-error').hidden = false; }
  function clearError() { $('lab-error').hidden = true; $('lab-error').textContent = ''; }
  async function act(work) {
    if (busy || programmerState.busy) return;
    busy = true; clearError(); renderRequested = true;
    try { await work(); } catch(error) { showError(error); }
    finally { busy = false; renderRequested = true; }
  }
  function listen(id, work) { $(id).addEventListener('click', () => act(work), { signal }); }
  function accept(input) {
    if (input.attemptId !== attempt) return;
    if (input.type === 'reading') {
      preview = input; previewPoints.push({ ...input, sampleId: ++previewSequence });
      if (previewPoints.length > 600) previewPoints = previewPoints.slice(-600);
    }
    try { session?.acceptInput(input); } catch(error) { showError(error); }
    renderRequested = true;
  }
  async function disconnect() {
    connected = false; connecting = false; preview = null; previewPoints = [];
    session?.disconnected();
    await transport.disconnect(); deviceState=transport.getState(); attempt=deviceState.attemptId;
    renderRequested = true;
  }
  function canInstall() {
    const saved = store?.getState(), current = session?.getState();
    return !!runtime && !mock && !connected && !connecting && saved?.source !== 'import'
      && (!saved || (saved.writable && saved.status === 'clean' && (!current || current.state === 'ended')));
  }
  function resetPreparation() {
    programmer?.dispose().catch(showError); programmer = null; programmerState = {}; installed = false;
    try { runtime = getSensorRuntime(context); } catch { runtime = null; }
    deviceState = transport.getState();
    guide.open(context, {reset:true});
    if (runtime) programmer = createProgrammer({ firmwareId: runtime.definition.firmware.id,
      version: runtime.definition.firmware.version, canInstall, beforeFlash: disconnect,
      onState: state => {
        programmerState = state; if (state.installedThisSession) installed = true; renderRequested = true;
        // Preserve each installation boundary even when a fast retry ends between render ticks.
        if (state.status === 'connecting') render();
      } });
  }
  async function install() {
    if (!canInstall()) throw new Error('기록과 저장을 마치고 무선 연결을 해제한 뒤 설치하세요.');
    if (!programmer?.getState().canInstall) { await programmer?.prepare(); return; }
    installed = false; await programmer.install();
  }
  async function connect({reuseDevice=false}={}) {
    if (!runtime || store?.getState().source === 'import') throw new Error('새 실험을 선택한 뒤 장비를 연결하세요.');
    if (session?.getState().recording) throw new Error('기록을 일시정지한 뒤 장비를 다시 연결하세요.');
    if (connected || connecting) return;
    connecting = true; renderRequested = true;
    try {
      await transport.connect(context, accept, state => {
        const wasConnected = connected;
        deviceState = state; attempt = state.attemptId;
        connected = state.status === 'connected'; connecting = state.status === 'connecting';
        if (screen==='measure' && state.devicePreparation && !state.devicePreparation.allowReadings) navigate('prepare');
        if (wasConnected && !connected) { preview = null; previewPoints = []; session?.disconnected(); }
        renderRequested = true;
      },{reuseDevice});
    } catch(error) { await disconnect(); throw error; }
    finally { connecting = false; renderRequested = true; }
  }
  function hasFreshReading() { return connected && transport.getState().confirmed; }
  function readyToRecord() { return hasFreshReading(); }
  function requireReady() {
    if (!readyToRecord()) throw new Error('장치를 연결하고 새 측정값이 정상적으로 들어오는지 확인하세요.');
  }
  async function start() {
    requireReady();
    if (store) throw new Error('새 실험 준비를 눌러 다음 실험을 시작하세요.');
    const recordedContext = { ...context, setup: guide.getProgress().setup };
    const nextStore = await openRunStore({ repository: repo, context: recordedContext, name: input('run-name').value.trim() || undefined, source: mock ? 'replay' : 'device', create: true, onChange });
    if (!readyToRecord()) {
      // Roll back only this never-started, empty Run while still owning its writer lock.
      try { await nextStore.remove(); } finally { nextStore.dispose(); }
      throw new Error('준비 상태가 바뀌어 기록을 시작하지 않았습니다. 장비를 확인하고 다시 시작하세요.');
    }
    store = nextStore; session = createSession({ store, activityPolicy: policy() }); session.start();
    renderedEvents = -1;
  }
  async function persistCurrent() {
    if (!analysis.flush()) throw new Error('분석 글을 먼저 확인해 주세요.');
    if (session && !['ended','preview'].includes(session.getState().state)) await session.finish();
    if (store?.getState().writable) await store.flush();
  }
  async function confirmTransition() {
    if (!store) return true;
    if (!analysis.flush()) return false;
    if (session?.getState().recording || store.getState().status !== 'clean' || (store.getState().temporary && exportedRevision !== store.getState().runRevision)) {
      const dialog = dialogElement('leave-dialog');
      $('leave-save').textContent = store.getState().temporary ? '파일로 보관하고 이동' : session?.getState().recording ? '기록을 마치고 이동' : '저장하고 이동';
      dialog.returnValue = '';
      const answer = await new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue), { once:true }); dialog.showModal(); });
      if (answer !== 'save') return false;
      if (store.getState().temporary) await exportFile('json');
    }
    await persistCurrent(); return true;
  }
  async function releaseCurrent() {
    await store?.close();
    analysis.reset(); session = null; store = null; exportedRevision = -1; renderedEvents = -1;
  }
  function browse(next, push = true) {
    targetContext = next;
    $('preview-title').textContent = next.activity?.name ?? next.sensor.name;
    $('preview-preparation').replaceChildren(...next.preparation.map(text => { const item=document.createElement('li'); item.textContent=text; return item; }));
    $('preview-channels').textContent=next.channels.map(channel=>channel.name+' ('+channel.unit+')').join(' · ');
    const preparation=getGuideContent(next);
    $('preview-equipment').textContent=[...preparation.equipment,...preparation.activityEquipment].map(item=>item.name).join(' · ');
    $('preview-transition-note').textContent = store ? '새 실험을 시작하면 현재 기록을 마치고 저장합니다.' : '';
    navigate('preview', push);
  }
  async function activateExperiment(prepared=false) {
    const next = targetContext;
    if (!next || !await confirmTransition()) return;
    const keepPreparation = runtime && store?.getState().source !== 'import'
      && next.sensor.id === context.sensor.id && next.sensor.version === context.sensor.version
      && next.firmware.id === context.firmware?.id && next.firmware.version === context.firmware?.version
      && next.firmware.sha256 === context.firmware?.sha256;
    if (!keepPreparation) await disconnect();
    await releaseCurrent();
    context = next; targetContext = null; renderedContext = null; input('run-name').value = '';
    if (keepPreparation) guide.open(context); else resetPreparation();
    navigate('prepare');
    if(prepared)guide.showPrepared();
  }
  function applyLocation(url = location.href) {
    if (programmerState.busy || busy) {
      if (historyEnabled) history.replaceState(null, '', routeUrl(screen === 'preview' ? targetContext : context, screen, {mock}));
      return;
    }
    try {
      const route = parseRoute(url);
      if (route.context && !sameExperiment(route.context, context)) {
        if (store || connected || connecting) return browse(route.context, false);
        context = route.context; renderedContext = null; resetPreparation();
      }
      navigate(route.screen === 'analysis' && !store ? 'saved' : route.screen, false);
    } catch(error) { navigate('home', false); showError(error); }
  }
  async function openRun(id) {
    if (store?.getState().id === id) return navigate('analysis');
    if (!await confirmTransition()) return;
    // Opening failure leaves the current Run in place.
    const next = await openRunStore({ repository: repo, id, onChange });
    try { await disconnect(); await releaseCurrent(); } catch(error) { next.dispose(); throw error; }
    store = next; context = store.getRun().context;
    restoreSession({ store, activityPolicy: policy() });
    // A saved run is opened for analysis; recording only resumes through an explicit action.
    session = store.getState().writable && store.getState().source !== 'import' ? createSession({ store, activityPolicy: policy() }) : null;
    renderedContext = null; resetPreparation(); analysis.open(store); navigate('analysis');
  }
  async function importSnapshot(snapshot) {
    if (!await confirmTransition()) return;
    let next;
    if (!navigator.locks) next = await openTemporaryRunStore({snapshot,onChange});
    else {
      try { next = await openRunStore({ repository: repo, importSnapshot: snapshot, onChange }); }
      catch(error) {
        if (error.code !== 'storage-unavailable') throw error;
        next = await openTemporaryRunStore({snapshot,onChange});
      }
    }
    try { await disconnect(); await releaseCurrent(); } catch(error) { next.dispose(); throw error; }
    store = next; context = store.getRun().context;
    renderedContext = null; resetPreparation(); analysis.open(store); navigate('analysis');
  }
  async function readFile(file) {
    if (!file) return;
    if (file.size > LIMITS.fileBytes) throw new Error('32 MiB 이하의 실험 파일을 선택하세요.');
    const text = await file.text();
    try {
      const snapshot = file.name.toLowerCase().endsWith('.csv') ? parseExperimentCsv(text, { filename:file.name }) : parseExperimentJson(text);
      await importSnapshot(snapshot);
    } catch(error) {
      if (error.code !== 'CSV_MAPPING_REQUIRED') throw error;
      await mapCsv(text, file.name, error.headers);
    }
  }
  async function mapCsv(text, filename, headers) {
    const dialog = dialogElement('csv-mapping'), body = $('csv-columns'); body.replaceChildren();
    for (const [index, header] of headers.entries()) {
      const row = document.createElement('div'); row.className = 'lab-controls'; row.dataset.header = header;
      const title = document.createElement('strong'); title.textContent = header;
      const role = document.createElement('select'); role.setAttribute('aria-label', header + ' 역할');
      for (const [value,label] of [['value','측정값'],['time','시각 (ISO)'],['ignore','사용하지 않음']]) role.add(new Option(label,value));
      const name = document.createElement('input'); name.value = header; name.maxLength = 60; name.setAttribute('aria-label', header + ' 이름');
      const unit = document.createElement('input'); unit.placeholder = '단위'; unit.maxLength = 30; unit.setAttribute('aria-label', header + ' 단위');
      row.append(title,role,name,unit); body.append(row);
    }
    dialog.returnValue = '';
    const answer = await new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue), {once:true}); dialog.showModal(); });
    if (answer !== 'apply') return;
    const mapping = {confirmed:true, timestamp:null, columns:[], ignoredHeaders:[]};
    for (const [index,row] of [...body.querySelectorAll('div')].entries()) {
      const [name,unit] = row.querySelectorAll('input'), role = row.querySelector('select').value;
      if (role === 'time') { if (mapping.timestamp) throw new Error('시각 열은 하나만 선택하세요.'); mapping.timestamp = row.dataset.header; }
      else if (role === 'ignore') mapping.ignoredHeaders.push(row.dataset.header);
      else mapping.columns.push({header:row.dataset.header,id:'column'+(index+1),name:name.value,unit:unit.value || null});
    }
    await importSnapshot(parseExperimentCsv(text, {filename,mapping}));
  }
  async function exportFile(kind) {
    if (!store || !analysis.flush()) return;
    const snapshot = store.getSnapshot(), name = snapshot.run.name.replace(/[<>:"/\\|?*]/g,'-');
    if (kind === 'png') return downloadUrl(analysis.exportPng(name), name + '.png');
    const text = kind === 'json' ? buildExperimentJson(snapshot) : kind === 'analysis-csv' ? buildAnalysisCsv(snapshot) : buildCsv(snapshot);
    downloadText(text, name + (kind === 'json' ? '.json' : '.csv'), kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8');
    if (kind === 'json') exportedRevision = store.getState().runRevision;
  }
  async function listRuns() {
    const runs = await repo.listRuns(), list = $('saved-runs'); list.replaceChildren();
    if (!runs.length) { list.textContent = '저장된 실험이 없습니다.'; return; }
    for (const run of runs) {
      const li = document.createElement('li'), text = document.createElement('div'), small = document.createElement('small'), open = document.createElement('button');
      text.textContent = run.name; small.textContent = new Date(run.updatedAt).toLocaleString('ko-KR') + ' · ' + (run.context.activity?.name ?? run.context.sensor.name ?? '가져온 자료');
      text.append(small); open.textContent = '실험 열기'; open.addEventListener('click', () => act(() => openRun(run.id)), {signal});
      li.append(text,open); list.append(li);
    }
  }
  function navigate(next, push = true) {
    if (programmerState.busy || !analysis.flush()) return;
    screen = next;
    if (historyEnabled && push) history.pushState(null, '', routeUrl(next === 'preview' ? targetContext : context, next, {mock}));
    findElement(root,'a','.skip-link').href = location.pathname + location.search + '#main';
    if (next === 'prepare' && !mock) programmer?.prepare().catch(showError);
    for (const section of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-screen]'))) section.hidden = section.dataset.screen !== next;
    for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('[data-view]'))) { if(button.dataset.view === next) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); }
    if (next === 'analysis') analysis.open(store);
    if (next === 'saved') listRuns().catch(showError);
    if (next === 'measure' && store?.getState().source !== 'import') experimentGuide.show(context,{automatic:true,anchor:$('show-experiment-guide')});
    renderRequested = true;
  }
  function render() {
    deviceState=transport.getState();
    const saved = store?.getState(), current = session?.getState(), recording = current?.recording;
    guide.render({attemptId:attempt,connected,connecting,deviceMessage:deviceState.message,deviceName:deviceState.deviceName,receptionReady:hasFreshReading(),receivedAt:deviceState.lastReceivedAt,latest:preview,
      firmwareInstalled:installed ? context.firmware : false,calibration:deviceState.calibration ?? 'unknown',devicePreparation:deviceState.devicePreparation,
      busy:busy || programmerState.busy,recording:recording || current?.state === 'finishing',programmerState,mock,
      canInstall:canInstall(),canReconnect:deviceState.canReconnect,unsupported:!transport.isSupported(),canConnect:!!runtime && !recording && !connected && !connecting && saved?.source !== 'import' && transport.isSupported()});
    $('current-experiment').hidden = !store || !['home','preview','saved'].includes(screen);
    $('current-experiment-label').textContent = saved ? saved.name + ' · ' + (recording ? '기록 중' : '보관한 자료') : '';
    $('prepare-title').textContent = (context.activity?.name ?? context.sensor.name) + ' · 장비 준비';
    $('device-detail').textContent = [deviceState.deviceName,deviceState.message].filter(Boolean).join(' · ');
    button('to-measure').disabled = busy || !!programmerState.busy;
    button('activate-experiment').disabled = busy || !!programmerState.busy;
    button('activate-prepared').disabled = busy || !!programmerState.busy;
    $('disconnect').textContent = connecting ? '연결 취소' : '연결 해제';
    $('connect').textContent = mock ? '모의 장치 연결' : 'micro:bit 연결';
    $('connection-status').textContent = connecting ? '연결 중' : connected ? mock ? '모의 연결' : '연결됨' : '연결 안 됨';
    $('recording-status').textContent = ({recording:'기록 중',paused:'일시정지',finishing:'기록 마감 중',ended:'기록 마침',preview:'준비'})[current?.state] ?? (saved ? '저장된 자료' : '준비');
    $('storage-status').textContent = !saved ? '기록 시작 전' : saved.temporary ? '임시 분석' : !saved.writable ? '읽기 전용' : ({clean:'저장됨',saving:'저장 중',pending:'저장 대기',error:'저장 오류'})[saved.status];
    $('experiment-title').textContent = context.activity?.name ?? context.sensor.name ?? '가져온 자료';
    input('run-name').disabled = !!store || busy;
    button('connect').disabled = recording || connected || connecting || busy || !runtime || saved?.source === 'import' || (!mock && !transport.isSupported()) || !!programmerState.busy;
    $('reconnect').hidden=!deviceState.canReconnect||connected||connecting;
    button('reconnect').disabled=button('connect').disabled;
    $('connect').textContent=deviceState.canReconnect?'다른 장치 선택':mock?'모의 장치 연결':'micro:bit 연결';
    button('disconnect').disabled = (!connected && !connecting) || !!programmerState.busy;
    button('start-recording').disabled = !!store || busy || !readyToRecord() || !navigator.locks;
    button('pause-recording').disabled = !recording || busy;
    button('resume-recording').disabled = current?.state !== 'paused' || busy || !readyToRecord() || saved?.status === 'error';
    button('finish-recording').disabled = !session || ['ended','preview'].includes(current?.state) || busy;
    $('additional-recording').hidden = !session || current?.state !== 'ended'; button('additional-recording').disabled = busy || !readyToRecord();
    button('add-note').disabled = !session || !['recording','paused'].includes(current?.state) || busy;
    button('export-json').disabled = !saved; button('export-csv').disabled = !saved?.sampleCount;
    $('retry-save').hidden = saved?.status !== 'error';
    $('export-json').hidden=!saved; $('export-csv').hidden=!saved;
    $('show-experiment-guide').hidden=!getGuideContent(context).experimentGuide;
    experimentGuide.setRecording(Boolean(recording));
    $('sample-count').textContent = saved ? `원자료 ${saved.sampleCount.toLocaleString('ko-KR')}개` : '기록 시작 전 수신값은 미리보기입니다.';
    $('lab-notice').textContent = saved?.temporary ? '이 환경에서는 브라우저에 저장할 수 없습니다. 분석 결과는 전체 실험 JSON으로 보관하세요.' : saved?.error ? saved.error + ' 메모리의 자료는 유지됩니다. 다시 저장하거나 전체 실험 JSON을 보관하세요.'
      : saved?.nearLimit ? '보관 한도에 가까워졌습니다. 전체 실험 JSON으로 보관하고 새 실험을 준비하세요.'
      : current?.problem ? current.problem : !navigator.locks ? '이 브라우저에서는 새 실험을 기록할 수 없습니다. 저장된 자료를 열어 분석할 수 있어요.'
      : mock && connected ? '모의 장치를 사용하고 있어요. 실제 센서 측정값이 아닙니다.' : '';
    if (renderedContext !== context) {
      renderedContext = context;
      $('preparation-notes').replaceChildren(...(context.preparation ?? []).map(text => { const li=document.createElement('li'); li.textContent=text; return li; }));
      $('activity-actions').replaceChildren(...(context.activity?.events ?? []).map(event => { const button=document.createElement('button'); button.textContent=event.label; button.dataset.activityEvent=event.type; button.addEventListener('click',()=>act(()=>{if(!session?.markEvent(event.type)) throw new Error(session?.getState().problem || '기록 중 조작을 남길 수 있습니다.');}),{signal});return button; }));
    }
    for (const button of $('activity-actions').querySelectorAll('button')) button.disabled = !recording || busy;
    if (screen === 'measure') {
      measurement.render({context,store,latest:preview,previewPoints,device:deviceState,recording});
    }
    if (saved?.eventCount !== renderedEvents) {
      renderedEvents = saved?.eventCount;
      const labels={'recording-start':'기록 시작','recording-paused':'일시정지','recording-resumed':'기록 재개','measurement-end':'기록 마침',note:'메모','additional-measurement':'추가 측정',discontinuity:'측정 공백','reception-change':'수신 상태 변경',interrupted:'중단 후 복원',...Object.fromEntries((context.activity?.events ?? []).map(event=>[event.type,event.label]))};
      const records = store?.getEvents(100) ?? [];
      for (const id of ['lab-events','analysis-events']) $(id).replaceChildren(...records.slice(-100).map(e=>{const li=document.createElement('li');li.textContent=new Date(e.receivedAt).toLocaleTimeString('ko-KR')+' · '+(labels[e.type] ?? e.type)+(e.payload.note ? ' · '+e.payload.note : '');return li;}));
    }
    analysis.updateStatus();
  }
  for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('[data-view]'))) button.addEventListener('click',()=>navigate(button.dataset.view),{signal});
  listen('connect',()=>connect()); listen('reconnect',()=>connect({reuseDevice:true})); $('disconnect').addEventListener('click',()=>disconnect().catch(showError),{signal}); listen('start-recording',start);
  listen('pause-recording',()=>session.pause()); listen('resume-recording',()=>{requireReady();session.resume();});
  listen('finish-recording',async()=>{await session.finish();await store.flush();});
  listen('additional-recording',async()=>{requireReady();const dialog=dialogElement('additional-dialog');dialog.returnValue='';$('additional-activity-conditions').hidden=!context.activity;const result=await new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true});dialog.showModal();});if(result==='start'){requireReady();session.startAdditional({sameContext:true,...(context.activity ? {sameContainer:true,sameGas:true,samePosition:true} : {})});}});
  listen('add-note',()=>{const note=input('event-note').value.trim();if(!note)throw new Error('메모를 입력하세요.');session.markEvent('note',{note});input('event-note').value='';});
  listen('new-experiment',()=>navigate('home'));
  listen('activate-experiment',()=>activateExperiment()); listen('activate-prepared',()=>activateExperiment(true)); listen('prepare-device',()=>navigate('prepare'));
  listen('show-experiment-guide',()=>experimentGuide.show(context,{anchor:$('show-experiment-guide')}));
  listen('to-measure',()=>navigate('measure')); listen('return-current',()=>navigate(session ? 'measure' : 'analysis'));
  if (historyEnabled) window.addEventListener('popstate',()=>applyLocation(),{signal});
  const cards = [
    ...catalog.sensors.map(item => ({ name:item.name, next:getExperiment(item.id), target:'sensor-cards', description:item.channels.map(c=>c.name).join(' · ') })),
    ...catalog.activities.map(item => ({ name:item.name, next:getExperiment(item.sensorIds[0],item.id), target:'activity-cards', description:'준비 안내와 활동 기록, 분석 질문을 함께 사용합니다.' })),
  ];
  for (const item of cards) {
      const next = item.next;
      const link = document.createElement('a'); link.className='experiment-card'; link.href=routeUrl(next,'prepare',{mock}).href;
      const title=document.createElement('strong'),description=document.createElement('span');title.textContent=item.name;
      description.textContent=item.description;
      link.append(title,description);link.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();if(!busy&&!programmerState.busy)browse(next);},{signal});$(item.target).append(link);
  } listen('retry-save',()=>store.flush());
  listen('export-json',()=>exportFile('json'));listen('export-csv',()=>exportFile('csv'));
  $('open-file').addEventListener('click',()=>input('file-input').click(),{signal});
  input('file-input').addEventListener('change',()=>{const file=input('file-input').files[0];input('file-input').value='';act(()=>readFile(file));},{signal});
  for(const id of ['legacy-link','mock-link']) $(id).addEventListener('click',event=>{event.preventDefault();act(async()=>{if(await confirmTransition()) location.assign(id === 'mock-link' ? routeUrl(context,'prepare',{mock:true}).href : new URL('index.html',appBaseUrl).href);});},{signal});
  window.addEventListener('beforeunload',event=>{const draftsSaved=analysis.flush(),saved=store?.getState();if(!draftsSaved || session?.getState().recording || (saved?.writable && saved.status!=='clean') || (saved?.temporary && exportedRevision!==saved.runRevision)) {event.preventDefault();event.returnValue='';}},{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && store?.getState().writable){analysis.flush();store.flush().catch(showError);}},{signal});
  const interval = setInterval(()=>{
    try{session?.tick();}catch(error){showError(error);}
    if (connected || session?.getState().recording) renderRequested = true;
    if(renderRequested){renderRequested=false;render();}
  },200);
  resetPreparation(); applyLocation(initialUrl); render();
  return { async dispose(){
    await persistCurrent(); await disconnect(); await store?.close();
    clearInterval(interval);abort.abort();guide.dispose();await programmer?.dispose();analysis.dispose();help.dispose();measurement.dispose();experimentGuide.dispose();repo.close();
  }, getState:()=>({screen,context,busy:busy || !!programmerState.busy,storage:store?.getState(),session:session?.getState()}) };
}
