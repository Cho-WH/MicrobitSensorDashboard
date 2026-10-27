import { getFirmwareArtifact } from './firmware.js';
import { getBluetoothSupport } from './browser-support.js';
import { createDiagnostics } from './bluetooth-protocol.js';
import { verifyProgram, partialFlashProblem } from './partial-flash.js';
import { reconnectPolicy, retryConnection, requireDiagnosticReady, retryableConnectionError } from './connection-retry.js';

const fail = (code, message) => Object.assign(new Error(message), { code });
const usbMessage = '이 보드는 USB로 프로그램을 먼저 설치해야 해요. USB 케이블을 연결해 설치해 주세요.';
const resetMessage = '보드에 다시 연결하지 못했어요. micro:bit 뒤쪽의 리셋 버튼을 한 번 누른 뒤 ‘다시 시도’를 눌러 주세요.';
/** Installation owns GATT until the Controller explicitly hands it to measurement.
 * @param {any} options */
export function createBluetoothProgrammer({ firmwareId, version, canInstall = () => false,
  beforeFlash = async () => {}, onState = () => {}, fetchFile = fetch, bluetooth = (/** @type {any} */ (globalThis.navigator))?.bluetooth,
  createProtocol = createDiagnostics, retryDelaysMs = reconnectPolicy.delaysMs, onEvent = () => {} }) {
  const artifact = getFirmwareArtifact(firmwareId, version), target = artifact.partial;
  let image, preparation, pending, device, handed = false, disposed = false, cancelled = false, abort;
  let transferStarted = false, transferComplete = false;
  let state = { mode: 'wireless', status: 'idle', phase: '', busy: false, canInstall: false, progress: null,
    deviceName: '', message: '', installedThisSession: false, usbRequired: false };
  const allowed = () => !disposed && canInstall() === true;
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; onState(getState()); } };
  const getState = () => ({ ...state, canInstall: !!image && !state.busy && !state.usbRequired && allowed() });
  const check = () => {
    if (disposed || cancelled) throw fail('cancelled', '무선 설치를 취소했어요.');
    if (!allowed()) throw fail('blocked', '기록과 저장을 마친 뒤 설치해 주세요.');
  };
  const protocol = createProtocol({ bluetooth, verifyImage: (_id, bytes) => verifyProgram(target, bytes),
    isDeviceInUse: candidate => handed && candidate === device,
    onEvent: event => { if (event.kind === 'flash-sent') transferComplete = true; onEvent(event); } });
  async function pause(ms) {
    await new Promise((resolve, reject) => {
      const done = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', cancelWait); resolve(undefined); };
      const cancelWait = () => { clearTimeout(timer); reject(fail('cancelled', '무선 설치를 취소했어요.')); };
      const timer = setTimeout(done, ms);
      abort.signal.addEventListener('abort', cancelWait, { once: true });
    });
  }
  async function readBoard(phase) {
    return retryConnection(async () => {
      if (!protocol.connected) await protocol.connect(device);
      check();
      const report = await protocol.diagnose();
      requireDiagnosticReady(report);
      return report;
    }, { phase, check, cleanup: () => protocol.disconnect(), pause, delaysMs: retryDelaysMs,
      onEvent: event => { onEvent(event); if (event.kind === 'connection-retry-wait')
        emit({ status: 'connecting', message: '전원을 끄지 말고 보드를 가까이 둔 채 잠시 기다려 주세요.' }); } });
  }
  function compatible(report) {
    if (partialFlashProblem({ ...report, status: { ...report.status, mode: 0 } }, target))
      throw fail('incompatible', usbMessage);
  }
  const installed = report => report.status.mode === 1 && report.regions[2].hash === target.programHash;
  async function prepare() {
    if (disposed || image || preparation) return preparation;
    if (!target || getBluetoothSupport({ bluetooth }) !== 'supported') {
      emit({ status: 'unavailable', message: !target ? usbMessage : '무선 설치를 지원하는 Chrome·Edge에서 열거나 USB 설치를 이용해 주세요.' }); return;
    }
    cancelled = false; abort = new AbortController();
    emit({ status: 'loading', phase: '', busy: true, message: '잠시 기다려 주세요.' });
    preparation = (async () => {
      try {
        const response = await fetchFile(target.url, { signal: abort.signal });
        if (!response.ok) throw fail('file', '프로그램을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 준비해 주세요.');
        const prepared = await verifyProgram(target, new Uint8Array(await response.arrayBuffer()));
        if (abort.signal.aborted) throw fail('cancelled', '무선 설치를 취소했어요.');
        image = prepared;
        emit({ status: 'ready', message: '보드의 전원을 켜고 가까이 두세요. 설치 버튼을 누르면 보드를 선택할 수 있어요.' });
      } catch { emit(abort.signal.aborted
        ? { status: 'cancelled', message: '무선 설치를 취소했어요. 준비되면 다시 설치할 수 있어요.' }
        : { status: 'error', message: '프로그램을 준비하지 못했어요. 인터넷 연결을 확인하고 다시 준비해 주세요.' }); }
      finally { preparation = null; emit({ busy: false }); }
    })();
    return preparation;
  }
  function install() {
    if (!getState().canInstall || pending) return pending;
    cancelled = false; abort = new AbortController();
    emit({ status: 'connecting', phase: device ? 'installing' : 'selecting', busy: true, progress: null, installedThisSession: false,
      message: device ? '보드를 다시 확인하고 있어요.' : '선택 창에서 사용할 micro:bit를 골라 주세요.' });
    let selection;
    try { selection = device ? Promise.resolve(device) : protocol.requestDevice(); }
    catch (error) { selection = Promise.reject(error); }
    pending = (async () => {
      let choosing = true;
      try {
        device = await selection; choosing = false; check(); handed = false;
        emit({ deviceName: device.name || 'micro:bit', phase: transferComplete ? 'finishing' : 'installing',
          message: '전원을 끄지 말고 보드를 가까이 둔 채 잠시 기다려 주세요.' });
        await beforeFlash(); check();
        let report = await readBoard('partial-diagnose'); check(); compatible(report);
        // An interrupted write is never converted to success by a matching header.
        if (transferStarted && !transferComplete) throw fail('interrupted', usbMessage);
        if (!installed(report)) {
          if (transferComplete) throw fail('unverified', '설치한 프로그램을 확인하지 못했어요. USB로 다시 설치해 주세요.');
          if (report.status.mode === 1) {
            const previousHash = report.regions[2].hash;
            await protocol.reset(0, { candidateConfirmed: true, waitForDisconnect: true, allowDisconnectTimeout: true });
            report = await readBoard('partial-install-mode'); check(); compatible(report);
            if (report.status.mode !== 0 || report.regions[2].hash !== previousHash) throw fail('unverified', usbMessage);
          }
          if (report.status.mode !== 0) throw fail('incompatible', usbMessage);
          check(); transferStarted = true;
          emit({ status: 'flashing', phase: 'installing', progress: 0, message: '전원을 끄지 말고 보드를 가까이 둔 채 잠시 기다려 주세요.' });
          await protocol.flash(target.id, image.data, {
            progress: value => { check(); emit({ progress: Math.round(value.sent / value.total * 100) }); },
            finishing: () => emit({ status: 'connecting', phase: 'finishing', progress: null,
              message: '전원을 끄지 말고 잠시 기다려 주세요. 완료되면 알려 드릴게요.' }),
          });
          transferComplete = true;
          report = await readBoard('partial-post-install'); check(); compatible(report);
          if (!installed(report)) throw fail('unverified', '설치한 프로그램을 확인하지 못했어요. USB로 다시 설치해 주세요.');
        }
        emit({ status: 'success', progress: 100, installedThisSession: true, connectionAvailable: true,
          message: '다음으로 새 측정값이 들어오는지 확인해요.' });
      } catch (error) {
        protocol.disconnect();
        const interrupted = transferStarted && !transferComplete;
        const retryable = !choosing && !interrupted && retryableConnectionError(error);
        const isCancel = cancelled || (choosing && error.name === 'NotFoundError') || ['cancelled', 'chooser-cancelled'].includes(error.code);
        const permission = ['SecurityError', 'NotAllowedError'].includes(error.name);
        if (choosing) device = null;
        emit({ status: isCancel ? 'cancelled' : retryable ? 'recovery' : 'error', progress: null,
          usbRequired: interrupted || ['incompatible', 'unverified', 'interrupted'].includes(error.code),
          message: interrupted ? '설치가 중단됐어요. USB 케이블을 연결해 다시 설치해 주세요.'
            : isCancel ? '무선 설치를 취소했어요. 준비되면 다시 설치할 수 있어요.' : retryable ? resetMessage
            : permission ? 'Bluetooth 연결 권한을 허용한 뒤 다시 시도해 주세요.'
            : ['incompatible', 'unverified', 'interrupted', 'blocked'].includes(error.code) ? error.message
            : '무선 설치를 완료하지 못했어요. 보드를 확인하거나 USB 설치를 이용해 주세요.' });
      } finally { pending = null; emit({ busy: false }); }
    })();
    return pending;
  }
  function cancel() { cancelled = true; abort?.abort(); protocol.disconnect(); }
  async function takeConnection() {
    if (state.status !== 'success' || handed || !device) return null;
    // Installation is already verified. If unsubscribe loses the connection,
    // measurement can reconnect to this same device without another chooser.
    if (protocol.connected) {
      try { await protocol.releaseConnection(); } catch { protocol.disconnect(); }
    }
    handed = true; emit({ connectionAvailable: false });
    return device;
  }
  async function dispose() { disposed = true; cancel(); await preparation; await pending; }
  return { prepare, install, cancel, dispose, takeConnection, getState };
}
