import { createBluetoothProgrammer } from './bluetooth-programmer.js';
// Adapted from Cho-WH/bme280 gay-lussac/guide/programmer-adapter.js at
// 59c5c149450f970bace2deaa183857c275595853. Full V2 flashing remains official.
import { getFirmwareArtifact } from './firmware.js';

const messages = {
  'no-device-selected': '장치 선택을 취소했어요. 준비되면 다시 설치할 수 있어요.',
  'device-in-use': '다른 탭이나 프로그램이 USB를 사용 중이에요. 해당 연결을 해제한 뒤 다시 설치하세요.',
  'device-disconnected': 'USB 연결이 끊겼어요. 케이블을 연결하고 다시 설치하세요.',
  timeout: '장치 응답을 기다리다 멈췄어요. USB를 다시 연결한 뒤 설치하세요.',
  'firmware-update-required': '장치의 USB 인터페이스를 확인해야 해요. micro:bit 공식 도움말을 참고하세요.',
  'wrong-board': '이 실험은 micro:bit V2를 사용해요. V2 장치를 연결해 주세요.',
  'recording-active': '기록을 마치고 저장이 완료된 뒤 프로그램을 설치하세요.',
};
const busyStatuses = new Set(['loading', 'connecting', 'flashing']);

/** Owns preparation/USB only. canInstall is the Controller's synchronous recording/save guard.
 * beforeFlash releases BLE after USB selection; it does not finish a Run on the user's behalf.
 * @param {{firmwareId:string,version?:number,onState?:(state:any)=>void,canInstall?:()=>boolean,
 * beforeFlash?:()=>Promise<void>,createConnection?:any,makeSource?:any,fetchFile?:any,crypto?:any,supported?:()=>boolean}} options
 */
export function createUsbProgrammer({ firmwareId, version = null, onState = (_state) => {}, canInstall = () => false,
  beforeFlash = async () => {}, createConnection = null, makeSource = null,
  fetchFile = globalThis.fetch, crypto = globalThis.crypto,
  supported = () => !!(/** @type {Navigator & {usb?:object}} */ (globalThis.navigator))?.usb && globalThis.isSecureContext,
}) {
  const program = getFirmwareArtifact(firmwareId, version);
  let usb, source, preparation, pending, disposed = false, abortPreparation;
  let state = { status: 'idle', busy: false, canInstall: false, progress: null, deviceName: '', message: '',
    expectedFirmware: { id: program.id, version: program.version }, installedThisSession: false, reportedFirmware: null };
  const allowed = () => !disposed && canInstall() === true;
  const emit = patch => {
    if (disposed) return;
    state = { ...state, ...patch };
    state.busy = busyStatuses.has(state.status);
    state.canInstall = !!source && !state.busy && allowed();
    onState({ ...state });
  };
  function assertAllowed() { if (!allowed()) throw Object.assign(new Error(messages['recording-active']), { code: 'recording-active' }); }
  async function prepare() {
    if (disposed || source || preparation) return preparation;
    if (!supported()) {
      emit({ status: 'unavailable', message: globalThis.isSecureContext === false
        ? '이 주소에서는 프로그램을 설치할 수 없어요. https로 시작하는 실험 주소를 열어 주세요.'
        : 'USB로 프로그램을 설치하려면 노트북의 Chrome·Edge에서 열어 주세요.' });
      return;
    }
    emit({ status: 'loading', message: '센서 프로그램을 준비하고 있어요.' });
    abortPreparation = new AbortController();
    preparation = (async () => {
      try {
        if (!createConnection || !makeSource) {
          const library = await import('../../public/vendor/microbit-usb-1.0.0.js');
          if (disposed) return;
          createConnection ??= library.createUSBConnection;
          makeSource ??= library.createUniversalHexFlashDataSource;
        }
        const response = await fetchFile(program.url, { signal: abortPreparation.signal });
        if (!response.ok) throw new Error('프로그램 파일을 불러오지 못했어요. 연결을 확인하고 다시 준비하세요.');
        const bytes = await response.arrayBuffer();
        // Preserve BOMs and stray CR/whitespace. Only CRLF -> LF is normalized.
        const hex = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n');
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hex)));
        const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
        if (program.digestMode !== 'utf8-crlf-to-lf' || hash !== program.sha256)
          throw new Error('프로그램 파일 확인에 실패했어요. 화면을 새로고침한 뒤 다시 시도하세요.');
        const candidate = makeSource(hex);
        await candidate('V2'); // Validate before opening or halting any device.
        if (disposed) return;
        usb ??= createConnection({ pauseOnHidden: false });
        await usb.initialize();
        if (disposed) return;
        source = candidate;
        emit({ status: 'ready', message: 'USB를 연결한 뒤 설치 버튼을 누르세요. 처음에는 장치 선택 창이 열립니다.' });
      } catch (error) {
        emit({ status: 'error', message: error.message || '프로그램을 준비하지 못했어요. 다시 준비해 주세요.' });
      } finally { preparation = null; abortPreparation = null; }
    })();
    return preparation;
  }
  function install() {
    if (disposed || !source || pending) return pending;
    if (!allowed()) { emit({ status: 'blocked', message: messages['recording-active'] }); return; }
    emit({ status: 'connecting', progress: null, deviceName: '', installedThisSession: false,
      message: 'USB 장치를 연결하고 있어요. 선택 창이 열리면 사용할 micro:bit를 골라 주세요.' });
    // Keep the user gesture: request USB before awaiting network, BLE or storage.
    pending = (async () => {
      let outcome;
      try {
        await usb.connect();
        if (disposed) return;
        if (usb.getBoardVersion() !== 'V2') throw Object.assign(new Error(), { code: 'wrong-board' });
        emit({ deviceName: usb.getDevice()?.productName || 'micro:bit V2' });
        assertAllowed();
        await beforeFlash();
        if (disposed) return;
        assertAllowed(); // Recording/save state may change while awaiting BLE cleanup.
        emit({ status: 'flashing', message: '프로그램을 설치하고 있어요. USB를 꽂아 두세요.' });
        await usb.flash(source, { partial: false, progress(stage, fraction) {
          if (stage !== 'FullFlashing') return;
          emit({ progress: Number.isFinite(fraction) ? Math.max(0, Math.min(100, Math.round(fraction * 100))) : null });
        } });
        outcome = { status: 'success', progress: 100, installedThisSession: true,
          message: '설치가 완료됐어요. 이제 Bluetooth로 새 측정값을 확인하세요.' };
      } catch (error) {
        outcome = { status: error.code === 'no-device-selected' ? 'cancelled' : 'error', progress: null,
          message: messages[error.code] || error.message || '설치하지 못했어요. USB와 다른 탭의 연결을 확인한 뒤 다시 설치하세요.' };
      } finally {
        try { await usb.disconnect(); } catch { /* Preserve the actual transfer result. */ }
        pending = null;
        if (outcome) emit(outcome);
      }
    })();
    return pending;
  }
  async function dispose() {
    if (disposed) return;
    disposed = true;
    abortPreparation?.abort();
    await preparation;
    await pending; // Do not interrupt an active hardware flash midway.
    try { await usb?.disconnect(); } finally { usb?.dispose(); }
  }
  return { prepare, install, dispose, getState: () => ({ ...state, canInstall: !!source && !state.busy && allowed() }) };
}

/** One installation mode at a time; both adapters report the same guide facts.
 * @param {any} options */
export function createProgrammer(options) {
  let mode = 'usb', adapter, disposed = false;
  const create = () => (mode === 'usb' ? createUsbProgrammer : createBluetoothProgrammer)({ ...options,
    onState: state => { if (!disposed) options.onState?.({ ...state, mode }); } });
  adapter = create();
  return {
    prepare: () => adapter.prepare(), install: () => adapter.install(),
    cancel: () => adapter.cancel?.(), takeConnection: () => adapter.takeConnection?.() ?? Promise.resolve(null),
    getState: () => ({ ...adapter.getState(), mode }),
    async setMode(next) {
      if (disposed || !['usb', 'wireless'].includes(next) || next === mode || adapter.getState().busy) return;
      await adapter.dispose();
      if (disposed) return;
      mode = next; adapter = create();
      options.onState?.({ ...adapter.getState(), mode });
      await adapter.prepare();
    },
    async dispose() { disposed = true; await adapter.dispose(); },
  };
}
