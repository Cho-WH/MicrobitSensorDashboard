// Tour adapter for the normal installation guide. No firmware fetch or hardware API.
export function createMockProgrammer({ firmwareId, version = null, canInstall = () => false,
  onState = (_state) => {}, beforeFlash = async () => {}, chooseDevice, cancelChoice = () => {} }) {
  let disposed = false, pending = null, controller = null;
  let state = { mode: 'usb', status: 'idle', busy: false, canInstall: false, progress: null,
    deviceName: '', message: '', installedThisSession: false, reportedFirmware: null,
    expectedFirmware: { id: firmwareId, version }, connectionAvailable: false };
  const getState = () => ({ ...state, canInstall: !disposed && state.status !== 'idle' && !state.busy && canInstall() });
  const emit = patch => {
    if (disposed) return;
    state = { ...state, ...patch };
    state.busy = ['connecting', 'flashing'].includes(state.status);
    onState(getState());
  };
  async function prepare() {
    if (!disposed && state.status === 'idle') emit({ status: 'ready', progress: null,
      message: '설치 버튼을 눌러 예시 장치에 센서 프로그램을 설치해 보세요.' });
  }
  function cancel() { controller?.abort(); if (pending) cancelChoice(); }
  function install() {
    if (disposed || pending || !getState().canInstall) return pending;
    controller = new AbortController();
    const { signal } = controller;
    const check = () => { signal.throwIfAborted(); if (!canInstall()) throw new Error('지금은 설치할 수 없어요.'); };
    const wait = ms => new Promise((resolve, reject) => {
      const stop = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, ms);
      signal.addEventListener('abort', stop, { once: true });
    });
    emit({ status: 'connecting', phase: 'selecting', progress: null, deviceName: '', installedThisSession: false,
      message: '센서 프로그램을 설치할 예시 장치를 선택하세요.' });
    pending = (async () => {
      try {
        const device = await chooseDevice({ name: state.mode === 'usb' ? 'micro:bit V2' : 'BBC micro:bit [LAB]' }, { purpose: 'install', mode: state.mode });
        check(); await beforeFlash(); check();
        emit({ status: 'flashing', deviceName: device.name, progress: 0, message: '센서 프로그램을 설치하고 있어요.' });
        for (const progress of [20, 45, 70, 90, 100]) {
          await wait(400); check(); emit({ progress });
        }
        emit({ status: 'success', installedThisSession: true, message: '설치가 완료됐어요. 다음 단계에서 측정 연결을 진행하세요.' });
      } catch (error) {
        emit({ status: signal.aborted || error.name === 'NotFoundError' ? 'cancelled' : 'error', progress: null,
          message: signal.aborted || error.name === 'NotFoundError' ? '설치를 취소했어요. 다시 시도할 수 있어요.' : error.message });
      } finally { pending = null; controller = null; }
    })();
    return pending;
  }
  return { prepare, install, cancel, getState, takeConnection: async () => null,
    async setMode(mode) {
      if (disposed || state.busy || !['usb', 'wireless'].includes(mode) || state.mode === mode) return;
      emit({ mode, status: 'idle', deviceName: '', installedThisSession: false }); await prepare();
    },
    async dispose() { disposed = true; cancel(); await pending; },
  };
}
