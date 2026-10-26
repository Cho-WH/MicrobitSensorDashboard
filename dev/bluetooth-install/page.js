import { createDiagnostics, modeRequestProblem, fullDfuProblem } from './diagnostics.js';
import { fullPrograms } from './firmware/full-programs.js';
import { verifyFullImage } from './full-image.js';
import { createSecureDfu, dfuIds } from './secure-dfu.js';
import { getBluetoothSupport } from '../../src/device/browser-support.js';
import { createBleClient } from '../../src/device/ble-client.js';
import { getFirmwareArtifact } from '../../src/device/firmware.js';
import { trialPrograms } from './firmware/programs.js';
import { loadTrialProgram, partialFlashProblem } from './partial-flash.js';
import { createTrialRunner } from './trial-runner.js';
import { testPlans } from './test-plans.js';
import { createBridgeClient } from './bridge-client.js';

const $ = id => document.getElementById(id);
const support = getBluetoothSupport(), entries = [];
// Temporary hardware observation, independent of diagnostic/UART ownership.
const observedDevices = new WeakMap(), connectionTrace = [];
let connectionSequence = 0, traceSequence = 0;
function connectionSnapshot(device = selected) {
  return { deviceId: device?.id ?? null, latestConnectionId: observedDevices.get(device)?.connectionId ?? null,
    gattConnected: device?.gatt?.connected ?? false, visibility: document.visibilityState,
    monotonicMs: Math.round(performance.now() * 1000) / 1000 };
}
let dropped = 0, selected = null, report = null, busy = false, epoch = 0, uart = null;
let connectionOwner = null;
let started = 0, duration = 0, count = 0, lastLine = '—', pendingMode = null;
let pendingFlash = null, flashProgress = 0, flashText = '설치 모드로 연결한 뒤 시험 파일을 전송합니다.', knownProgram = null;
let activeFlashToken = null;
let runner, bridge, autoState = { status: 'idle', steps: [] };
let fullContext = null, fullProgress = 0, fullText = '런타임을 포함한 전체 애플리케이션을 처음부터 전송합니다.';
const names = { partial: '부분 전송', dfu: '전체 DFU', uart: '측정 UART', info: '장치 정보' };
const states = { available: '발견', absent: '없음', denied: '접근 거부', error: '조회 실패' };
const log = (kind, data = {}) => {
  const entry = { at: new Date().toISOString(), sequence: ++traceSequence, kind, ...connectionSnapshot(),
    context: { variant: $('variant').value, bonds: $('bonds').value, memo: $('memo').value }, ...data };
  entries.push(entry);
  // Preserve connection evidence separately from high-volume flash packet logs.
  if (kind.startsWith('trace-')) { connectionTrace.push(entry); if (connectionTrace.length > 2000) connectionTrace.shift(); }
  if (entries.length > 1500) { dropped++; entries.shift(); }
  const pane = $('log'), atBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 36;
  pane.textContent = entries.slice(-80).map(({ at, kind, context: _, ...rest }) => `${at.slice(11, 23)} ${kind} ${JSON.stringify(rest)}`).join('\n');
  if (atBottom) pane.scrollTop = pane.scrollHeight;
};
function observeDevice(device) {
  if (observedDevices.has(device)) return;
  const state = { connectionId: null };
  observedDevices.set(device, state);
  const emit = (kind, data = {}) => log(`trace-${kind}`, { ...connectionSnapshot(device), ...data });
  // Never removed by a module's cleanup. The event itself carries no connection ID.
  device.addEventListener('gattserverdisconnected', () => emit('device-disconnected', {
    attribution: 'latest attempt only; event does not identify its originating connection',
  }), true);
  const gatt = device.gatt;
  for (const method of ['connect', 'disconnect', 'getPrimaryService', 'getPrimaryServices']) {
    const original = gatt?.[method];
    if (!original) continue;
    gatt[method] = function (...args) {
      if (method === 'connect') { state.connectionId = ++connectionSequence; gatt.__trialConnectionId = state.connectionId; }
      const operationConnectionId = state.connectionId, began = performance.now();
      const callsite = new Error().stack?.split('\n').slice(2, 7).join('\n');
      const details = { method, operationConnectionId, callsite,
        ...(method === 'disconnect' ? { reason: 'explicit GATT.disconnect call; caller and cleanup reason in adjacent trace' } : {}),
        ...(method.startsWith('getPrimary') ? { service: args[0] ?? 'all' } : {}) };
      emit('operation-start', details);
      const ended = (outcome, error) => emit('operation-end', { ...details, outcome,
        elapsedMs: Math.round((performance.now() - began) * 1000) / 1000,
        ...(error ? { error: error.message, errorName: error.name } : {}) });
      try {
        const result = Reflect.apply(original, this, args);
        if (result?.then) void result.then(() => ended('resolved'), error => ended('rejected', error));
        else ended('returned');
        return result;
      } catch (error) { ended('threw', error); throw error; }
    };
  }
  emit('observer-installed');
}
const fullDfu = createSecureDfu({ onEvent: ({ kind, ...data }) => log(kind, data) });
function notice(message, error = false) { $('notice').textContent = message; $('notice').dataset.error = String(error); }
const diagnostic = createDiagnostics({ onEvent: ({ kind, ...rest }) => {
  log(kind, rest);
  if (kind === 'flash-finish-requested' && !runner?.running) pendingFlash = { device: selected, target: trialPrograms.find(p => p.id === rest.id) };
},
  isDeviceInUse: device => connectionOwner !== null && connectionOwner !== diagnostic && selected === device,
  onDisconnect(reason) {
  report = null;
  if (connectionOwner === diagnostic) connectionOwner = null;
  if (reason === 'device' && !busy) notice('진단 연결이 끊겼습니다. 선택 장치 재연결로 다시 확인하세요.');
  render();
} });

function render() {
  const connected = diagnostic.connected;
  const running = runner?.running;
  $('auto-plan').disabled = busy;
  $('auto-start').disabled = busy || !!uart || !!fullContext || !selected || support !== 'supported';
  $('auto-cancel').disabled = !running;
  $('remote-control').disabled = !selected || (busy && !$('remote-control').checked) || support !== 'supported';
  $('auto-hint').textContent = testPlans[$('auto-plan').value]?.hint ?? '';
  $('auto-status').textContent = autoState.status === 'idle' ? '장치 진단 후 시험을 시작하세요.'
    : `${autoState.target ?? ''} · ${autoState.stage ?? ''}${autoState.error ? ' · ' + autoState.error : ''}`;
  $('auto-progress').value = autoState.progress ?? 0;
  $('auto-results').replaceChildren(...(autoState.steps ?? []).map(step => {
    const li = document.createElement('li'); li.textContent = `${trialPrograms.find(p => p.id === step.id)?.name ?? step.id} · 프로그램 확인 · ${step.samples.length}개 수신 (${step.samples.at(-1).raw})`; return li;
  }), ...(autoState.connectionResults ?? []).map(result => {
    const li = document.createElement('li');
    li.textContent = `${result.mode === 0 ? '설치 모드' : '일반 모드'} · ${result.status === 'passed' ? '성공' : '실패'} · ${result.attemptAfterRequestMs == null ? '연결 시도 없음' : `이벤트 후 연결 · 요청 후 ${(result.attemptAfterRequestMs / 1000).toFixed(2)}초`}`;
    return li;
  }));
  $('choose').disabled = busy || !!uart || !!fullContext || support !== 'supported' || connected;
  $('reconnect').disabled = busy || !!uart || !!fullContext || !selected || connected || support !== 'supported';
  $('disconnect').disabled = !connected && !uart && !busy && !fullContext;
  $('diagnose').disabled = busy || !!uart || !connected;
  $('candidate').disabled = busy || !!uart;
  $('temperature-confirm').disabled = busy || !!uart;
  const pairProblem = modeRequestProblem(report, 0, $('candidate').checked);
  $('pair').disabled = busy || !!uart || !connected || !!pairProblem;
  $('application').disabled = busy || !!uart || !connected || !!modeRequestProblem(report, 1, false);
  $('mode-hint').textContent = pairProblem || '설치 모드 요청 후 같은 선택 장치에 재연결해 모드를 확인하세요.';
  $('start-uart').disabled = busy || !!uart || !!fullContext || !selected || !!pendingMode || !!pendingFlash || (knownProgram && knownProgram !== 'temperature') || !$('temperature-confirm').checked || support !== 'supported' || report?.status?.mode === 0;
  $('stop-uart').disabled = busy || !uart;
  $('connection-state').textContent = running ? '자동 시험 중' : uart ? '온도 수신 중' : connected ? '진단 연결됨' : '연결 안 됨';
  $('device-name').textContent = selected ? `${selected.name || '이름 없는 장치'} · ${selected.id || '식별자 없음'}` : '선택한 장치가 없습니다.';
  $('model').textContent = report?.info.model || '—';
  $('mode').textContent = report?.status ? ({ 0: '0 · 설치 대기', 1: '1 · 일반 실행' }[report.status.mode] ?? `${report.status.mode} · 알 수 없음`) : '—';
  $('protocol').textContent = report?.status ? `${report.status.protocol}${report.status.protocol !== 1 ? ' · 미지원' : ''}` : '—';
  const list = $('services'); list.replaceChildren();
  if (report) for (const [key, value] of Object.entries(report.services)) {
    const item = document.createElement('li'); item.textContent = `${names[key]} · ${states[value.state]}`; item.dataset.state = value.state;
    if (value.error) item.title = value.error;
    list.append(item);
  } else { const item = document.createElement('li'); item.textContent = '현재 연결에서 조회한 결과가 없습니다.'; list.append(item); }
  const rows = $('regions'); rows.replaceChildren();
  if (report && Object.keys(report.regions).length) for (const [id, region] of Object.entries(report.regions)) {
    const tr = document.createElement('tr');
    for (const text of [id === '1' ? '런타임' : '프로그램', `0x${region.start.toString(16)} / 0x${region.end.toString(16)}`, `${region.hash}${region.valid ? '' : ' · 유효하지 않음'}`]) {
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    }
    rows.append(tr);
  } else { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 3; td.textContent = '진단 후 표시합니다.'; tr.append(td); rows.append(tr); }
  $('line-count').textContent = String(count); $('last-line').textContent = lastLine;
  $('elapsed').textContent = `${Math.floor((uart && started ? performance.now() - started : duration) / 1000)}초`;
  const target = trialPrograms.find(p => p.id === $('flash-target').value);
  $('flash-target').disabled = busy || !!pendingFlash;
  $('flash').disabled = busy || !!uart || !!pendingFlash || !connected || !!partialFlashProblem(report, target);
  $('flash-progress').value = flashProgress;
  $('flash-status').textContent = flashText;
  $('flash-hint').textContent = pendingFlash ? '선택 장치 재연결로 프로그램을 확인하세요.' : partialFlashProblem(report, target) || `${target.name} · ${target.bytes.toLocaleString()}바이트 · SHA-256 검증 후 전송`;
  $('full-target').disabled = busy || !!fullContext || !!pendingFlash;
  $('full-enter').disabled = busy || !!uart || !!pendingFlash || !!fullContext || !connected || !!fullDfuProblem(report);
  $('full-choose').disabled = busy || !fullContext || !$('full-same').checked;
  $('full-send').disabled = busy || !fullContext?.device || !$('full-same').checked;
  $('full-same').disabled = busy || !fullContext;
  $('full-progress').value = fullProgress;
  $('full-status').textContent = fullText;
  $('full-hint').textContent = fullContext ? `원래 보드: ${fullContext.source.name}. DFU 모드에서는 이름이 DfuTarg로 바뀔 수 있습니다.`
    : fullDfuProblem(report) || '전체 파일 검사를 통과한 뒤 DFU 진입 명령을 보냅니다.';
}
async function run(label, action) {
  if (busy) return;
  busy = true; const token = ++epoch; render(); notice(`${label}…`); log('action', { label });
  try { await action(token); }
  catch (error) {
    if (token !== epoch) return;
    const cancelled = error.code === 'chooser-cancelled' || error.code === 'cancelled';
    log(cancelled ? 'cancelled' : 'error', { action: label, name: error.name, code: error.code, message: error.message });
    notice(cancelled ? '장치 선택을 취소했습니다. 준비되면 다시 선택하세요.' : `${label}: ${error.message}`, !cancelled);
  } finally { if (token === epoch) { busy = false; render(); } }
}
const current = token => { if (token !== epoch) throw Object.assign(new Error('작업 취소'), { code: 'cancelled' }); };
async function inspect(token) {
  const result = await diagnostic.diagnose(); current(token); report = result;
  knownProgram = trialPrograms.find(p => p.programHash === result.regions?.[2]?.hash && p.runtimeHash === result.regions?.[1]?.hash)?.id ?? null;
  if (knownProgram) $('variant').value = '모드 활성화 시험본 B';
  if (pendingFlash && pendingFlash.device === selected) {
    const target = pendingFlash.target;
    const matches = result.status?.protocol === 1 && result.status.mode === 1
      && result.regions?.[1]?.hash === target.runtimeHash && result.regions?.[2]?.hash === target.programHash;
    log('flash-observed', { id: target.id, expected: target.programHash, actual: result.regions?.[2]?.hash ?? null, mode: result.status?.mode, matches });
    flashText = matches ? `${target.name} · 재연결 후 프로그램 식별값과 일반 실행을 확인했습니다.` : '전송 후 프로그램이 확인되지 않았습니다. 로그를 보관하고 재전송 또는 USB로 복구하세요.';
    if (pendingFlash.method === 'full') {
      fullText = matches ? `${target.name} · ${pendingFlash.acknowledged ? '전체 DFU 실행 응답 확인 · ' : '최종 실행 응답 미확인 · '}재연결 후 대상 프로그램·일반 실행 확인`
        : '전체 전송 후 대상 프로그램이 확인되지 않았습니다. USB 복구가 필요합니다.';
      log('full-dfu-observed', { id: target.id, matches, acknowledged: pendingFlash.acknowledged });
    }
    notice(flashText, !matches); pendingFlash = null;
  } else if (pendingMode && pendingMode.device === selected) {
    const matches = result.status?.mode === pendingMode.mode;
    log('mode-observed', { expected: pendingMode.mode, actual: result.status?.mode ?? null, matches });
    notice(matches ? '재연결 후 요청한 모드를 확인했습니다. 펌웨어 설치 성공을 뜻하지는 않습니다.' : '재연결했지만 요청한 모드가 확인되지 않았습니다. 로그를 보관하고 USB 경로를 확인하세요.', !matches);
    pendingMode = null;
  } else notice(result.services.partial?.state === 'available' && result.status?.protocol === 1
    ? '진단을 완료했습니다. 서비스 발견은 무선 설치 성공을 의미하지 않습니다.'
    : '서비스 조회를 마쳤습니다. 지원하는 전송 서비스가 확인되지 않으면 USB로 준비하세요.');
  render();
}
$('choose').onclick = () => run('장치 선택·진단', async token => {
  bridge?.close(); $('remote-control').checked = false;
  const choosing = diagnostic.requestDevice(); // Browser chooser starts within the click.
  const device = await choosing; current(token);
  observeDevice(device);
  if (pendingFlash && pendingFlash.device.id !== device.id) { log('flash-verification-abandoned'); pendingFlash = null; }
  else if (pendingFlash) pendingFlash.device = device;
  selected = device; pendingMode = null; report = null; knownProgram = null; $('candidate').checked = false; $('temperature-confirm').checked = false;
  connectionOwner = diagnostic;
  await diagnostic.connect(device); current(token); await inspect(token);
});
$('reconnect').onclick = () => run('선택 장치 재연결', async token => { connectionOwner = diagnostic; await diagnostic.connect(selected); current(token); await inspect(token); });
$('diagnose').onclick = () => run('진단 조회', inspect);

for (const target of fullPrograms) {
  const option = document.createElement('option'); option.value = target.id;
  option.textContent = `${target.name} · ${target.bytes.toLocaleString()}바이트`;
  $('full-target').append(option);
}
$('full-same').onchange = () => { if (!$('full-same').checked && fullContext) fullContext.device = null; render(); };
$('full-enter').onclick = () => run('전체 파일 검사·DFU 진입', async token => {
  const target = fullPrograms.find(p => p.id === $('full-target').value);
  const files = await Promise.all([target.file, target.initFile].map(async file => {
    const response = await fetch(new URL(`./firmware/${file}`, import.meta.url), { cache: 'no-store' });
    if (!response.ok) throw new Error(`시험 파일을 읽지 못했습니다: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }));
  current(token);
  const image = await verifyFullImage(target, ...files); current(token);
  fullProgress = 0; $('full-same').checked = false;
  fullContext = { source: selected, image, device: null };
  log('full-image-verified', { id: target.id, bytes: target.bytes, sha256: target.sha256, initSha256: target.initSha256 });
  try {
    await diagnostic.enterFullDfu(); current(token);
    fullText = 'DFU 진입 요청이 수락됐습니다. 같은 보드인지 확인한 뒤 DFU 장치를 선택하세요.';
    notice(fullText);
  } catch (error) {
    fullText = 'DFU 진입 미확인. 로그를 확인하세요. 보드가 DFU로 바뀐 경우에만 같은 보드를 선택하고, 아니면 USB로 복구하세요.';
    throw error;
  }
});
$('full-choose').onclick = () => run('DFU 장치 선택', async token => {
  const context = fullContext;
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [dfuIds.service] }] }); current(token);
  observeDevice(device);
  context.device = device;
  log('dfu-device-selected', { source: context.source.id, name: device.name, id: device.id, identity: 'user-confirmed; not cryptographically verified' });
  fullText = `${device.name || 'DFU 장치'} 선택됨. 전체 교체 시작을 누르면 제어·데이터 특성을 확인하고 전송합니다.`;
  notice(fullText);
});
$('full-send').onclick = () => run('전체 DFU 전송', async token => {
  const context = fullContext; connectionOwner = fullDfu;
  try {
    await fullDfu.flash(context.device, context.image, {
      progress({ sent, total }) { current(token); fullProgress = Math.round(sent / total * 100); fullText = `${sent.toLocaleString()} / ${total.toLocaleString()}바이트 · 객체 CRC·실행 응답 확인`; render(); },
      finalizing() { current(token); pendingFlash = { device: context.source, target: context.image.target, method: 'full', acknowledged: false }; },
    });
    current(token); pendingFlash.acknowledged = true;
    fullText = '전체 DFU 실행 응답을 확인했습니다. 선택 장치 재연결로 원래 보드의 프로그램을 확인하세요.';
    fullContext = null; notice(fullText);
  } catch (error) {
    if (token !== epoch) throw error;
    fullText = pendingFlash ? '최종 실행 응답을 확인하지 못했습니다. 원래 보드에 재연결해 상태를 확인하세요.' : '전체 전송 미완료. 이번 시험은 자동 재개하지 않습니다. 로그를 보관하고 USB로 복구하세요.';
    if (pendingFlash) fullContext = null;
    throw error;
  } finally { if (token === epoch && connectionOwner === fullDfu) connectionOwner = null; }
});

for (const target of trialPrograms) {
  const option = document.createElement('option'); option.value = target.id; option.textContent = target.name;
  $('flash-target').append(option);
}
$('flash-target').onchange = render;
$('flash').onclick = () => run('무선 전송', async token => {
  activeFlashToken = token;
  flashProgress = 0; flashText = '시험 파일을 검증하고 있습니다.'; render();
  try {
    const image = await loadTrialProgram($('flash-target').value); current(token);
    await diagnostic.flash(image.target.id, image.data, { progress(state) {
      current(token); flashProgress = Math.round(state.sent / state.total * 100);
      flashText = `${flashProgress}% · ${state.sent.toLocaleString()} / ${state.total.toLocaleString()}바이트 · 재전송 ${state.retries}회`; render();
    } });
    current(token);
    flashText = '전송 종료 요청을 보냈습니다. 재연결 후 프로그램을 확인하세요.';
    notice(flashText);
  } catch (error) {
    if (token !== epoch) throw error;
    flashText = pendingFlash ? '종료 요청 뒤 연결이 끊겼습니다. 재연결로 실제 프로그램을 확인하세요.' : '전송을 완료하지 못했습니다. 재연결 후 재전송하거나 USB로 복구하세요.';
    throw error;
  } finally { if (activeFlashToken === token) activeFlashToken = null; }
});

for (const [button, mode] of [['pair', 0], ['application', 1]]) $(button).onclick = () => run('모드 전환 요청', async token => {
  // Re-read status and identity immediately before a mode-changing command.
  report = await diagnostic.diagnose(); current(token);
  const problem = modeRequestProblem(report, mode, $('candidate').checked);
  if (problem) throw new Error(problem);
  pendingMode = { mode, device: selected };
  try { await diagnostic.reset(mode, { candidateConfirmed: $('candidate').checked }); current(token); }
  finally { $('candidate').checked = false; }
  notice('전환 요청을 보냈습니다. 선택 장치 재연결을 눌러 실제 모드를 확인하세요.');
});
function releaseUart() {
  const previous = uart; uart = null;
  if (connectionOwner === previous) connectionOwner = null;
  if (started) duration = performance.now() - started;
  started = 0;
  // Disconnect the physical GATT first, so a hung stopNotifications cannot retain it.
  previous?.getContext().device?.gatt?.disconnect();
  void previous?.disconnect().catch(error => log('cleanup-error', { message: error.message }));
}
function disconnect() {
  if (runner?.running) { runner.cancel(); notice('시험 중단·연결 정리 중…'); return; }
  if (fullContext || connectionOwner === fullDfu) fullText = '전체 교체 작업을 중단했습니다. 필요하면 USB로 복구하세요.';
  fullContext = null; fullDfu.disconnect();
  if (activeFlashToken !== null) { activeFlashToken = null; flashText = '전송을 중단했습니다. 재연결 후 재전송하거나 USB로 복구하세요.'; }
  ++epoch; busy = false; releaseUart(); diagnostic.disconnect(); report = null; connectionOwner = null;
  $('candidate').checked = false;
  notice('연결을 해제했습니다. 기록은 페이지에 남아 있습니다.'); render();
}
$('disconnect').onclick = disconnect;
const limited = (promise, stage) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${stage} 응답 시간 초과`)), 6000); })]).finally(() => clearTimeout(timer));
};
$('start-uart').onclick = () => run('온도 수신 시작', async token => {
  const reuseConnection = diagnostic.connected;
  if (reuseConnection) await diagnostic.releaseConnection();
  current(token); report = null;
  const client = createBleClient(); uart = client; connectionOwner = client;
  count = 0; lastLine = '—'; started = 0; duration = 0;
  client.setDisconnectedListener(() => {
    if (uart !== client) return;
    releaseUart(); log('uart-disconnected'); notice('온도 수신 연결이 끊겼습니다. 다시 시작하면 새 수신으로 비교합니다.'); render();
  });
  try {
    const target = selected, connecting = client.connect(target, { reuseConnection });
    const ownerConnectionId = target.gatt?.__trialConnectionId;
    const cleanLateConnection = () => {
      // A cancelled UART connect may finish at the OS after its deadline. Preserve
      // any newer owner; otherwise release the late physical GATT connection.
      if (uart !== client && !connectionOwner && target.gatt?.connected) {
        log('trace-late-cleanup', { reason: 'manual UART connect completed after owner released', ownerConnectionId });
        target.gatt.disconnect();
      }
    };
    connecting.then(cleanLateConnection, cleanLateConnection);
    await limited(connecting, 'UART 연결'); current(token);
    await limited(client.startNotifications(line => {
      if (uart !== client) return;
      if (typeof line !== 'string') { log('uart-frame-error', line); return; }
      count++; lastLine = line;
      log('uart-line', { line, elapsedMs: started ? Math.round(performance.now() - started) : null }); render();
    }), 'UART 알림 구독'); current(token);
    await limited(client.sendStartCommand('start'), 'start 명령'); current(token);
    started = performance.now(); log('uart-start'); notice('온도 원문을 수신하고 있습니다. 수신 중단은 stop 명령을 보내고 연결을 해제합니다.');
  } catch (error) { if (uart === client) releaseUart(); throw error; }
});
$('stop-uart').onclick = () => run('온도 수신 중단', async () => {
  try { await limited(uart.sendStartCommand('stop'), 'stop 명령'); log('uart-stop'); }
  finally { releaseUart(); }
  notice('수신을 중단했습니다. 다시 시작해 재연결을 비교할 수 있습니다.');
});
for (const id of ['candidate', 'temperature-confirm']) $(id).onchange = render;
function exportLog() {
  return JSON.stringify({ format: 'sensor-lab-bluetooth-diagnostics-v1', exportedAt: new Date().toISOString(),
    environment: { url: location.href, userAgent: navigator.userAgent, secure: isSecureContext, bluetooth: support, connectionHandoff: 'same-gatt-v1', connectionTimingTrial: 'disconnect-event', transferDisconnectTrial: 1, independentConnectionTrace: 1, retainSuccessfulTrialConnection: 1, reconnectReadRetry: 1 },
    context: { variant: $('variant').value, bonds: $('bonds').value, memo: $('memo').value },
    dropped, entries, connectionTrace, report, automatedTrial: autoState, transfer: { progress: flashProgress, description: flashText, pendingProgram: pendingFlash?.target.id ?? null },
    fullTransfer: { description: fullText, progress: fullProgress, target: fullContext?.image.target.id ?? null },
    uart: { count, lastLine, durationMs: uart && started ? performance.now() - started : duration } }, null, 2);
}
$('copy-log').onclick = async () => {
  try { await navigator.clipboard.writeText(exportLog()); notice('진단 로그를 복사했습니다.'); }
  catch { notice('클립보드에 접근하지 못했습니다. JSON 저장을 이용하세요.', true); }
};
$('save-log').onclick = () => {
  const url = URL.createObjectURL(new Blob([exportLog()], { type: 'application/json' })), link = document.createElement('a');
  link.href = url; link.download = `bluetooth-trial-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice('진단 로그 파일을 저장했습니다.');
};
$('clear-log').onclick = () => { entries.length = 0; dropped = 0; log('log-cleared'); notice('로그를 지웠습니다. 수신 횟수와 현재 연결은 유지합니다.'); };
$('usb').onclick = disconnect;
const artifact = getFirmwareArtifact('temperature-uart');
$('download-hex').href = artifact.url; $('download-hex').download = artifact.fileName;
const supportText = { supported: 'Bluetooth API 사용 가능 · 실제 보드 연결은 별도 확인', insecure: '내부 IP의 HTTP에서는 Bluetooth를 사용할 수 없습니다. PC에서는 localhost, 휴대폰에서는 신뢰할 수 있는 HTTPS 주소로 여세요.', blocked: '이 화면의 권한 정책에서 Bluetooth가 차단됐습니다. 지원 브라우저의 별도 탭에서 여세요.', unsupported: '이 브라우저는 Web Bluetooth를 제공하지 않습니다. PC Chrome·Edge 또는 지원 Android 브라우저에서 여세요.' };
$('environment').textContent = `${location.origin} · ${supportText[support]}`;
for (const [id, plan] of Object.entries(testPlans)) {
  const option = document.createElement('option'); option.value = id; option.textContent = plan.name; $('auto-plan').append(option);
}
runner = createTrialRunner({ diagnostic, onEvent: ({ kind, ...data }) => log(kind, data),
  onOwner: owner => { connectionOwner = owner; }, onState: state => { autoState = state; render(); } });
async function startAuto(plan) {
  if (busy || uart || fullContext || !selected) throw new Error('선택 장치를 준비하고 진행 중인 작업을 마치세요.');
  busy = true; pendingFlash = pendingMode = null; $('auto-plan').value = plan; render();
  try {
    notice(`${testPlans[plan].name} 자동 시험을 시작합니다.`);
    const result = await runner.run(selected, plan);
    notice(result.status === 'passed' ? (testPlans[plan].connectionOnly ? '두 모드의 첫 연결·서비스 조회와 일반 모드 복귀를 확인했습니다.'
      : '왕복 교체와 측정값 수신을 확인했습니다. 물리 정확도는 별도 검증입니다.') : result.error, result.status !== 'passed');
    return result;
  } finally { busy = false; report = diagnostic.connected ? diagnostic.report : null; render(); }
}
$('auto-plan').onchange = render;
$('auto-start').onclick = () => void startAuto($('auto-plan').value).catch(error => notice(error.message, true));
$('auto-cancel').onclick = () => runner.cancel();
bridge = createBridgeClient({
  snapshot: () => ({ armed: $('remote-control').checked && !!selected, busy, device: selected ? { id: selected.id, name: selected.name } : null,
    state: autoState, log: JSON.parse(exportLog()) }),
  execute: async command => {
    if (!$('remote-control').checked || !selected) throw new Error('로컬 제어가 꺼졌습니다.');
    if (command.action === 'cancel') { disconnect(); return { status: 'cancel-requested' }; }
    if (command.action === 'run') return startAuto(command.plan);
    if (command.action === 'diagnose') {
      if (busy || uart || fullContext) throw new Error('진행 중인 작업을 먼저 마치세요.');
      let result;
      await run('로컬 요청 · 진단', async token => {
        connectionOwner = diagnostic;
        if (!diagnostic.connected) await diagnostic.connect(selected);
        current(token); await inspect(token); result = report;
      });
      if (!result) throw new Error('진단 실패 · 로그를 확인하세요.');
      return { status: 'completed' };
    }
    throw new Error('지원하지 않는 로컬 명령');
  }, onStatus: text => { $('bridge-status').textContent = text; },
  onLost: () => { $('remote-control').checked = false; if (runner.running) runner.cancel(); render(); },
});
$('remote-control').onchange = async () => {
  if (!$('remote-control').checked) { bridge.close(); if (runner.running) runner.cancel(); return; }
  try { await bridge.open(); }
  catch (error) { $('remote-control').checked = false; $('bridge-status').textContent = `연결 실패: ${error.message}`; }
  render();
};
log('page-open', { secure: isSecureContext, support, userAgent: navigator.userAgent });
document.addEventListener('visibilitychange', () => log('visibility', { state: document.visibilityState }));
window.addEventListener('pagehide', () => { bridge.close(); runner.cancel(); ++epoch; busy = false; fullDfu.disconnect(); fullContext = null; releaseUart(); diagnostic.disconnect(); connectionOwner = null; render(); });
setInterval(() => { if (uart) render(); }, 1000);
render();
