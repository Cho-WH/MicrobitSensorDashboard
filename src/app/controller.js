import { catalog, getExperiment, getSensorRuntime, getActivityPolicy, getActivityEvents } from '../catalog/index.js';
import { canResumeImportedRun } from '../data/files/recording-source.js';
import { createTransport } from '../device/transport.js';
import { createMockBleClient } from '../device/mock-client.js';
import { createProgrammer } from '../device/programmer.js';
import { createGuideView } from '../ui/guide-view.js';
import { parseRoute, routeUrl, sameExperiment } from './routes.js';
import { createRepository } from '../data/repository.js';
import { openRunStore, openTemporaryRunStore } from '../data/run-store.js';
import { createSession, restoreSession } from '../measurement/session.js';
import { parseExperimentJson, buildExperimentJson } from '../data/files/json.js';
import { parseExperimentCsv, buildCsv, buildAnalysisCsv } from '../data/files/csv.js';
import { createAnalysisView } from '../ui/analysis-view.js';
import { createMeasurementView } from '../ui/measurement-view.js';
import { createExperimentGuide } from '../ui/experiment-guide.js';
import { getGuideContent } from '../guide/steps.js';
import { getLabCopy, applyLabCopy, formatCopy, labDefaults } from '../ui/lab-copy.js';
import { createActionHelp } from '../ui/action-help.js';
import { downloadText, downloadUrl } from '../ui/download.js';
import { LIMITS } from '../domain/limits.js';
import { findElement } from '../ui/dom.js';
import { createRecordDialogs } from '../ui/record-dialogs.js';
import { renderEventList } from '../ui/event-content.js';
import { bindAppShell } from '../ui/app-shell.js';
import { createConnectionNotice } from '../ui/connection-notice.js';
import { createShareView } from '../ui/share-view.js';
import { renderHomeCards } from '../ui/home-view.js';

// Connects modules and owns navigation only. Source records live exclusively in RunStore.
export function createController(root = document, { repository = null, deviceTransport = null, historyEnabled = true, initialUrl = location.href,
  loadPage = (url, replace) => replace ? location.replace(url) : location.assign(url) } = {}) {
  const $ = id => root.getElementById(id), abort = new AbortController(), { signal } = abort;
  bindAppShell(root, { signal });
  const input = id => findElement(root, 'input', '#' + id);
  const button = id => findElement(root, 'button', '#' + id);
  const dialogElement = id => findElement(root, 'dialog', '#' + id);
  let context = null, store = null, session = null, screen = 'home';
  let copy = getLabCopy(null), copyContext;
  let preview = null, previewPoints = [], previewSequence = 0, attempt = 0, connected = false, connecting = false, busy = false;
  let leaving = false, navigatingDocument = false;
  let connectionRequest = 0, handingOff = false;
  let renderRequested = true, renderedEvents = -1, renderedContext = null, exportedRevision = -1;
  const mock = new URL(initialUrl).searchParams.get('mock') === '1';
  const repo = repository ?? createRepository({ onUnavailable: message => showError(message) });
  const transport = deviceTransport ?? createTransport(mock ? {ble:createMockBleClient(()=>context)} : {});
  const connectionNotice = createConnectionNotice(root, { signal });
  let targetContext = null, runtime = null, programmer = null, programmerState = {}, installed = false, recordingSourceAllowed = false;
  let deviceState = transport.getState();
  const guide = createGuideView($('guide-host'), { onInstall: () => act(install),
    onInstallMode: mode => act(async () => { if (canInstall()) { installed = false; await programmer?.setMode(mode); } }),
    onCancelInstall: () => programmer?.cancel(), onConnect: options => act(()=>connect(options)),
    onDisconnect: () => disconnect().catch(showError), onChange: () => { renderRequested = true; }, onMeasure:()=>navigate('measure'), onError: showError,
    onDeviceAction: action => act(async()=>{if(!context || !runtime || screen !== 'prepare' || session?.getState().recording) return; await transport.performAction(action);}) });
  const dialogs = createRecordDialogs(root.querySelector('.lab-shell'));
  const measurement = createMeasurementView(root,()=>{renderRequested=true;}, event=>act(()=>editEventNote(event)));
  const experimentGuide = createExperimentGuide(root.querySelector('.lab-shell'));
  const share = createShareView(findElement(root, 'section', '[data-screen="preview"]'));
  const analysis = createAnalysisView(root.querySelector('[data-screen="analysis"]'), { onError: showError, onExport: kind => act(() => exportFile(kind)) });
  const help = createActionHelp(root, { messages: { tableSelection: {label:'표 선택과 분석 대상',text:'체크한 행과 분석에 쓰는 자료는 별개입니다. 선택 자료로 분석을 누르면 분석 대상을 바꿀 수 있고, 분석에서 제외를 누르면 원자료를 보존하면서 계산에서 뺍니다.'} } });
  const policy = () => getActivityPolicy(context);
  const onChange = () => { renderRequested = true; };
  const canUseDevice = () => !!runtime && (!store || (!store.getState().temporary && store.getState().writable
    && recordingSourceAllowed));
  function showError(error) { $('lab-error').textContent = error?.message ?? String(error); $('lab-error').hidden = false; }
  function clearError() { $('lab-error').hidden = true; $('lab-error').textContent = ''; }
  async function act(work) {
    if (busy || programmerState.busy) return;
    // Async saving can disable (and blur) the pressed record control before the
    // final render. Remember its focus until the action has settled.
    const recordFocus = root.querySelector('.luminous-overview') && document.activeElement instanceof HTMLButtonElement
      && ['start-recording','pause-recording','resume-recording','finish-recording'].includes(document.activeElement.id) ? document.activeElement : null;
    busy = true; clearError(); renderRequested = true;
    try { await work(); } catch(error) { showError(error); }
    finally {
      if (navigatingDocument) return;
      busy = false; renderRequested = false; render();
      if (recordFocus && screen === 'measure' && !recordFocus.getClientRects().length
        && [recordFocus, document.body, $('recording-status')].some(element => element === document.activeElement)) {
        const next = ({recording:'pause-recording',paused:'resume-recording',ended:'additional-recording'})[session?.getState().state];
        if (next && !button(next).disabled) button(next).focus({preventScroll:true});
        else { $('recording-status').tabIndex=-1; $('recording-status').focus({preventScroll:true}); }
      }
    }
  }
  function listen(id, work) { $(id).addEventListener('click', () => act(work), { signal }); }
  function accept(input) {
    if (!context || !runtime || input.attemptId !== attempt) return;
    if (input.type === 'reading') {
      preview = input; previewPoints.push({ ...input, sampleId: ++previewSequence });
      if (previewPoints.length > 600) previewPoints = previewPoints.slice(-600);
    }
    try { session?.acceptInput(input); } catch(error) { showError(error); }
    renderRequested = true;
  }
  async function disconnect() {
    ++connectionRequest;
    if (handingOff) programmer?.cancel();
    connected = false; connecting = false; preview = null; previewPoints = [];
    session?.disconnected();
    await transport.disconnect(); deviceState=transport.getState(); attempt=deviceState.attemptId;
    renderRequested = true;
  }
  function canInstall() {
    const saved = store?.getState(), current = session?.getState();
    return !!context && !!runtime && !runtime.definition.firmware.stale && canUseDevice() && screen === 'prepare' && !mock && !connected && !connecting
      && (!saved || (saved.writable && saved.status === 'clean' && (!current || current.state === 'ended')));
  }
  function resetPreparation() {
    programmer?.dispose().catch(showError); programmer = null; programmerState = {}; installed = false;
    try { runtime = getSensorRuntime(context); } catch { runtime = null; }
    recordingSourceAllowed = !store || store.getState().source !== 'import' || canResumeImportedRun(store.getRun());
    deviceState = transport.getState();
    guide.open(context, {reset:true});
    if (runtime && !runtime.definition.firmware.stale) programmer = createProgrammer({ firmwareId: runtime.definition.firmware.id,
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
    if (!context || !canUseDevice() || !['prepare','measure'].includes(screen)) throw new Error('이 자료에는 장치를 연결할 수 없습니다. 새 실험을 준비하세요.');
    if (session?.getState().recording) throw new Error('기록을 일시정지한 뒤 장비를 다시 연결하세요.');
    if (connected || connecting) return;
    const request = ++connectionRequest;
    connecting = true; renderRequested = true;
    try {
      handingOff = programmerState.mode === 'wireless' && !!programmerState.connectionAvailable;
      const installedDevice = handingOff ? await programmer.takeConnection() : null;
      handingOff = false;
      if (request !== connectionRequest) {
        if (installedDevice?.gatt?.connected) installedDevice.gatt.disconnect();
        return;
      }
      await transport.connect(context, accept, state => {
        const wasConnected = connected;
        deviceState = state; attempt = state.attemptId;
        connected = state.status === 'connected'; connecting = state.status === 'connecting';
        if (screen==='measure' && state.devicePreparation && !state.devicePreparation.allowReadings) navigate('prepare');
        if (wasConnected && !connected) { preview = null; previewPoints = []; session?.disconnected(); }
        renderRequested = true;
      },{reuseDevice, device: installedDevice, reuseConnection: !!installedDevice?.gatt?.connected});
    } catch(error) { if (request === connectionRequest) { await disconnect(); throw error; } }
    finally { handingOff = false; if (request === connectionRequest) connecting = false; renderRequested = true; }
  }
  function hasFreshReading() { return connected && transport.getState().confirmed; }
  function readyToRecord() { return !!context && canUseDevice() && hasFreshReading(); }
  function requireReady() {
    if (!readyToRecord()) throw new Error('장치를 연결하고 새 측정값이 정상적으로 들어오는지 확인하세요.');
  }
  async function start() {
    if (screen !== 'measure') return;
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
  async function confirmTransition({ask = true, exit = false} = {}) {
    if (!store && !exit) return true;
    if (!exit && !analysis.flush()) return false;
    const temporary = store?.getState().temporary;
    if (exit || (ask && (session?.getState().recording || store.getState().status !== 'clean')) || (temporary && exportedRevision !== store.getState().runRevision)) {
      const dialog = dialogElement('leave-dialog');
      $('leave-dialog-title').textContent = exit ? copy.dialogs.exitTitle : copy.dialogs.leaveTitle;
      dialog.querySelector('p').textContent = exit ? temporary ? copy.dialogs.exitTemporaryNote : copy.dialogs.exitNote : copy.dialogs.leaveNote;
      dialog.querySelector('button[value="cancel"]').textContent = exit ? copy.dialogs.cancelExit : copy.dialogs.stay;
      $('leave-save').textContent = temporary ? copy.dialogs.exportLeave : exit ? copy.dialogs.exit : session?.getState().recording ? copy.dialogs.finishLeave : copy.dialogs.saveLeave;
      dialog.returnValue = '';
      const answer = await new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue), { once:true }); dialog.showModal(); });
      if (answer !== 'save') return false;
      if (temporary) await exportFile('json');
    }
    await persistCurrent(); return true;
  }
  async function releaseCurrent() {
    await store?.close();
    analysis.reset(); session = null; store = null; exportedRevision = -1; renderedEvents = -1;
  }
  // Save before replacing the document. The browser releases the old page's
  // connections; do not start another device teardown before this navigation.
  async function leaveExperiment(nextContext, nextScreen, push = true) {
    leaving = true; render();
    try {
      if (!await confirmTransition({ask:false, exit:!!context})) return 'cancelled';
      if (context && historyEnabled) {
        loadPage(routeUrl(nextContext, nextScreen, {mock}).href, !push);
        navigatingDocument = true;
        return 'navigating';
      }
      // Embedded controllers with navigation disabled retain their local lifecycle.
      await programmer?.dispose();
      await disconnect();
      await releaseCurrent();
      transport.forgetDevice?.(); deviceState = transport.getState();
      programmer = null; programmerState = {}; runtime = null; installed = false;
      context = null; targetContext = null; renderedContext = null;
      preview = null; previewPoints = []; previewSequence = 0;
      input('run-name').value = ''; input('event-note').value = '';
      guide.close(); experimentGuide.close(); measurement.reset();
      return 'left';
    } finally { leaving = navigatingDocument; renderRequested = true; }
  }
  async function exitToHome(push = true) {
    const result = await leaveExperiment(null, 'home', push);
    if (result !== 'left') return result;
    navigate('home', push); return 'left';
  }
  async function browse(next, push = true) {
    const result = await leaveExperiment(next, 'preview', push);
    if (result !== 'left') return result;
    targetContext = next;
    const nextCopy = getLabCopy(next);
    applyLabCopy(root.querySelector('[data-screen="preview"]'), nextCopy);
    $('preview-title').textContent = next.activity?.name ?? next.sensor.name;
    $('preview-description').textContent = nextCopy.preview.description || nextCopy.home.sensorDescription;
    $('preview-preparation').replaceChildren(...next.preparation.map(text => { const item=document.createElement('li'); item.textContent=text; return item; }));
    $('preview-channels').replaceChildren(...next.channels.map(channel => {
      const item = document.createElement('span'); item.textContent = channel.name;
      const unit = document.createElement('small'); unit.textContent = ' ' + channel.unit; item.append(unit); return item;
    }));
    const preparation=getGuideContent(next);
    $('preview-equipment').replaceChildren(...[...preparation.equipment,...preparation.activityEquipment].map(item => {
      const entry = document.createElement('li'); entry.textContent = item.name; return entry;
    }));
    $('preview-curriculum-section').hidden = !nextCopy.home.curriculum;
    $('preview-curriculum').textContent = [nextCopy.home.curriculum, nextCopy.home.curriculumDetail].filter(Boolean).join(' · ');
    $('preview-transition-note').textContent = store ? nextCopy.preview.transitionNote : '';
    share.setTarget(next);
    navigate('preview', push);
    return 'left';
  }
  async function activateExperiment(prepared=false) {
    const next = targetContext;
    if (screen !== 'preview' || !next || context || store) return;
    context = next; targetContext = null; renderedContext = null; input('run-name').value = '';
    resetPreparation();
    navigate('prepare');
    if(prepared)guide.showPrepared();
  }
  function restoreLocation() {
    if (historyEnabled) history.replaceState(null, '', routeUrl(screen === 'preview' ? targetContext : context, screen, {mock}));
  }
  async function applyLocation(url = location.href) {
    try {
      const route = parseRoute(url);
      if (route.screen === 'home') { if (await exitToHome(false) === 'cancelled') restoreLocation(); return; }
      if (route.screen === 'preview') { if (await browse(route.context, false) === 'cancelled') restoreLocation(); return; }
      if (route.context && !sameExperiment(route.context, context)) {
        const result = await leaveExperiment(route.context, route.screen, false);
        if (result !== 'left') { if (result === 'cancelled') restoreLocation(); return; }
        context = route.context; renderedContext = null; resetPreparation();
      }
      navigate(route.screen === 'analysis' && !store ? 'saved' : route.screen, false);
    } catch(error) { restoreLocation(); showError(error); }
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
    session = store.getState().writable && (store.getState().source !== 'import' || canResumeImportedRun(store.getRun())) ? createSession({ store, activityPolicy: policy() }) : null;
    renderedEvents = -1;
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
    session = !store.getState().temporary && canResumeImportedRun(store.getRun()) ? createSession({ store, activityPolicy: policy() }) : null;
    renderedEvents = -1;
    renderedContext = null; resetPreparation(); analysis.open(store); navigate('analysis');
  }
  async function readFile(file) {
    if (!file) return;
    if (file.size > LIMITS.fileBytes) throw new Error('32 MiB 이하의 실험 파일을 선택하세요.');
    const text = await file.text();
    try {
      const snapshot = file.name.toLowerCase().endsWith('.csv') ? await readCsv(text, { filename:file.name }) : parseExperimentJson(text);
      if (snapshot) await importSnapshot(snapshot);
    } catch(error) {
      if (error.code !== 'CSV_MAPPING_REQUIRED') throw error;
      await mapCsv(text, file.name, error.headers);
    }
  }
  async function readCsv(text, options) {
    try { return parseExperimentCsv(text, options); }
    catch (error) {
      if (error.code !== 'CSV_TIME_CONFLICT') throw error;
      let restored;
      const accepted = await dialogs.restoreCsvTime(() => {
        restored = parseExperimentCsv(text, {...options, restoreFromTimestamp:true});
      });
      return accepted ? restored : null;
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
    const snapshot = await readCsv(text, {filename,mapping});
    if (snapshot) await importSnapshot(snapshot);
  }
  async function exportFile(kind) {
    if (!store || !analysis.flush()) return;
    const snapshot = store.getSnapshot(), name = snapshot.run.name.replace(/[<>:"/\\|?*]/g,'-');
    if (kind === 'png') return downloadUrl(analysis.exportPng(name), name + '.png');
    if (kind === 'analysis-csv') return dialogs.exportCsv(snapshot, columns => {
      downloadText(buildAnalysisCsv(snapshot,columns),name+'-analysis.csv','text/csv;charset=utf-8');
    });
    const text = kind === 'json' ? buildExperimentJson(snapshot) : buildCsv(snapshot);
    downloadText(text, name + (kind === 'json' ? '.json' : '.csv'), kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8');
    if (kind === 'json') exportedRevision = store.getState().runRevision;
  }
  async function listRuns() {
    const runs = await repo.listRuns(), list = $('saved-runs'); list.replaceChildren();
    if (!runs.length) { list.textContent = copy.saved.empty; return; }
    for (const run of runs) {
      const li = document.createElement('li'), text = document.createElement('div'), small = document.createElement('small'), open = document.createElement('button');
      text.textContent = run.name; small.textContent = new Date(run.updatedAt).toLocaleString('ko-KR') + ' · ' + (run.context.activity?.name ?? run.context.sensor.name ?? '가져온 자료');
      text.append(small); open.textContent = copy.saved.open; open.addEventListener('click', () => act(() => openRun(run.id)), {signal});
      const rename=document.createElement('button'),remove=document.createElement('button'),actions=document.createElement('div');
      rename.textContent='이름 변경';remove.textContent='삭제';actions.className='saved-run-actions';
      rename.dataset.renameRun=run.id;remove.dataset.deleteRun=run.id;
      rename.setAttribute('aria-label',run.name+' 이름 변경');remove.setAttribute('aria-label',run.name+' 삭제');
      rename.addEventListener('click',()=>act(()=>dialogs.rename(run,name=>renameRun(run.id,name))),{signal});
      remove.addEventListener('click',()=>act(()=>dialogs.remove(run,()=>deleteRun(run.id))),{signal});
      actions.append(open,rename,remove);li.append(text,actions);list.append(li);
    }
  }
  async function renameRun(id, name) {
    const current = store?.getState().id === id;
    const target = current ? store : await openRunStore({repository:repo,id});
    try { target.updateRun({name}); await target.flush(); }
    finally { if (!current) target.dispose(); }
    await listRuns(); renderRequested=true;
  }
  async function deleteRun(id) {
    const current = store?.getState().id === id;
    const target = current ? store : await openRunStore({repository:repo,id});
    try {
      if (current) await persistCurrent();
      await target.remove();
      if (current) {
        analysis.reset(); session=null; store=null; renderedEvents=-1;
        await leaveExperiment(); navigate('saved');
      }
    } finally { if (!current) target.dispose(); }
    await listRuns(); renderRequested=true;
  }
  async function editEventNote(event) {
    if (!store?.getState().writable || event.runId!==store.getState().id) throw new Error('현재 실험의 편집 가능한 조작을 선택하세요.');
    await dialogs.note(event,context,async note=>{store.updateEventNote(event.eventId,note);await store.flush();renderRequested=true;});
  }
  function navigate(next, push = true) {
    if (programmerState.busy || !analysis.flush()) return;
    if (['prepare','measure','analysis'].includes(next) && !context) return;
    if (next === 'preview' && !targetContext) return;
    screen = next;
    if (historyEnabled && push) history.pushState(null, '', routeUrl(next === 'preview' ? targetContext : context, next, {mock}));
    findElement(root,'a','.skip-link').href = location.pathname + location.search + '#main';
    if (next === 'prepare' && !mock) programmer?.prepare().catch(showError);
    for (const section of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-screen]'))) {
      const hidden = section.dataset.screen !== next;
      if (hidden) for (const dialog of /** @type {NodeListOf<HTMLDialogElement>} */ (section.querySelectorAll('dialog[open]'))) dialog.close();
      section.hidden = hidden;
    }
    for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('[data-view]'))) { if(button.dataset.view === next) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); }
    if (next === 'analysis') analysis.open(store, context);
    if (next === 'saved') listRuns().catch(showError);
    if (next === 'measure' && store?.getState().source !== 'import') experimentGuide.show(context,{automatic:true,anchor:$('show-experiment-guide')});
    renderRequested = true;
  }
  function render() {
    for (const section of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-screen]'))) section.inert = leaving;
    const displayContext = screen === 'preview' ? targetContext : context;
    if (copyContext !== displayContext) {
      copyContext = displayContext; copy = getLabCopy(displayContext);
      for (const host of root.querySelectorAll('.lab-identity, .lab-toolbar, .luminous-sidebar, #current-experiment, [data-screen="measure"], [data-screen="saved"], #leave-dialog, #csv-mapping, #additional-dialog, .preparation-heading')) applyLabCopy(host, copy);
      applyLabCopy(root.querySelector('[data-screen="home"]'), labDefaults);
      applyLabCopy(root.querySelector('[data-screen="preview"]'), getLabCopy(targetContext));
      findElement(root,'a','.skip-link').textContent = copy.common.skip;
    }
    deviceState=transport.getState();
    // Until installation hands over its board, the common connect action uses
    // that board rather than offering a different/previous measurement device.
    const canReconnect=deviceState.canReconnect&&!programmerState.connectionAvailable;
    connectionNotice.render({ screen, support: transport.getSupport?.() ?? (transport.isSupported() ? 'supported' : 'unsupported'), busy: busy || !!programmerState.busy });
    const saved = store?.getState(), current = session?.getState(), recording = current?.recording;
    const measurementScreen = findElement(root,'section','[data-screen="measure"]');
    const previousRecordingState = measurementScreen.dataset.recordingState;
    const focusedRecordControl = measurementScreen.contains(document.activeElement) && ['start-recording','pause-recording','resume-recording','finish-recording'].includes(document.activeElement.id);
    measurementScreen.dataset.recordingState = current?.state ?? (saved ? 'ended' : 'preview');
    measurementScreen.dataset.storageState = saved?.status ?? 'none';
    measurementScreen.dataset.connectionState = deviceState.status;
    if (context) guide.render({attemptId:attempt,connected,connecting,deviceMessage:deviceState.message,deviceName:deviceState.deviceName,receptionReady:hasFreshReading(),receivedAt:deviceState.lastReceivedAt,latest:preview,
      firmwareInstalled:installed ? context.firmware : false,calibration:deviceState.calibration ?? 'unknown',devicePreparation:deviceState.devicePreparation,
      busy:busy || programmerState.busy,recording:recording || current?.state === 'finishing',programmerState,mock,
      canInstall:canInstall(),canReconnect,unsupported:!transport.isSupported(),canConnect:canUseDevice() && !recording && !connected && !connecting && transport.isSupported()});
    $('current-experiment').hidden = !store || screen !== 'saved';
    $('current-experiment-label').textContent = saved ? saved.name + ' · ' + (recording ? copy.common.recordingActive : copy.measurement.stored) : '';
    $('prepare-title').textContent = context ? formatCopy(copy.prepare.title, {name: context.activity?.name ?? context.sensor.name}) : '';
    $('device-detail').textContent = [deviceState.deviceName,deviceState.message].filter(Boolean).join(' · ');
    button('to-measure').disabled = !context || busy || !!programmerState.busy;
    button('activate-experiment').disabled = busy || !!programmerState.busy;
    button('activate-prepared').disabled = busy || !!programmerState.busy;
    $('disconnect').textContent = connecting ? copy.common.cancelConnection : copy.common.disconnect;
    $('connection-status').textContent = connecting ? copy.common.connecting : connected ? mock ? copy.common.mockConnected : copy.common.connected : copy.common.disconnected;
    $('recording-status').textContent = ({recording:copy.common.recordingActive,paused:copy.common.paused,finishing:copy.common.finishing,ended:copy.common.ended,preview:copy.common.prepare})[current?.state] ?? (saved ? copy.common.stored : copy.common.prepare);
    $('storage-status').textContent = !saved ? copy.common.beforeRecording : saved.temporary ? copy.common.temporary : !saved.writable ? copy.common.readOnly : copy.common[saved.status];
    $('experiment-title').textContent = displayContext ? displayContext.activity?.name ?? displayContext.sensor.name ?? copy.common.imported : '';
    findElement(root,'div','.lab-status').hidden = !context;
    for (const item of /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('[data-view]'))) {
      item.disabled = busy || !!programmerState.busy || (!context && ['prepare','measure','analysis'].includes(item.dataset.view));
    }
    input('run-name').disabled = !!store || busy;
    const connectionDisabled = recording || connected || connecting || busy || !canUseDevice() || (!mock && !transport.isSupported()) || !!programmerState.busy;
    const reconnectHidden = !canReconnect || connected || connecting;
    button('connect').disabled = connectionDisabled;
    for (const id of ['reconnect', 'measurement-reconnect']) {
      button(id).hidden = reconnectHidden;
      button(id).disabled = connectionDisabled;
    }
    $('connect').textContent=canReconnect?copy.common.chooseDevice:mock?copy.common.mockConnect:copy.common.connect;
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
    const exportMenu = root.querySelector('.luminous-export');
    if (exportMenu instanceof HTMLDetailsElement) { exportMenu.hidden=!saved; if (!saved) exportMenu.open=false; }
    if (root.querySelector('.luminous-overview') && focusedRecordControl && previousRecordingState !== measurementScreen.dataset.recordingState) {
      const nextControl = ({recording:'pause-recording',paused:'resume-recording',ended:'additional-recording'})[measurementScreen.dataset.recordingState];
      if (nextControl && !button(nextControl).disabled && !button(nextControl).hidden) button(nextControl).focus({preventScroll:true});
      else { $('recording-status').tabIndex=-1; $('recording-status').focus({preventScroll:true}); }
    }
    const measurementGuide=getGuideContent(context).experimentGuide;
    $('show-experiment-guide').hidden=!measurementGuide;
    $('show-experiment-guide').textContent=measurementGuide?.buttonLabel??getLabCopy(context).measurement.guide;
    experimentGuide.setRecording(Boolean(recording));
    $('sample-count').textContent = saved ? formatCopy(copy.measurement.count, {count:saved.sampleCount.toLocaleString('ko-KR')}) : copy.measurement.previewNote;
    $('sample-count').dataset.preview=String(!saved);
    $('lab-notice').textContent = saved?.temporary ? '이 환경에서는 브라우저에 저장할 수 없습니다. 분석 결과는 전체 실험 JSON으로 보관하세요.' : saved?.error ? saved.error + ' 메모리의 자료는 유지됩니다. 다시 저장하거나 전체 실험 JSON을 보관하세요.'
      : saved?.nearLimit ? '보관 한도에 가까워졌습니다. 전체 실험 JSON으로 보관하고 새 실험을 준비하세요.'
      : current?.problem ? current.problem : !navigator.locks ? '이 브라우저에서는 새 실험을 기록할 수 없습니다. 저장된 자료를 열어 분석할 수 있어요.'
      : mock && connected ? '모의 장치를 사용하고 있어요. 실제 센서 측정값이 아닙니다.' : '';
    if (renderedContext !== context) {
      renderedContext = context;
      $('preparation-notes').replaceChildren(...(context?.preparation ?? []).map(text => { const li=document.createElement('li'); li.textContent=text; return li; }));
      $('activity-actions').replaceChildren(...getActivityEvents(context).map(event => {
        const button=document.createElement('button'); button.textContent=event.label; button.dataset.activityEvent=event.type;
        button.addEventListener('click',()=>act(async()=>{
          const save=payload=>{if(!session?.markEvent(event.type,payload))throw new Error(session?.getState().problem || '기록 중 조작을 남길 수 있습니다.');};
          if(event.kinds)await dialogs.activity(event,save);else save({});
        }),{signal});return button;
      }));
    }
    for (const button of $('activity-actions').querySelectorAll('button')) {
      const action=getActivityEvents(context).find(item=>item.type===button.dataset.activityEvent);
      button.disabled=busy || (!recording && !(current?.state==='paused' && action?.allowPaused));
    }
    if (screen === 'measure' && context) {
      measurement.render({context,store,latest:preview,previewPoints,device:deviceState,recording});
    }
    if (saved?.eventsVersion !== renderedEvents) {
      renderedEvents = saved?.eventsVersion;
      const records = store?.getEvents(100) ?? [];
      for (const id of root.querySelector('.luminous-overview') ? ['analysis-events'] : ['lab-events','analysis-events']) renderEventList($(id),records,context,saved?.writable?event=>act(()=>editEventNote(event)):null);
    }
    analysis.updateStatus();
  }
  for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('[data-view]'))) button.addEventListener('click',()=>{
    if (button.disabled || busy || programmerState.busy) return;
    if (button.dataset.view === 'home') void act(()=>exitToHome()); else navigate(button.dataset.view);
  },{signal});
  listen('connect',()=>connect()); listen('reconnect',()=>connect({reuseDevice:true})); listen('measurement-reconnect',()=>connect({reuseDevice:true})); $('disconnect').addEventListener('click',()=>disconnect().catch(showError),{signal}); listen('start-recording',start);
  listen('pause-recording',()=>session.pause()); listen('resume-recording',()=>{requireReady();session.resume();});
  listen('finish-recording',async()=>{await session.finish();await store.flush();});
  listen('additional-recording',async()=>{requireReady();await dialogs.additional(policy(),confirmation=>{requireReady();session.startAdditional(confirmation);});});
  listen('add-note',()=>{const note=input('event-note').value.trim();if(!note)throw new Error('메모를 입력하세요.');session.markEvent('note',{note});input('event-note').value='';});
  listen('new-experiment',()=>exitToHome());
  listen('activate-experiment',()=>activateExperiment()); listen('activate-prepared',()=>activateExperiment(true)); listen('prepare-device',()=>navigate('prepare'));
  listen('show-experiment-guide',()=>experimentGuide.show(context,{anchor:$('show-experiment-guide')}));
  listen('to-measure',()=>navigate('measure')); listen('return-current',()=>navigate(session ? 'measure' : 'analysis'));
  if (historyEnabled) window.addEventListener('popstate',()=>{
    if (busy || programmerState.busy) { restoreLocation(); return; }
    void act(()=>applyLocation());
  },{signal});
  const homeItem = context => ({ context, copy: getLabCopy(context).home });
  renderHomeCards(root, {
    sensors: catalog.sensors.map(item => homeItem(getExperiment(item.id))),
    activities: catalog.activities.map(item => homeItem(getExperiment(item.sensorIds[0], item.id))),
    linkTo: next => routeUrl(next, 'preview', { mock }).href,
    onSelect: next => { void act(() => browse(next)); }, signal,
  });
  listen('retry-save',()=>store.flush());
  listen('export-json',()=>exportFile('json'));listen('export-csv',()=>exportFile('csv'));
  $('open-file').addEventListener('click',()=>input('file-input').click(),{signal});
  input('file-input').addEventListener('change',()=>{const file=input('file-input').files[0];input('file-input').value='';act(()=>readFile(file));},{signal});
  $('mock-link').addEventListener('click',event=>{event.preventDefault();act(async()=>{if(await confirmTransition()) location.assign(routeUrl(context,'prepare',{mock:true}).href);});},{signal});
  window.addEventListener('beforeunload',event=>{const draftsSaved=analysis.flush(),saved=store?.getState();if(!draftsSaved || session?.getState().recording || (saved?.writable && saved.status!=='clean') || (saved?.temporary && exportedRevision!==saved.runRevision)) {event.preventDefault();event.returnValue='';}},{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && store?.getState().writable){analysis.flush();store.flush().catch(showError);}},{signal});
  const interval = setInterval(()=>{
    try{session?.tick();}catch(error){showError(error);}
    if (connected || session?.getState().recording) renderRequested = true;
    if(renderRequested){renderRequested=false;render();}
  },200);
  const ready = act(()=>applyLocation(initialUrl)); render();
  return { ready, async dispose(){
    await persistCurrent(); await disconnect(); await store?.close();
    clearInterval(interval);abort.abort();dialogs.dispose();guide.dispose();await programmer?.dispose();analysis.dispose();help.dispose();measurement.dispose();experimentGuide.dispose();share.dispose();repo.close();
  }, getState:()=>({screen,context,targetContext,busy:busy || !!programmerState.busy,storage:store?.getState(),session:session?.getState()}) };
}
