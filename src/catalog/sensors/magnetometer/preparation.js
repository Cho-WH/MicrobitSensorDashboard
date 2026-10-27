// Only this sensor knows the compass commands, acknowledgements and timeouts.
export function createPreparationSession({ send, onChange, onError, timers = globalThis }) {
  let phase = 'handshake', calibration = 'unknown', timeout = null, disposed = false;
  const getState = () => ({ phase, calibration, allowReadings: phase === 'receiving' });
  function move(next, ms = 0, failure = '') {
    timers.clearTimeout(timeout); timeout = null; phase = next;
    if (ms) timeout = timers.setTimeout(() => { if (!disposed) onError(failure); }, ms);
    onChange(getState());
  }
  return {
    getState,
    start() {
      // Notifications may already have reported the board's current state.
      if (phase === 'handshake') move('handshake', 10000, '자기장 프로그램의 응답이 없어요. 기기가 보정 중이라면 보정을 완료한 뒤 다시 연결하세요. 그 외에는 micro:bit 뒤쪽의 리셋 버튼을 누른 뒤 다시 연결하세요.');
    },
    accept(input) {
      if (disposed || input.type !== 'device-status') return;
      if (input.status === 'choice' && phase === 'handshake') move('choice');
      else if (input.status === 'calibrating' && phase === 'starting') move('calibrating', 120000, '보정이 끝나지 않았어요. 보드의 안내를 확인하고 다시 연결하세요.');
      else if (input.status === 'calibrated' && ['handshake', 'calibrating'].includes(phase)) { calibration = 'device-reported'; move('receiving'); }
      else if (input.status === 'skipped' && phase === 'skipping') { calibration = 'skipped'; move('receiving'); }
    },
    async act(action) {
      if (disposed || phase !== 'choice' || !['calibrate', 'skip'].includes(action)) return false;
      move(action === 'calibrate' ? 'starting' : 'skipping', 5000, '장치가 선택에 응답하지 않았어요. 다시 연결하세요.');
      try { await send(action); }
      catch { if (!disposed) onError('보정 선택을 보내지 못했어요. 다시 연결하세요.'); }
      return true;
    },
    dispose() { disposed = true; timers.clearTimeout(timeout); },
  };
}

/** Explicit simulation of firmware v2, never evidence of physical calibration. */
export function createMockPreparation({ emit, startStreaming, stopStreaming, timers = globalThis }) {
  let phase = 'idle', timer = null;
  const report = state => emit('@mag,2,' + state);
  return {
    command(command) {
      if (command === 'prepare') { timers.clearTimeout(timer); stopStreaming(); phase = 'choice'; report('choice'); }
      else if (command === 'calibrate' && phase === 'choice') {
        phase = 'calibrating'; report('calibrating');
        timer = timers.setTimeout(() => { phase = 'streaming'; report('calibrated'); startStreaming(); }, 1800);
      } else if (command === 'skip' && phase === 'choice') { phase = 'streaming'; report('skipped'); startStreaming(); }
      else if (command === 'stop') { timers.clearTimeout(timer); phase = 'idle'; stopStreaming(); }
    },
    dispose() { timers.clearTimeout(timer); stopStreaming(); phase = 'idle'; },
  };
}
