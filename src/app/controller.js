import { createExperimentMemos } from '../ui/experiment-memos.js';
import { createLivePreview } from '../measurement/live-preview.js';
import { catalog, getExperiment, getSensorRuntime, getActivityPolicy, getMeasurementOptions, getActivityTour } from '../catalog/index.js';
import { canResumeImportedRun } from '../data/files/recording-source.js';
import { createTransport } from '../device/transport.js';
import { createMockBleClient } from '../device/mock-client.js';
import { createTourDevicePicker } from '../ui/tour-device-picker.js';
import { createTourRepository } from '../data/tour-repository.js';
import { createProgrammer } from '../device/programmer.js';
import { loadFirmwareHex } from '../device/firmware.js';
import { createGuideView } from '../ui/guide-view.js';
import { parseRoute, routeUrl, sameExperiment } from './routes.js';
import { createRepository } from '../data/repository.js';
import { openRunStore, openTemporaryRunStore } from '../data/run-store.js';
import { createSession, restoreSession } from '../measurement/session.js';
import { createPointCapture } from '../measurement/point-capture.js';
import { createPointRecordingView } from '../ui/point-recording-view.js';
import { getRecordingActions } from '../ui/recording-actions.js';
import { setText } from '../ui/text.js';
import { parseExperimentJson, buildExperimentJson } from '../data/files/json.js';
import { parseExperimentCsv, buildCsv, buildPointCsv, buildAnalysisCsv } from '../data/files/csv.js';
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
import { settlePendingFonts } from '../ui/app-presentation.js';

// Connects modules and owns navigation only. Source records live exclusively in RunStore.
export function createController(root = document, { repository = null, deviceTransport = null, historyEnabled = true, initialUrl = location.href,
  loadPage = (url, replace) => replace ? location.replace(url) : location.assign(url) } = {}) {
  const $ = id => root.getElementById(id), abort = new AbortController(), { signal } = abort;
  bindAppShell(root, { signal });
  const input = id => findElement(root, 'input', '#' + id);
  const button = id => findElement(root, 'button', '#' + id);
  const dialogElement = id => findElement(root, 'dialog', '#' + id);
  let context = null, store = null, session = null, screen = 'home';
  let measurementTab = 'continuous';
  let finishingFrom = 'recording';
  let replayCycle = 0;
  const analysisCuePending = new WeakSet();
  const hasAnalysisData = () => { const state = store?.getState(); return Boolean(state && (state.sampleCount || state.pointCount || state.withdrawnPointCount)); };
  const livePreview = createLivePreview();
  let recordingMode = 'continuous', capture = createPointCapture();
  let copy = getLabCopy(null), copyContext;
  let preview = null, attempt = 0, connected = false, connecting = false, busy = false;
  let readingWarning = '';
  let leaving = false, navigatingDocument = false;
  let connectionRequest = 0, handingOff = false;
  let renderRequested = true, renderedEvents = -1, renderedContext, exportedRevision = -1;
  const mock = new URL(initialUrl).searchParams.get('mock') === '1';
  const supportsTour = next => !!next?.sensor && (next.activity ? !!getActivityTour(next) : next.sensor.showOnHome !== false);
  const tourContext = next => mock && !repository && !deviceTransport && supportsTour(next);
  const isTour = () => tourContext(context);
  const realRepo = repository ?? createRepository({ onUnavailable: message => showError(message) });
  const tourRepo = createTourRepository();
  let repo = mock && !repository && !deviceTransport ? tourRepo : realRepo;
  const storeOptions = () => ({repository:repo, ...(repo===tourRepo ? {locks:tourRepo.locks} : {})});
  const recordingSupported = () => isTour() || !!navigator.locks;
  const picker = createTourDevicePicker(root.querySelector('.lab-shell'));
  const transport = deviceTransport ?? createTransport(mock ? {ble:createMockBleClient(()=>context,{
    chooseDevice:device=>isTour()?picker.choose(device):Promise.resolve(device),
    cancelChoice:()=>picker.cancel(),connectionDelay:()=>isTour()?650:0,
    getPlayback:()=>isTour()?{state:session?.getState().state??'preview',key:(store?.getState().id??'')+':'+replayCycle}:null,
    onReplayNote:note=>{if(isTour()&&session?.getState().state==='recording')session.addMemo(note);},
    onReplayEnd:()=>{if(isTour()&&session?.getState().state==='recording')void session.finish().then(()=>{renderRequested=true;analysis.updateStatus();}).catch(showError);},
  })} : {});
  const connectionNotice = createConnectionNotice(root, { signal });
  let targetContext = null, runtime = null, programmer = null, programmerState = {}, installed = false, recordingSourceAllowed = false;
  let sensorSettingsViews = [];
  let deviceState = transport.getState();
  const resumeKey = 'sensor-lab:active-run';
  let bootstrapped = false, restoring = false, rememberedRun;
  function rememberRun() {
    if (!historyEnabled || !bootstrapped || isTour()) return;
    try {
      const saved = store?.getState();
      const value = saved && !saved.temporary ? JSON.stringify({id:saved.id, url:routeUrl(context, screen, {mock}).href, measurementTab}) : '';
      if (value === rememberedRun) return;
      if (value) sessionStorage.setItem(resumeKey, value); else sessionStorage.removeItem(resumeKey);
      rememberedRun = value;
    } catch { /* Optional tab navigation state; records remain in Repository. */ }
  }
  const guide = createGuideView($('guide-host'), { onInstall: () => act(install),
    onInstallMode: mode => act(async () => { if (canInstall()) { installed = false; await programmer?.setMode(mode); } }),
    onCancelInstall: () => programmer?.cancel(), onConnect: options => act(()=>connect(options)),
    onDisconnect: () => disconnect().catch(showError), onChange: () => { renderRequested = true; }, onMeasure:()=>navigate('measure'), onError: showError,
    onDeviceAction: action => act(async()=>{if(!context || !runtime || screen !== 'prepare' || session?.getState().recording) return; await transport.performAction(action);}) });
  const dialogs = createRecordDialogs(root.querySelector('.lab-shell'));
  const memoView = createExperimentMemos(root,{onChange:()=>{renderRequested=true;render();},onAdd:(note,receivedAt)=>{
    if(!session?.addMemo(note,receivedAt)) throw new Error('기록 중이거나 일시정지 상태에서 메모를 남길 수 있어요.');
  }});
  const measurement = createMeasurementView(root,()=>{renderRequested=true;}, event=>memoView.edit(event), number => pointView.reveal(number));
  const pointView = createPointRecordingView(root, { onCapture: () => act(capturePoint), onChange: () => { renderRequested = true; }, onError: showError });
  const experimentGuide = createExperimentGuide(root.querySelector('.lab-shell'));
  const share = createShareView(findElement(root, 'section', '[data-screen="preview"]'));
  const analysis = createAnalysisView(root.querySelector('[data-screen="analysis"]'), { onError: showError, onExport: kind => act(() => exportFile(kind)) });
  const help = createActionHelp(root, { messages: { betaTool: {label:'개발 중인 도구',text:'아직 개발 중인 도구로, 실기기에서의 동작 안정성은 검증되지 않았어요.'}, continuousRecording: {label:'연속 기록',text:'켜면 시간에 따른 값을 계속 저장합니다. 꺼도 현재값과 최근 60초 그래프를 볼 수 있으며, 한 점 기록을 누른 값만 저장합니다. 기록을 시작한 뒤에는 추가 측정에서도 이 설정이 유지됩니다.'}, tableSelection: {label:'표 선택과 분석 대상',text:'체크한 행과 분석에 쓰는 자료는 별개입니다. 선택 자료로 분석을 누르면 분석 대상을 바꿀 수 있고, 분석에서 제외를 누르면 원자료를 보존하면서 계산에서 뺍니다.'} } });
  const policy = () => getActivityPolicy(context);
  const onChange = () => { renderRequested = true; };
  function changeSensorSetting(action) {
    return act(async () => {
      if (store || !runtime?.preparation?.createSettingsView || !connected) return;
      await transport.performAction(action);
    });
  }
  function mountSensorSettings() {
    sensorSettingsViews.forEach(view => view.dispose()); sensorSettingsViews = [];
    root.querySelectorAll('[data-sensor-settings-host]').forEach(host => host.remove());
    if (!runtime?.preparation?.createSettingsView) return;
    for (const parent of [root.querySelector('.guide-reception'), root.querySelector('#measurement-settings .ui-dialog-body')]) {
      const host = document.createElement('div'); host.dataset.sensorSettingsHost = '';
      parent.append(host);
      sensorSettingsViews.push(runtime.preparation.createSettingsView(host, { onAction: changeSensorSetting }));
    }
  }
  const historicalPointRun = () => getMeasurementOptions(context).continuousOnly && store?.getRun().recordingMode === 'point';
  const canUseDevice = () => !historicalPointRun() && !!runtime && (!store || (!store.getState().temporary && store.getState().writable
    && recordingSourceAllowed));
  function showError(error) { $('lab-error').textContent = copy.point[error?.code] ?? error?.message ?? String(error); $('lab-error').hidden = false; renderRequested = true; }
  function clearError() { $('lab-error').hidden = true; $('lab-error').textContent = ''; }
  function focusRecordingAction() {
    const analyze = button('measurement-analyze');
    const next = !analyze.hidden && !analyze.disabled ? analyze : root.querySelector('.recording-controls button:not([hidden]):not(:disabled)');
    if (next instanceof HTMLButtonElement) next.focus({preventScroll:true});
    else { $('recording-status').tabIndex=-1; $('recording-status').focus({preventScroll:true}); }
  }
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
        focusRecordingAction();
      }
    }
  }
  function listen(id, work) { $(id).addEventListener('click', () => act(work), { signal }); }
  function accept(input) {
    if (!context || !runtime || input.attemptId !== attempt) return;
    if (input.type === 'reading' && ((input.warning ?? '') !== readingWarning || (input.warning && $('lab-error').hidden))) {
      if (input.warning) showError(input.warning);
      else if ($('lab-error').textContent === readingWarning) clearError();
      readingWarning = input.warning ?? '';
    }
    if (input.type === 'reading') preview = input;
    try { if (session) session.acceptInput(input); else capture.accept(input); } catch(error) { showError(error); }
    livePreview.freeze(session?.getState().state === 'paused');
    livePreview.accept(input);
    renderRequested = true;
  }
  async function disconnect() {
    ++connectionRequest;
    if (handingOff) programmer?.cancel();
    connected = false; connecting = false; preview = null; livePreview.reset();
    if (readingWarning && $('lab-error').textContent === readingWarning) clearError();
    readingWarning = '';
    session?.disconnected();
    capture.disconnected();
    await transport.disconnect(); deviceState=transport.getState(); attempt=deviceState.attemptId;
    renderRequested = true;
  }
  function canInstall() {
    const saved = store?.getState(), current = session?.getState();
    return !!context && !!runtime && !runtime.definition.firmware.stale && canUseDevice() && screen === 'prepare' && !mock && !connected && !connecting
      && (!saved || (saved.writable && saved.status === 'clean' && (!current || current.state === 'ended')));
  }
  async function downloadProgram() {
    const status = $('installation-download-status');
    if (!canInstall()) { status.textContent = '기록을 마치고 저장한 뒤 장치 연결을 해제해 주세요.'; return; }
    status.textContent = '프로그램 파일을 준비하고 있어요.';
    try {
      const { hex, fileName } = await loadFirmwareHex(runtime.definition.firmware.id, runtime.definition.firmware.version, { signal });
      if (signal.aborted) return;
      downloadText(hex, fileName, 'application/octet-stream');
      status.textContent = '파일 다운로드를 요청했어요. 받은 파일을 MICROBIT 드라이브에 복사해야 설치됩니다.';
    } catch (error) { if (!signal.aborted) status.textContent = error.message; }
  }
  function resetPreparation() {
    repo = isTour() ? tourRepo : realRepo;
    const tourSetup=isTour()&&!store?getActivityTour(context)?.setup:null;
    if(tourSetup)context={...context,setup:{...context.setup,...tourSetup}};
    programmer?.dispose().catch(showError); programmer = null; programmerState = {}; installed = false;
    try { runtime = getSensorRuntime(context); } catch { runtime = null; }
    recordingSourceAllowed = !store || store.getState().source !== 'import' || canResumeImportedRun(store.getRun());
    deviceState = transport.getState();
    if (!store) capture = createPointCapture({ config: context?.connectionPolicy });
    guide.open(context, {reset:true});
    mountSensorSettings();
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
  async function connect({reuseDevice=false, preferPrevious=false, reconnecting=false}={}) {
    if (preferPrevious) reuseDevice = !!transport.getState().canReconnect;
    if (!context || !canUseDevice() || !['prepare','measure'].includes(screen)) throw new Error('이 자료에는 장치를 연결할 수 없습니다. 새 실험을 준비하세요.');
    if (session?.getState().recording && store?.getRun().recordingMode !== 'point') throw new Error('기록을 일시정지한 뒤 장비를 다시 연결하세요.');
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
        const preparation = state.devicePreparation;
        if (preparation?.settings && !store && runtime?.preparation?.configureContext) {
          if (preparation.allowReadings && JSON.stringify(context.setup?.sensorSettings) !== JSON.stringify(preparation.settings)) {
            context = runtime.preparation.configureContext(context, preparation.settings);
            guide.open(context);
            preview = null; livePreview.reset(); capture = createPointCapture({ config: context.connectionPolicy });
          } else if (!preparation.allowReadings) { preview = null; livePreview.reset(); capture.disconnected(); }
        }
        connected = state.status === 'connected'; connecting = state.status === 'connecting';
        if (screen === 'measure' && state.devicePreparation?.requiredStep) {
          guide.showDevicePreparation(state.devicePreparation.requiredStep); navigate('prepare');
        }
        if (wasConnected && !connected) { preview = null; livePreview.reset(); session?.disconnected(); capture.disconnected(); }
        renderRequested = true;
      },{reuseDevice, reconnecting, device: installedDevice, reuseConnection: !!installedDevice?.gatt?.connected});
      if (preferPrevious && transport.getState().status === 'disconnected') transport.forgetDevice?.();
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
    if (getMeasurementOptions(context).continuousOnly) recordingMode = 'continuous';
    if (recordingMode === 'point') return;
    if (!memoView.flush() || !pointView.flush()) return;
    requireReady();
    if (store) throw new Error('새 실험 준비를 눌러 다음 실험을 시작하세요.');
    const recordedContext = { ...context, setup: { ...guide.getProgress().setup, ...measurement.activitySetup(), ...(context.setup?.sensorSettings ? {sensorSettings:context.setup.sensorSettings} : {}) } };
    const nextStore = await openRunStore({ ...storeOptions(), context: recordedContext, name: input('run-name').value.trim() || undefined, source: mock ? 'replay' : 'device', create: true, onChange, manualColumns: pointView.manualColumns() });
    if (!readyToRecord()) {
      // Roll back only this never-started, empty Run while still owning its writer lock.
      try { await nextStore.remove(); } finally { nextStore.dispose(); }
      throw new Error('준비 상태가 바뀌어 기록을 시작하지 않았습니다. 장비를 확인하고 다시 시작하세요.');
    }
    store = nextStore; analysisCuePending.add(store); session = createSession({ store, activityPolicy: policy(), capture }); session.start();
    renderedEvents = -1;
  }
  const captureConnection = () => ({ connected, confirmed: transport.getState().confirmed, attemptId: attempt });
  async function capturePoint() {
    if (screen !== 'measure') return;
    const values = pointView.captureValues();
    if (store) {
      if (!session) throw new Error(copy.point['capture-read-only']);
      pointView.recorded(session.capturePoint(captureConnection(), values)); return;
    }
    if (recordingMode !== 'point') throw new Error(copy.point['capture-preview']);
    requireReady();
    const request = capture.prepare(captureConnection(), values);
    try {
      const nextStore = await openRunStore({ ...storeOptions(), context: { ...context, setup: { ...guide.getProgress().setup, ...(context.setup?.sensorSettings ? {sensorSettings:context.setup.sensorSettings} : {}) } },
        name: input('run-name').value.trim() || undefined, source: mock ? 'replay' : 'device', create: true, onChange,
        recordingMode: 'point', manualColumns: pointView.manualColumns(), initialPoint: { sample: request.sample, ...request.point },
        beforeCreate: () => request.validate(captureConnection()) });
      // The point has been admitted atomically. Preserve that result even if
      // reception changes while the database acknowledgement is in flight.
      store = nextStore; analysisCuePending.add(store); request.accept();
      session = createSession({ store, activityPolicy: policy(), capture, newlyCreated: true }); session.start();
      renderedEvents = -1; pointView.recorded(1);
    } catch (error) { request.cancel(); throw new Error(copy.point[error.code] ?? error.message); }
  }
  async function prepareNewExperiment() {
    if (!await confirmTransition()) return;
    const nextMode = getMeasurementOptions(context).continuousOnly ? 'continuous' : store?.getRun().recordingMode ?? recordingMode;
    const nextTab = measurementTab;
    // Retain the recording policy, selected view and this device's preparation and
    // connection after the old Run is safely closed. A new capture owns no old
    // observations, so the next Run must receive a new reading.
    const keepConnection = canUseDevice() && connected && deviceState.devicePreparation?.allowReadings !== false;
    await releaseCurrent();
    recordingMode = nextMode; measurementTab = nextTab; preview = null; livePreview.reset(); input('run-name').value = '';
    measurement.reset();
    if (keepConnection && connected && deviceState.devicePreparation?.allowReadings !== false) {
      capture = createPointCapture({ config: context.connectionPolicy });
      recordingSourceAllowed = true;
      navigate('measure');
    } else {
      await disconnect(); resetPreparation(); navigate('prepare');
    }
  }
  async function persistCurrent() {
    if (!memoView.flush() || !pointView.flush()) throw new Error(copy.point.numberInvalid);
    if (!analysis.flush()) throw new Error('분석 글을 먼저 확인해 주세요.');
    if (session && !['ended','preview'].includes(session.getState().state)) await session.finish();
    analysis.updateStatus();
    if (store?.getState().writable) await store.flush();
  }
  async function confirmTransition({ask = true, exit = false} = {}) {
    if (!memoView.flush() || !pointView.flush()) return false;
    if(isTour()&&exit&&!store)return true;
    if (!store && !exit) return true;
    if (!exit && !analysis.flush()) return false;
    const temporary = store?.getState().temporary;
    if (exit || (ask && (session?.getState().recording || store.getState().status !== 'clean')) || (temporary && exportedRevision !== store.getState().runRevision)) {
      const dialog = dialogElement('leave-dialog');
      $('leave-dialog-title').textContent = exit ? copy.dialogs.exitTitle : copy.dialogs.leaveTitle;
      dialog.querySelector('p').textContent = exit ? temporary ? copy.dialogs.exitTemporaryNote : copy.dialogs.exitNote : copy.dialogs.leaveNote;
      dialog.querySelector('button[value="cancel"]').textContent = exit ? copy.dialogs.cancelExit : copy.dialogs.stay;
      if(isTour()) {
        $('leave-dialog-title').textContent='둘러보기를 마칠까요?';
        dialog.querySelector('p').textContent='이 창의 체험 기록과 작성 내용은 사라집니다. 보관하려면 취소한 뒤 파일로 저장하세요.';
      }
      $('leave-save').textContent = isTour() ? '종료하고 이동' : temporary ? copy.dialogs.exportLeave : exit ? copy.dialogs.exit : session?.getState().recording ? copy.dialogs.finishLeave : copy.dialogs.saveLeave;
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
    memoView.reset(); pointView.reset(); recordingMode = 'continuous'; measurementTab = 'continuous';
  }
  // Save before replacing the document. The browser releases the old page's
  // connections; do not start another device teardown before this navigation.
  async function leaveExperiment(nextContext, nextScreen, push = true) {
    leaving = true; render();
    try {
      if (!await confirmTransition({ask:false, exit:!!context})) return 'cancelled';
      if (context && historyEnabled) {
        loadPage(routeUrl(nextContext, nextScreen, {mock:mock&&!isTour()}).href, !push);
        navigatingDocument = true;
        return 'navigating';
      }
      // Embedded controllers with navigation disabled retain their local lifecycle.
      await programmer?.dispose();
      await disconnect();
      await releaseCurrent();
      transport.forgetDevice?.(); deviceState = transport.getState();
      programmer = null; programmerState = {}; runtime = null; installed = false;
      mountSensorSettings();
      context = null; targetContext = null;
      preview = null; livePreview.reset();
      input('run-name').value = '';
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
    context = next; targetContext = null; input('run-name').value = '';
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
      if((new URL(url).searchParams.get('mock')==='1')!==mock) {
        if(await confirmTransition({exit:!!context})) {loadPage(url,true);navigatingDocument=true;}
        else restoreLocation();
        return;
      }
      if (route.screen === 'home') { if (await exitToHome(false) === 'cancelled') restoreLocation(); return; }
      if (route.screen === 'preview') { if (await browse(route.context, false) === 'cancelled') restoreLocation(); return; }
      if (route.context && !sameExperiment(route.context, context)) {
        const result = await leaveExperiment(route.context, route.screen, false);
        if (result !== 'left') { if (result === 'cancelled') restoreLocation(); return; }
        context = route.context; resetPreparation();
      }
      navigate(route.screen === 'analysis' && !store ? 'saved' : route.screen, false);
    } catch(error) { restoreLocation(); showError(error); }
  }
  async function openRun(id, destination = 'analysis', push = true) {
    if (store?.getState().id === id) return navigate('analysis');
    if (!await confirmTransition()) return;
    // Opening failure leaves the current Run in place.
    const next = await openRunStore({ ...storeOptions(), id, onChange });
    try { await disconnect(); await releaseCurrent(); } catch(error) { next.dispose(); throw error; }
    store = next; context = store.getRun().context;
    restoreSession({ store, activityPolicy: policy() });
    // A saved run is opened for analysis; recording only resumes through an explicit action.
    session = !historicalPointRun() && store.getState().writable && (store.getState().source !== 'import' || canResumeImportedRun(store.getRun())) ? createSession({ store, activityPolicy: policy() }) : null;
    renderedEvents = -1;
    resetPreparation(); recordingMode = store.getRun().recordingMode ?? 'continuous'; measurementTab = recordingMode;
    analysis.open(store); navigate(destination, push);
  }
  async function importSnapshot(snapshot) {
    if (!await confirmTransition()) return;
    let next;
    if (!recordingSupported()) next = await openTemporaryRunStore({snapshot,onChange});
    else {
      try { next = await openRunStore({ ...storeOptions(), importSnapshot: snapshot, onChange }); }
      catch(error) {
        if (error.code !== 'storage-unavailable') throw error;
        next = await openTemporaryRunStore({snapshot,onChange});
      }
    }
    try { await disconnect(); await releaseCurrent(); } catch(error) { next.dispose(); throw error; }
    store = next; context = store.getRun().context;
    session = !historicalPointRun() && !store.getState().temporary && canResumeImportedRun(store.getRun()) ? createSession({ store, activityPolicy: policy() }) : null;
    renderedEvents = -1;
    resetPreparation(); recordingMode = store.getRun().recordingMode ?? 'continuous'; measurementTab = recordingMode;
    analysis.open(store); navigate('analysis');
  }
  async function readFile(file) {
    if (!file || isTour()) return;
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
    if (!store || !analysis.flush() || !memoView.flush() || !pointView.flush()) return;
    const snapshot = store.getSnapshot(), name = snapshot.run.name.replace(/[<>:"/\\|?*]/g,'-');
    if (kind === 'png') {
      await settlePendingFonts(root.ownerDocument ?? document);
      return downloadUrl(analysis.exportPng(name), name + '.png');
    }
    const sourceId = analysis.getWorkspace()?.getState().sourceId ?? (snapshot.run.recordingMode === 'point' ? 'points' : 'recorded');
    if (kind === 'analysis-csv') return dialogs.exportCsv(snapshot, columns => {
      downloadText(buildAnalysisCsv(snapshot,columns,sourceId),name+'-'+sourceId+'-analysis.csv','text/csv;charset=utf-8');
    }, sourceId);
    const text = kind === 'json' ? buildExperimentJson(snapshot) : kind === 'points-csv' ? buildPointCsv(snapshot) : buildCsv(snapshot);
    downloadText(text, name + (kind === 'json' ? '.json' : kind === 'points-csv' ? '-points.csv' : '.csv'), kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8');
    if (kind === 'json') exportedRevision = store.getState().runRevision;
  }
  async function listRuns() {
    const runs = (await repo.listRuns()).filter(run=>!tourContext(run.context)||repo===tourRepo), list = $('saved-runs'); list.replaceChildren();
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
    const target = current ? store : await openRunStore({...storeOptions(),id});
    try { target.updateRun({name}); await target.flush(); }
    finally { if (!current) target.dispose(); }
    await listRuns(); renderRequested=true;
  }
  async function deleteRun(id) {
    const current = store?.getState().id === id;
    const target = current ? store : await openRunStore({...storeOptions(),id});
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
  function editEventNote(event) { memoView.edit(event,document.activeElement); }
  function navigate(next, push = true) {
    if (programmerState.busy || !analysis.flush() || !memoView.flush() || !pointView.flush()) return;
    if (['prepare','measure','analysis'].includes(next) && !context) return;
    if (next === 'preview' && !targetContext) return;
    if (next === 'analysis' && !hasAnalysisData()) next = 'measure';
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
    if (next === 'measure' && !restoring && store?.getState().source !== 'import') experimentGuide.show(context,{automatic:true,anchor:$('show-experiment-guide')});
    renderRequested = true;
  }
  function render() {
    rememberRun();
    button('download-program').disabled = busy || !!programmerState.busy || !canInstall();
    $('installation-download-blocked').hidden = canInstall();
    $('installation-program-name').textContent = context ? `선택한 센서: ${context.sensor.name}` : '';
    for (const section of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-screen]'))) section.inert = leaving;
    const displayContext = screen === 'preview' ? targetContext : context;
    if (copyContext !== displayContext) {
      $('installation-download-status').textContent = '';
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
    // Keep the last record-control layout while Session waits for saving.
    if (current?.state === 'recording' || current?.state === 'paused') finishingFrom = current.state;
    measurementScreen.dataset.storageState = saved?.status ?? 'none';
    measurementScreen.dataset.connectionState = deviceState.status;
    const measurementOptions = getMeasurementOptions(context);
    if (measurementOptions.continuousOnly) { measurementTab = 'continuous'; if (!store) recordingMode = 'continuous'; }
    const pointMode = (saved?.recordingMode ?? recordingMode) === 'point';
    findElement(root, 'div', '.continuous-recording-setting').hidden = measurementOptions.continuousOnly;
    $('point-recording').hidden = !measurementOptions.points;
    const needsConnection = canUseDevice() && !connected;
    measurementScreen.dataset.recordingMode = measurementTab;
    button('continuous-recording').disabled = measurementOptions.continuousOnly || !!saved || busy;
    button('continuous-recording').setAttribute('aria-checked', String(!pointMode));
    for (const control of /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('button[data-recording-mode]'))) {
      control.hidden = measurementOptions.continuousOnly && control.dataset.recordingMode === 'point';
      control.disabled = busy || control.hidden; control.setAttribute('aria-pressed', String(control.dataset.recordingMode === measurementTab));
    }

    if (context) guide.render({attemptId:attempt,connected,connecting,deviceMessage:deviceState.message,deviceName:deviceState.deviceName,receptionReady:hasFreshReading(),receivedAt:deviceState.lastReceivedAt,latest:preview,
      firmwareInstalled:installed ? context.firmware : false,calibration:deviceState.calibration ?? 'unknown',devicePreparation:deviceState.devicePreparation,
      busy:busy || programmerState.busy,recording:recording || current?.state === 'finishing',programmerState,mock,tour:isTour(),
      canInstall:canInstall(),canReconnect,unsupported:!transport.isSupported(),canConnect:canUseDevice() && (!recording || pointMode) && !connected && !connecting && transport.isSupported()});
    for (const view of sensorSettingsViews) view.render({ settings: deviceState.devicePreparation?.settings ?? context?.setup?.sensorSettings,
      locked: !!store, connected, busy: busy || connecting || deviceState.devicePreparation?.allowReadings === false });
    $('current-experiment').hidden = !store || screen !== 'saved';
    $('current-experiment-label').textContent = saved ? saved.name + ' · ' + (recording ? copy.common.recordingActive : copy.measurement.stored) : '';
    $('prepare-title').textContent = context ? formatCopy(copy.prepare.title, {name: context.activity?.name ?? context.sensor.name}) : '';
    $('device-detail').textContent = [deviceState.deviceName,deviceState.message].filter(Boolean).join(' · ');
    button('to-measure').disabled = !context || busy || !!programmerState.busy;
    button('activate-experiment').disabled = busy || !!programmerState.busy;
    button('activate-prepared').disabled = busy || !!programmerState.busy;
    $('disconnect').textContent = connecting ? copy.common.cancelConnection : copy.common.disconnect;
    $('tour-status').hidden = !tourContext(displayContext);
    $('exit-tour').hidden = !isTour();
    $('preview-tour').hidden = !supportsTour(targetContext);
    button('preview-tour').disabled = busy;
    $('open-file').hidden = isTour();
    $('mock-link').parentElement.hidden = mock || !supportsTour(context);
    $('connection-status').textContent = connecting ? copy.common.connecting : connected ? mock && !isTour() ? copy.common.mockConnected : copy.common.connected : copy.common.disconnected;
    $('recording-status').textContent = ({recording:pointMode ? copy.point.recordingActive : copy.point.continuousActive,paused:copy.common.paused,finishing:copy.common.finishing,ended:copy.common.ended,preview:copy.common.prepare})[current?.state] ?? (saved ? copy.common.stored : copy.common.prepare);
    $('storage-status').textContent = !saved ? copy.common.beforeRecording : saved.temporary ? copy.common.temporary : !saved.writable ? copy.common.readOnly : copy.common[saved.status];
    $('experiment-title').textContent = displayContext ? displayContext.activity?.name ?? displayContext.sensor.name ?? copy.common.imported : '';
    findElement(root,'div','.lab-status').hidden = !context || isTour();
    for (const item of /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('[data-view]'))) {
      item.disabled = busy || !!programmerState.busy || (!context && ['prepare','measure','analysis'].includes(item.dataset.view)) || (item.dataset.view === 'analysis' && !hasAnalysisData());
    }
    const analysisTab = findElement(root, 'button', '[data-view="analysis"]');
    if (store && analysisCuePending.has(store) && hasAnalysisData() && !analysisTab.disabled) {
      analysisCuePending.delete(store);
      const rect = analysisTab.getBoundingClientRect();
      const visible = document.visibilityState === 'visible' && rect.width > 0 && rect.height > 0
        && rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
        && !root.querySelector('dialog[open]');
      if (visible && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        analysisTab.classList.add('analysis-ready-cue');
        analysisTab.addEventListener('animationend', () => analysisTab.classList.remove('analysis-ready-cue'), {once:true, signal});
      }
    }
    if (!hasAnalysisData()) analysisTab.classList.remove('analysis-ready-cue');
    input('run-name').disabled = !!store || busy;
    const connectionUnavailable = connected || connecting || busy || !canUseDevice() || (!mock && !transport.isSupported()) || !!programmerState.busy;
    const connectionDisabled = (recording && !pointMode) || connectionUnavailable;
    const reconnectHidden = !canReconnect || connected || connecting;
    button('connect').disabled = connectionDisabled;
    button('reconnect').hidden = reconnectHidden;
    button('reconnect').disabled = connectionDisabled;
    const recordingActions = getRecordingActions({ state: measurementScreen.dataset.recordingState, hasAnalysisData: hasAnalysisData(),
      pointMode, hasRun: !!saved, hasSession: !!session, recording: !!recording, busy,
      ready: readyToRecord(), saveFailed: saved?.status === 'error', recordingSupported: recordingSupported(),
      needsConnection, connectionDisabled: connectionUnavailable, finishingFrom });
    for (const [id, action] of Object.entries(recordingActions)) {
      button(id).hidden = !action.visible; button(id).disabled = action.disabled;
    }
    button('measurement-reconnect').textContent = connecting ? copy.common.connecting : copy.measurement.reconnect;
    $('connect').textContent=canReconnect?copy.common.chooseDevice:mock&&!isTour()?copy.common.mockConnect:copy.common.connect;
    button('disconnect').disabled = (!connected && !connecting) || !!programmerState.busy;
    button('export-json').disabled = !saved; button('export-csv').disabled = !saved?.sampleCount;
    $('export-csv').textContent = `연속 기록 CSV 저장 (${saved?.sampleCount ?? 0}행)`;
    $('export-points-csv').hidden = !saved || !(saved.pointCount + saved.withdrawnPointCount);
    $('export-points-csv').textContent = `한 점 기록 CSV 저장 (${(saved?.pointCount ?? 0) + (saved?.withdrawnPointCount ?? 0)}행)`;
    button('analyze-points').disabled = !saved || !(saved.pointCount + saved.withdrawnPointCount);
    $('retry-save').hidden = saved?.status !== 'error';
    $('export-json').hidden=!saved; $('export-csv').hidden=!saved || pointMode;
    const exportMenu = root.querySelector('.luminous-export');
    if (exportMenu instanceof HTMLDetailsElement) { exportMenu.hidden=!saved; if (!saved) exportMenu.open=false; }
    const measurementGuide=getGuideContent(context).experimentGuide;
    // The resolved guide owns this action's name. Do not bind it to generic
    // data-copy: MeasurementView also applies that copy during initialization.
    $('show-experiment-guide').hidden=screen!=='measure'||!measurementGuide;
    $('show-experiment-guide').toggleAttribute('data-compact',!measurementGuide?.buttonLabel);
    setText($('experiment-guide-label'),measurementGuide?.buttonLabel??copy.measurement.guide);
    setText($('experiment-guide-label-compact'),measurementGuide?.buttonLabel?'':copy.measurement.guideCompact);
    experimentGuide.setRecording(Boolean(recording));
    setText($('sample-count'), saved ? pointMode ? formatCopy(copy.point.count, {count:saved.pointCount,withdrawn:saved.withdrawnPointCount}) : formatCopy(copy.measurement.count, {count:saved.sampleCount.toLocaleString('ko-KR')}) : '');
    $('lab-notice').hidden = screen === 'measure';
    const storageNotice = saved?.temporary ? '이 환경에서는 브라우저에 저장할 수 없습니다. 분석 결과는 전체 실험 JSON으로 보관하세요.' : saved?.error ? saved.error + ' 메모리의 자료는 유지됩니다. 다시 저장하거나 전체 실험 JSON을 보관하세요.'
      : saved?.nearLimit ? '보관 한도에 가까워졌습니다. 전체 실험 JSON으로 보관하고 새 실험을 준비하세요.'
      : saved && !saved.writable ? copy.common.readOnly : '';
    $('lab-notice').textContent = storageNotice || (current?.problem ? current.problem : !recordingSupported() ? '이 브라우저에서는 새 실험을 기록할 수 없습니다. 저장된 자료를 열어 분석할 수 있어요.'
      : mock && !isTour() && connected ? copy.measurement.mockNotice : '');
    if (renderedContext !== context) {
      renderedContext = context;
      $('preparation-notes').replaceChildren(...(context?.preparation ?? []).map(text => { const li=document.createElement('li'); li.textContent=text; return li; }));
    }
    memoView.render({context,store,busy,canAdd:!!session && ['recording','paused'].includes(current?.state) && !!saved?.writable});
    livePreview.freeze(current?.state === 'paused');
    if (screen === 'measure' && context) {
      const display = livePreview.snapshot();
      const latest = display.latest ?? (current?.state === 'paused' ? store?.getLatestSample() : null);
      if (measurementTab === 'continuous') measurement.render({context,store,tour:isTour(),latest,previewPoints:display.points,device:deviceState,recording,previewOnly:pointMode,displayNow:display.now,displayMono:display.mono,previewOrigin:display.origin,paused:current?.state === 'paused',selectedMemoId:memoView.getSelectedId()});
      pointView.render({context,store,latest,device:deviceState,busy,recordingMode:measurementTab,paused:current?.state === 'paused',captureVisible:measurementOptions.points && !needsConnection && (['recording','paused','finishing'].includes(current?.state) || (!saved && pointMode)),
        captureState: !recordingSupported() || (saved && !session) ? {ready:false,reason:'capture-read-only'} : session ? session.captureStatus(captureConnection()) : pointMode ? capture.status(captureConnection()) : {ready:false,reason:'capture-preview'} });
      if (root.querySelector('.luminous-overview') && focusedRecordControl && previousRecordingState !== measurementScreen.dataset.recordingState) {
        focusRecordingAction();
      }
      const noticeMessage = storageNotice || (!recordingSupported() ? '이 브라우저에서는 새 실험을 기록할 수 없습니다.' : mock && !isTour() && connected ? copy.measurement.mockNotice : '');
      setText($('measurement-action-message'), noticeMessage);
      findElement(root, 'div', '.measurement-notice').hidden = !noticeMessage;
    }
    if (saved?.eventsVersion !== renderedEvents) {
      renderedEvents = saved?.eventsVersion;
      const records = store?.getEvents(100) ?? [];
      renderEventList($('analysis-events'),records,context,saved?.writable?event=>editEventNote(event):null);
    }
    analysis.updateStatus();
  }
  for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('[data-view]'))) button.addEventListener('click',()=>{
    if (button.disabled || busy || programmerState.busy) return;
    if (button.dataset.view === 'home') void act(()=>exitToHome()); else navigate(button.dataset.view);
  },{signal});
  listen('connect',()=>connect()); listen('reconnect',()=>connect({reuseDevice:true,reconnecting:true})); listen('measurement-reconnect',async()=>{
    if (session?.getState().recording) { session.pause(); livePreview.freeze(true); }
    await connect({preferPrevious:true,reconnecting:true});
  }); $('disconnect').addEventListener('click',()=>disconnect().catch(showError),{signal}); listen('start-recording',start);
  listen('pause-recording',()=>{const result=session.pause();livePreview.freeze(true);return result;}); listen('resume-recording',()=>{requireReady();session.resume();});
  listen('finish-recording',async()=>{if (!memoView.flush() || !pointView.flush()) return; await session.finish();analysis.updateStatus();await store.flush();});
  listen('measurement-analyze',()=>navigate('analysis'));
  listen('prepare-new-experiment',prepareNewExperiment);
  listen('continuous-recording',()=>{if (!store && !getMeasurementOptions(context).continuousOnly) recordingMode = recordingMode === 'point' ? 'continuous' : 'point';});
  for (const control of /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('button[data-recording-mode]'))) control.addEventListener('click', () => {
    if (getMeasurementOptions(context).continuousOnly || busy || measurementTab === control.dataset.recordingMode || !memoView.flush() || !pointView.flush()) return;
    measurementTab = control.dataset.recordingMode;
    if (!store) recordingMode = measurementTab;
    render();
  }, { signal });
  listen('additional-recording',async()=>{requireReady();await dialogs.additional(policy(),confirmation=>{requireReady();session.startAdditional(confirmation);replayCycle++;});});
  listen('new-experiment',()=>exitToHome());
  listen('preview-tour',()=>{if(supportsTour(targetContext))loadPage(routeUrl(targetContext,'measure',{mock:true}).href,false);});
  listen('exit-tour',()=>leaveExperiment(context,'preview'));
  listen('activate-experiment',()=>activateExperiment()); listen('activate-prepared',()=>activateExperiment(true)); listen('prepare-device',()=>navigate('prepare'));
  listen('show-experiment-guide',()=>experimentGuide.show(context,{anchor:$('show-experiment-guide')}));
  listen('to-measure',()=>navigate('measure')); listen('return-current',()=>navigate(session || store?.getRun().recordingMode === 'point' ? 'measure' : 'analysis'));
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
  listen('download-program', downloadProgram);
  listen('analyze-points',()=>{if (!memoView.flush() || !pointView.flush()) return; navigate('analysis'); analysis.open(store, context, 'points');});
  listen('export-points-csv',()=>exportFile('points-csv'));
  listen('export-json',()=>exportFile('json'));listen('export-csv',()=>exportFile('csv'));
  $('open-file').addEventListener('click',()=>input('file-input').click(),{signal});
  input('file-input').addEventListener('change',()=>{const file=input('file-input').files[0];input('file-input').value='';act(()=>readFile(file));},{signal});
  $('mock-link').addEventListener('click',event=>{event.preventDefault();act(async()=>{if(await confirmTransition()) loadPage(routeUrl(context,'measure',{mock:true}).href,false);});},{signal});
  window.addEventListener('beforeunload',event=>{const draftsSaved=memoView.flush() && analysis.flush() && pointView.flush(),saved=store?.getState();if(!draftsSaved || session?.getState().recording || (saved?.writable && saved.status!=='clean') || (saved?.temporary && exportedRevision!==saved.runRevision)) {event.preventDefault();event.returnValue='';}},{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && store?.getState().writable){memoView.flush();analysis.flush();pointView.flush();store.flush().catch(showError);}},{signal});
  const interval = setInterval(()=>{
    try{session?.tick();}catch(error){showError(error);}
    if (connected || session?.getState().recording) renderRequested = true;
    if(renderRequested){renderRequested=false;render();}
  },200);
  const ready = act(async () => {
    let bookmark;
    try { if (historyEnabled) bookmark = JSON.parse(sessionStorage.getItem(resumeKey)); } catch { /* No restorable tab. */ }
    let route;
    try { route = parseRoute(initialUrl); } catch { await applyLocation(initialUrl); bootstrapped = true; return; }
    if (!tourContext(route.context) && bookmark?.id && bookmark.url === routeUrl(route.context, route.screen, {mock}).href) {
      // Deleted records simply return to the requested route. Never select a
      // different Run by recency, including one currently edited in another tab.
      const exists = (await repo.listRuns()).some(run => run.id === bookmark.id);
      if (exists) {
        restoring = true;
        try { await openRun(bookmark.id, route.screen, false); if (['point','continuous'].includes(bookmark.measurementTab)) measurementTab = bookmark.measurementTab; }
        catch (error) { await applyLocation(initialUrl); showError(error); }
        finally { restoring = false; }
      } else await applyLocation(initialUrl);
    } else await applyLocation(initialUrl);
    await transport.restoreDevice?.();
    bootstrapped = true;
  }); render();
  return { ready, async dispose(){
    sensorSettingsViews.forEach(view => view.dispose());
    picker.cancel();await persistCurrent(); await disconnect(); await store?.close();
    clearInterval(interval);abort.abort();dialogs.dispose();guide.dispose();await programmer?.dispose();analysis.dispose();help.dispose();memoView.dispose();measurement.dispose();pointView.dispose();experimentGuide.dispose();share.dispose();tourRepo.close();realRepo.close();
  }, getState:()=>({screen,context,targetContext,busy:busy || !!programmerState.busy,storage:store?.getState(),session:session?.getState()}) };
}
