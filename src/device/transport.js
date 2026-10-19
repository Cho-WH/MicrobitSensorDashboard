// Adapted from Cho-WH/bme280@59c5c149 gay-lussac/measurement/transport.js.
// Attempts, retries and serialized teardown retained; definitions supply all sensor differences.
import { createBleClient } from './ble-client.js';
import { getSensorRuntime } from '../catalog/index.js';
import { createReceptionMonitor } from '../measurement/reception-monitor.js';

const errorMessage = error => ({
  NotFoundError: '장치 선택을 취소했거나 장치를 찾지 못했어요. 전원을 확인하고 다시 연결해 주세요.',
  NotAllowedError: 'Bluetooth 연결 권한을 허용한 뒤 다시 시도해 주세요.',
  SecurityError: '이 화면에서는 장치를 연결할 수 없어요. HTTPS 주소 또는 로컬 실험 화면에서 다시 시도해 주세요.',
  NetworkError: '연결이 끊겼어요. 전원과 거리를 확인하고 다른 탭의 연결을 해제해 주세요.',
  AbortError: '장치 연결을 취소했습니다.',
}[error?.name] ?? '장치에 연결하지 못했어요. 전원과 실험 프로그램을 확인해 주세요.');

/** @param {{ble?:any,clock?:{utc:()=>number,mono:()=>number},timers?:any}} options */
export function createTransport({ ble = createBleClient(), clock = { utc: () => Date.now(), mono: () => performance.now() }, timers = globalThis } = {}) {
  let attemptId = 0, pending = null, closing = null, previousDevice = null;
  let deadline = null, retry = null, freshness = null, monitor = null;
  let state = { status: 'disconnected', busy: false, deviceName: '', message: '', attemptId: 0,
    firstReading: false, confirmed: false, readingsCompatible: false, calibration: 'unknown', lastReceivedAt: null };
  const snapshot = () => ({ ...state, canReconnect: Boolean(previousDevice),
    confirmed: state.status === 'connected' && Boolean(monitor?.getSnapshot(clock.mono()).reception.ready) });
  let onState = (_state) => {};
  const emit = patch => { state = { ...state, ...patch, attemptId }; onState(snapshot()); };
  const clearStartup = () => { timers.clearTimeout(deadline); timers.clearTimeout(retry); deadline = retry = null; };
  const clearTimers = () => { clearStartup(); timers.clearTimeout(freshness); freshness = null; };
  const current = id => id === attemptId;

  function connect(context, onInput, stateHandler = (_state) => {}, { reuseDevice = false } = {}) {
    if (pending || closing || state.status !== 'disconnected') return pending ?? closing ?? Promise.resolve();
    const { definition, decode } = getSensorRuntime(context), policy = definition.connectionPolicy;
    onState = stateHandler;
    if (reuseDevice && !previousDevice) {
      emit({ message: '이전에 연결한 장치 정보가 없어요. 장치 연결을 눌러 선택해 주세요.' });
      return Promise.resolve();
    }
    const id = ++attemptId;
    monitor = createReceptionMonitor(policy);
    let hasReading = false;
    clearTimers();
    emit({ status: 'connecting', busy: true, message: '', deviceName: '', firstReading: false,
      confirmed: false, readingsCompatible: false, calibration: 'unknown', lastReceivedAt: null });
    ble.setDisconnectedListener(() => {
      if (current(id)) void disconnect('장치 연결이 끊겼어요. 전원과 거리를 확인해 주세요.');
    });
    // Initiate the chooser synchronously in this call, before any await or deferred job.
    let deviceRequest;
    try { deviceRequest = reuseDevice ? Promise.resolve(previousDevice) : ble.requestDevice(); }
    catch (error) { deviceRequest = Promise.reject(error); }
    pending = (async () => {
      try {
        const device = await deviceRequest;
        if (!current(id)) return;
        await ble.connect(device);
        if (!current(id)) return;
        await ble.startNotifications(frame => {
          if (!current(id)) return;
          const at = { attemptId: id, receivedAt: clock.utc(), monotonicAt: clock.mono() };
          const input = typeof frame === 'string' ? decode(frame, at)
            : { type: 'parse-error', reasonCode: frame.reasonCode ?? 'invalid-frame', ...at };
          const valid = input.type === 'reading' && 'validity' in input && policy.requiredChannelIds.every(channelId => input.validity[channelId] === 'valid');
          if (valid && !hasReading) { hasReading = true; clearStartup(); }
          monitor.accept(input);
          const observation = monitor.getSnapshot(at.monotonicAt).reception;
          emit({ firstReading: hasReading, readingsCompatible: hasReading, confirmed: observation.ready,
            lastReceivedAt: valid ? at.receivedAt : state.lastReceivedAt,
            message: observation.ready ? '' : hasReading ? '새 수신값을 확인했습니다. 연속 수신을 확인하고 있어요.' : policy.waitingMessage });
          timers.clearTimeout(freshness);
          if (valid) freshness = timers.setTimeout(() => {
            if (!current(id)) return;
            const latest = monitor.getSnapshot(clock.mono()).reception;
            emit({ confirmed: latest.ready, message: latest.ready ? '' : '새 수신값이 멈췄어요. 전원·거리·연결을 확인하세요.' });
          }, policy.staleMs);
          onInput(input);
        });
        if (!current(id)) return;
        previousDevice = device;
        emit({ status: 'connected', busy: false, deviceName: device.name || 'micro:bit', message: hasReading ? state.message : policy.waitingMessage });
        if (hasReading) return;
        deadline = timers.setTimeout(() => {
          if (current(id) && !hasReading) return disconnect(policy.timeoutMessage);
        }, policy.firstReadingTimeoutMs);
        let sends = 0;
        async function send() {
          if (!current(id) || hasReading || sends >= policy.retryLimit) return;
          sends++;
          try { await ble.sendStartCommand(definition.firmware.startCommand); }
          catch { /* Deadline reports lack of valid reception; retry still uses the same trusted command. */ }
          if (current(id) && !hasReading && sends < policy.retryLimit) retry = timers.setTimeout(send, policy.retryIntervalMs);
        }
        void send();
      } catch (error) {
        if (current(id)) {
          ++attemptId;
          emit({ status: 'disconnected', firstReading: false, confirmed: false, readingsCompatible: false,
            message: reuseDevice ? '이전 장치에 다시 연결하지 못했어요. 전원을 확인하고 장치 연결을 눌러 선택해 주세요.' : errorMessage(error) });
        }
      } finally {
        if (!current(id)) {
          clearTimers(); ble.setDisconnectedListener(null);
          try { await ble.disconnect(); } catch { /* Preserve the original connection message. */ }
        }
        pending = null; emit({ busy: !!closing });
      }
    })();
    return pending;
  }
  function disconnect(message = '') {
    if (closing) return closing;
    ++attemptId; clearTimers(); monitor?.disconnected(); ble.setDisconnectedListener(null);
    emit({ status: 'disconnected', busy: true, firstReading: false, confirmed: false, readingsCompatible: false, message });
    closing = (async () => {
      try { await pending; await ble.disconnect(); }
      catch (error) { emit({ message: message || errorMessage(error) }); }
      finally { closing = null; emit({ status: 'disconnected', busy: false }); }
    })();
    return closing;
  }
  return { connect, disconnect, forgetDevice: () => { previousDevice = null; },
    isSupported: () => ble.isSupported(), getState: snapshot };
}
