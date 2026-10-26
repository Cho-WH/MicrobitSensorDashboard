// Small bench experiment. Reconnect retries only; never replay a firmware transfer.
import { unbondedPrograms as programs } from './firmware/unbonded/programs.js';
import { createDiagnostics } from './diagnostics.js';
import { dfuIds, parseDfuResponse } from './secure-dfu.js';
import { verifyFullImage } from './full-image.js';
import { createBleClient } from '../../src/device/ble-client.js';
import { decodeTrialSample } from './test-plans.js';
import { createBridgeClient } from './bridge-client.js';
import { reconnectPolicy, retryConnection, connectionNotReady, requireDiagnosticReady } from './connection-retry.js';

const $ = id => document.getElementById(id), records = [];
let device, report, identified, entry, image, expected, origin, busy = false, stopped = false, uart;
let entryAccepted = false, verifyReady = false, transferConfirmed = false;
let state = { status: 'idle', steps: [] };
const images = new Map();
function log(event) {
  records.push({ at: new Date().toISOString(), ms: Math.round(performance.now()), ...event });
  if (records.length > 1500) records.splice(0, records.length - 1500);
  $('log').textContent = records.slice(-100).map(r => JSON.stringify(r)).join('\n');
  $('log').scrollTop = $('log').scrollHeight;
}
const diagnostic = createDiagnostics({ onEvent: log, onDisconnect: () => { report = identified = entry = null; render(); } });
let dfuDevice;
function disconnectDfu() { dfuDevice?.gatt?.disconnect(); dfuDevice = null; }
function render() {
  $('choose').disabled = busy || !images.size;
  $('reconnect').disabled = busy || !device;
  $('target').disabled = busy || entryAccepted || !images.size;
  $('enter').disabled = busy || !identified || !entry || !diagnostic.connected || entryAccepted;
  $('flash').disabled = busy || !entryAccepted;
  $('verify').disabled = busy || !verifyReady || !device;
  $('receive').disabled = busy || !identified || !diagnostic.connected;
}
function check() { if (stopped) throw new Error('사용자가 실험을 중단했습니다.'); }
async function bounded(promise, stage, ms = 12000) {
  check(); let timer;
  try {
    const value = await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(stage + ': 시간 초과'), { code: 'timeout' })), ms); })]);
    check(); return value;
  } finally { clearTimeout(timer); }
}
async function action(label, work) {
  if (busy) return { status: 'busy' };
  busy = true; stopped = false; render(); $('notice').textContent = label; $('notice').dataset.error = 'false';
  state = { status: 'running', label, steps: [] };
  log({ kind: 'action', label, memo: $('memo').value, singleBoardNoBond: $('single-board').checked });
  try { await work(); check(); state.status = 'passed'; return { status: 'passed' }; }
  catch (error) {
    state.status = stopped ? 'cancelled' : 'failed'; state.error = error.message;
    log({ kind: 'error', label, name: error.name, message: error.message });
    $('notice').textContent = error.message + ' · 로그를 저장하고 필요하면 C HEX를 USB로 복구하세요.';
    $('notice').dataset.error = 'true';
    diagnostic.disconnect(); disconnectDfu(); uart?.disconnect(); device?.gatt?.disconnect();
    report = identified = entry = null;
    return { status: state.status };
  } finally { busy = false; render(); }
}
function benchCondition() {
  if (!$('single-board').checked) throw new Error('한 대만 켠 비본딩 실험 조건을 먼저 확인하세요.');
}
function identify(fresh) {
  if (!/\bV2\b/i.test(fresh.info?.model ?? '') || fresh.status?.protocol !== 1 || fresh.status.mode !== 1)
    throw new Error('일반 실행 모드인 micro:bit V2 시험본 C가 필요합니다.');
  const match = programs.find(p => p.runtimeHash === fresh.regions[1]?.hash && p.programHash === fresh.regions[2]?.hash
    && p.programStart === fresh.regions[2]?.start);
  if (!match) throw new Error('시험본 C 식별값이 아닙니다. C HEX를 USB로 먼저 설치하세요.');
  return match;
}
async function inspect() {
  report = await diagnostic.diagnose(); requireDiagnosticReady(report); identified = identify(report);
  const service = await bounded(device.gatt.getPrimaryService(dfuIds.service), 'DFU 서비스', reconnectPolicy.serviceDiscoveryTimeoutMs);
  const chars = await bounded(service.getCharacteristics(), 'DFU 특성', reconnectPolicy.serviceDiscoveryTimeoutMs);
  log({ kind: 'dfu-characteristics', values: chars.map(c => ({ uuid: c.uuid, write: c.properties.write, indicate: c.properties.indicate })) });
  entry = chars.find(c => c.uuid === dfuIds.button && c.properties.write && c.properties.indicate);
  $('board').textContent = `${device.name} · ${identified.name} · serial ${report.info.serial || '없음'} · DFU ${entry ? '비본딩 0003' : '0003 없음'}`;
  if (!entry) throw connectionNotReady('비본딩 DFU 특성 0003이 없습니다. 0004로 전송하지 않습니다.');
  log({ kind: 'candidate-confirmed', device: { id: device.id, name: device.name }, program: identified.id, report });
}
function sameBoard() {
  if (origin?.serial && report.info.serial) {
    if (origin.serial !== report.info.serial) throw new Error('설치 전후 보드 일련번호가 다릅니다.');
  } else if (origin?.id !== device.id) throw new Error('설치 전후 같은 보드임을 확인하지 못했습니다.');
}
function retrySetup(phase, work, cleanup) {
  return retryConnection(work, { phase, check, cleanup,
    pause: ms => bounded(new Promise(resolve => setTimeout(resolve, ms)), '재연결 대기', ms + 1000),
    onEvent: event => {
      state.reconnectAttempt = event.attempt;
      if (event.kind === 'connection-retry-wait') $('notice').textContent = `연결 준비 실패 · ${event.delayMs / 1000}초 뒤 다시 확인합니다.`;
      log(event);
    } });
}
async function reconnect(phase = 'full-diagnose') {
  await retrySetup(phase, async () => {
    if (!diagnostic.connected) await diagnostic.connect(device);
    await inspect();
  }, () => diagnostic.disconnect());
  $('notice').textContent = 'C 후보와 비본딩 진입 특성을 확인했습니다.';
}
$('choose').onclick = () => action('보드 선택·진단', async () => {
  // Chooser must be opened inside the click, before asynchronous work.
  const selected = await diagnostic.requestDevice(); check();
  diagnostic.disconnect(); device = selected;
  await reconnect();
  if (verifyReady) await verify();
});
$('reconnect').onclick = () => action('같은 보드 재연결·확인', reconnect);

async function enterDfu(target) {
  benchCondition();
  image = images.get(target);
  if (!image) throw new Error('전송 파일이 준비되지 않았습니다.');
  // Re-read identity immediately before changing mode. No PFS reset command is sent.
  await inspect();
  origin = { id: device.id, name: device.name, serial: report.info.serial };
  expected = image.target; verifyReady = false; transferConfirmed = false;
  await diagnostic.releaseConnection();
  const button = entry, started = performance.now();
  let notified, disconnected, timer;
  const gone = new Promise(resolve => {
    disconnected = () => { log({ kind: 'entry-disconnected', elapsedMs: performance.now() - started }); resolve(true); };
    device.addEventListener('gattserverdisconnected', disconnected);
    timer = setTimeout(() => resolve(false), reconnectPolicy.disconnectWaitMs);
  });
  let accept, reject;
  const reply = new Promise((resolve, fail) => { accept = resolve; reject = fail; });
  reply.catch(() => {}); // Subscription failure can precede the command wait.
  notified = event => {
    const v = event.target.value, bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();
    log({ kind: 'entry-response', bytes: Array.from(bytes) });
    try { parseDfuResponse(bytes, 1, 0x20); accept(); } catch (error) { reject(error); }
  };
  button.addEventListener('characteristicvaluechanged', notified);
  try {
    await bounded(button.startNotifications(), '비본딩 DFU 알림 구독');
    await bounded(Promise.all([button.writeValueWithResponse(Uint8Array.of(1)), reply]), 'DFU 진입 응답');
    log({ kind: 'entry-accepted', target: expected.id });
    const eventSeen = await gone; check();
    log({ kind: 'entry-disconnect-wait', eventSeen });
    entryAccepted = true;
    $('notice').textContent = 'DFU 진입 응답 확인. 3번에서 시험 보드의 DFU 장치를 선택하세요.';
  } finally {
    clearTimeout(timer); device.removeEventListener('gattserverdisconnected', disconnected);
    button.removeEventListener('characteristicvaluechanged', notified);
    device.gatt.disconnect(); report = identified = entry = null;
  }
}
$('enter').onclick = () => action('비본딩 DFU 진입', () => enterDfu($('target').value));
$('flash').onclick = () => action('전체 이미지 전송', async () => {
  benchCondition();
  const boot = await navigator.bluetooth.requestDevice({ filters: [{ services: [dfuIds.service] }, { name: 'DfuTarg' }], optionalServices: [dfuIds.service] }); check();
  await flash(boot, 'user-selected, single-board bench; no automatic identity proof');
});
async function flash(boot, association) {
  if (!entryAccepted || !image) throw new Error('DFU 진입 응답 확인이 먼저 필요합니다.');
  log({ kind: 'bootloader-selected', device: { id: boot.id, name: boot.name }, origin,
    association, target: expected.id, sha256: expected.sha256 });
  entryAccepted = false; verifyReady = false; $('progress').value = 0;
  $('notice').textContent = '라이브러리 기본 설정으로 전체 이미지를 전송하고 있습니다.';
  // Use the published library's transfer engine, without a local protocol fork.
  const dfu = new window.SecureDfu();
  dfuDevice = boot;
  let validated = 0, activity = performance.now(), watchdog;
  log({ kind: 'dfu-engine', package: '@thib3113/web-bluetooth-dfu', version: '2.4.0',
    configuration: 'library-defaults', packetBytes: dfu.packetSize,
    prn: dfu.packetReceiptNotification, forceRestart: dfu.forceRestart, smartSpeed: dfu.enableSmartSpeed });
  dfu.addEventListener('log', event => { activity = performance.now(); log({ kind: 'dfu-library-log', ...event }); });
  dfu.addEventListener('progress', p => {
    activity = performance.now();
    if (p.object !== 'firmware') return;
    validated = p.validatedBytes;
    $('progress').value = validated / p.totalBytes * 100;
    $('transfer').textContent = `전송 ${p.sentBytes} / 검증 ${validated} / 전체 ${p.totalBytes} B`;
    if (p.sentBytes === p.totalBytes) verifyReady = true;
    // Keep object-boundary evidence without logging every packet.
    if (p.sentBytes === validated) log({ kind: 'dfu-library-progress', ...p });
  });
  try {
    const checked = await verifyFullImage(programs.find(p => p.id === expected.id), image.data, image.init);
    // Only connection/discovery is retried. update() (including init/Execute) runs once.
    await retrySetup('full-dfu-prepare', async () => {
      await diagnostic.connect(boot); check();
      const service = await bounded(boot.gatt.getPrimaryService(dfuIds.service), 'DFU 서비스', reconnectPolicy.serviceDiscoveryTimeoutMs);
      const chars = await bounded(service.getCharacteristics(), 'DFU 특성', reconnectPolicy.serviceDiscoveryTimeoutMs);
      if (![dfuIds.control, dfuIds.packet].every(id => chars.some(c => c.uuid === id)))
        throw connectionNotReady('부트로더 DFU 제어·전송 특성이 아직 준비되지 않았습니다.');
      await diagnostic.releaseConnection(); check();
    }, () => { diagnostic.disconnect(); boot.gatt.disconnect(); });
    activity = performance.now(); check();
    $('notice').textContent = 'DFU 연결 준비 완료 · 라이브러리 기본 설정으로 전체 이미지를 전송하고 있습니다.';
    await Promise.race([
      dfu.update(boot, checked.init.buffer, checked.data.buffer),
      new Promise((_, reject) => { watchdog = setInterval(() => {
        if (stopped || performance.now() - activity > 15000) {
          disconnectDfu(); reject(new Error(stopped ? '사용자가 실험을 중단했습니다.' : 'DFU 라이브러리 응답 시간 초과'));
        }
      }, 500); }),
    ]);
    check();
    if (validated !== checked.data.length) throw new Error('라이브러리가 전체 이미지 검증을 보고하지 않았습니다.');
    transferConfirmed = true;
    log({ kind: 'transfer-response-complete', result: { sent: validated, engine: '@thib3113/web-bluetooth-dfu@2.4.0' } });
    $('notice').textContent = '전송 응답 확인 · 4번에서 프로그램과 새 수신을 확인하세요.';
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    $('transfer').textContent = '전송 미확인: ' + failure.message; throw failure;
  } finally { clearInterval(watchdog); disconnectDfu(); }
}

async function receive() {
  const target = identified, selected = await diagnostic.releaseConnection();
  let accept, reject, accepting = false;
  const samples = [], received = new Promise((resolve, fail) => { accept = resolve; reject = fail; });
  received.catch(() => {});
  try {
    await retrySetup('full-uart-prepare', async attempt => {
      uart = createBleClient();
      uart.setDisconnectedListener(() => { if (accepting) reject(new Error('측정 중 연결 해제')); });
      await bounded(uart.connect(selected, { reuseConnection: attempt === 1,
        serviceDiscoveryTimeoutMs: reconnectPolicy.serviceDiscoveryTimeoutMs }), 'UART 연결');
      await bounded(uart.startNotifications(raw => {
      if (!accepting) return;
      const { decoded, valid } = decodeTrialSample(target.id, raw);
      log({ kind: 'sample', raw, valid });
      if (!valid) { reject(new Error('측정값 형식·범위 오류')); return; }
      if (samples.length < 3) samples.push({ raw, values: decoded.values });
      $('reading').textContent = `${target.name}: ${samples.length}/3 · ${raw}`;
      if (samples.length === 3) accept();
      }), 'UART 구독');
      if (!selected.gatt.connected) throw connectionNotReady('UART 준비 중 연결이 끊겼습니다.');
    }, async () => { await uart?.disconnect(); uart = null; selected.gatt.disconnect(); });
    accepting = true;
    await bounded(Promise.all([uart.sendStartCommand('start'), received]), '측정값 3개', 15000);
    await bounded(uart.sendStartCommand('stop'), '측정 중단');
    await bounded(uart.releaseConnection(), 'UART 인계'); uart = null;
    await diagnostic.connect(selected, { reuseConnection: true });
    log({ kind: 'samples-confirmed', target: target.id, samples, scope: '형식·범위 확인; 측정 정확도 검증 아님' });
    return samples;
  } finally { if (uart) { await uart.disconnect(); uart = null; } }
}
async function verify() {
  sameBoard();
  if (identified.id !== expected?.id) throw new Error('설치 후 대상 프로그램 식별값이 일치하지 않습니다.');
  log({ kind: 'post-install-identity', target: expected.id, serial: report.info.serial, runtimeHash: expected.runtimeHash, programHash: expected.programHash });
  const samples = await receive();
  log({ kind: transferConfirmed ? 'installation-observed' : 'application-recovered-transfer-unconfirmed', target: expected.id,
    transferConfirmed, samples, note: '프로그램 헤더·새 수신 확인. 전체 메모리 해시 재계산은 아님.' });
  verifyReady = false;
  $('notice').textContent = `${expected.name} · 보드·프로그램·새 수신 확인.${transferConfirmed ? '' : ' 전송 최종 응답은 미확인입니다.'} 다음 교체를 시작할 수 있습니다.`;
}
async function verifyAfterInstall() {
  await reconnect('full-post-install');
  // Program identity and measurement failures do not repeat the transfer or start command.
  await verify();
}
$('verify').onclick = () => action('재연결·설치·수신 확인', verifyAfterInstall);
$('receive').onclick = () => action('현재 프로그램 수신', async () => { await inspect(); await receive(); $('notice').textContent = '현재 프로그램의 측정값 3개를 확인했습니다.'; });
function stop() {
  stopped = true; entryAccepted = false;
  diagnostic.disconnect(); disconnectDfu(); uart?.disconnect(); device?.gatt?.disconnect();
  report = identified = entry = null; log({ kind: 'manual-stop' });
  $('notice').textContent = '중단했습니다. 전송 도중이었다면 USB 복구가 필요할 수 있습니다.'; render();
}
$('disconnect').onclick = stop;
function exportedLog() {
  return { profile: 'unbonded-c', reconnectPolicy, exportedAt: new Date().toISOString(), userAgent: navigator.userAgent,
    memo: $('memo').value, programs, records };
}
$('save').onclick = () => {
  const blob = new Blob([JSON.stringify(exportedLog(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = `unbonded-c-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
const bridge = createBridgeClient({
  snapshot: () => ({ armed: $('remote-control').checked && !!device && $('single-board').checked, busy,
    device: device ? { id: device.id, name: device.name } : null,
    state: { ...state, profile: 'unbonded-c', reconnectPolicy, entryAccepted, verifyReady, transferConfirmed,
      message: $('notice').textContent, transfer: $('transfer').textContent, reading: $('reading').textContent },
    log: exportedLog() }),
  execute: async command => {
    if (!$('remote-control').checked || !device) throw new Error('로컬 제어와 보드 선택이 필요합니다.');
    if (command.action === 'cancel') { stop(); return { status: 'cancel-requested' }; }
    if (command.action === 'diagnose') return action('로컬 요청 · 진단', reconnect);
    if (command.action !== 'unbonded') throw new Error('C 화면에서는 unbonded 명령을 사용하세요.');
    return action('로컬 요청 · 비본딩 ' + command.target, async () => {
      benchCondition();
      if (command.target === 'verify') {
        if (!verifyReady) throw new Error('확인할 전송 결과가 없습니다.');
        await verifyAfterInstall(); return;
      }
      if (entryAccepted || verifyReady) throw new Error('진행 중인 DFU 또는 설치 확인을 먼저 마치세요.');
      const targets = command.target === 'quick' ? ['light-level', 'temperature'] : [command.target];
      for (const target of targets) {
        check(); $('target').value = target; state.target = target;
        state.phase = 'diagnose'; await reconnect();
        state.phase = 'enter'; await enterDfu(target); check();
        // The measured C board keeps the same browser device across DFU. Reuse its
        // existing permission; never open a chooser or guess another nearby device.
        state.phase = 'transfer';
        await flash(device, 'reuse-original-authorized-device; single-board bench'); check();
        state.phase = 'verify'; await verifyAfterInstall();
        state.steps.push({ target, status: 'passed', at: new Date().toISOString() });
      }
      state.phase = 'complete';
    });
  },
  onStatus: text => { $('bridge-status').textContent = text; },
  onLost: () => { $('remote-control').checked = false; if (busy) stop(); },
});
$('remote-control').onchange = async () => {
  if (!$('remote-control').checked) { bridge.close(); if (busy) stop(); return; }
  try { await bridge.open(); }
  catch (error) { $('remote-control').checked = false; $('bridge-status').textContent = error.message; }
};
window.addEventListener('pagehide', () => { bridge.close(); stopped = true; diagnostic.disconnect(); disconnectDfu(); uart?.disconnect(); device?.gatt?.disconnect(); });
$('environment').textContent = navigator.userAgent;
for (const target of programs) {
  $('target').add(new Option(target.name, target.id));
  const link = document.createElement('a'); link.href = target.usbHex; link.download = ''; link.className = 'button';
  link.textContent = target.name + ' HEX 받기'; $('downloads').append(link, ' ');
}
await action('실험 파일 준비', async () => {
  for (const target of programs) {
    const get = async file => {
      const response = await fetch('./firmware/unbonded/' + file);
      if (!response.ok) throw new Error('시험 파일 없음: ' + file);
      return new Uint8Array(await response.arrayBuffer());
    };
    const [data, init] = await Promise.all([get(target.file), get(target.initFile)]);
    images.set(target.id, await verifyFullImage(target, data, init));
  }
  $('notice').textContent = '파일 해시 확인 완료. 온도 C HEX를 USB로 먼저 설치한 뒤 보드를 선택하세요.';
  log({ kind: 'files-ready', programs });
});
