// Development-only implementation of the CODAL V2 diagnostic protocol.
// Protocol sources and pinned revisions: ./README.md. Firmware writes accept pinned trials only.
import { getBluetoothSupport } from '../../src/device/browser-support.js';
import { verifyTrialProgram, partialFlashProblem, parseWriteAck, transferProgram } from './partial-flash.js';
import { dfuIds, parseDfuResponse } from './secure-dfu.js';
import { trialPrograms } from './firmware/programs.js';

export const services = Object.freeze({
  partial: 'e97dd91d-251d-470a-a062-fa1922dfa9a8',
  dfu: '0000fe59-0000-1000-8000-00805f9b34fb',
  uart: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  info: '0000180a-0000-1000-8000-00805f9b34fb',
});
const controlId = 'e97d3b10-251d-470a-a062-fa1922dfa9a8';
const infoIds = { model: 0x2a24, serial: 0x2a25, firmware: 0x2a26 };
// Fingerprint measured in the current four built-in HEX files, whose pairing_mode is 0.
const currentRuntime = '11f3cd7e54807276';
export const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const failure = (code, message) => Object.assign(new Error(message), { code });

export function parseStatus(bytes) {
  // CODAL declares a fixed 20-byte characteristic; unused trailing bytes are not payload.
  if (![3, 20].includes(bytes.length) || bytes[0] !== 0xee) throw failure('invalid-response', '모드 응답 형식이 올바르지 않습니다.');
  return { protocol: bytes[1], mode: bytes[2] };
}
export function parseRegion(bytes, expected) {
  if (![18, 20].includes(bytes.length) || bytes[0] !== 0 || bytes[1] !== expected)
    throw failure('invalid-response', '메모리 영역 응답 형식이 올바르지 않습니다.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = view.getUint32(2), end = view.getUint32(6), hash = hex(bytes.subarray(10, 18));
  return { id: expected, start, end, hash, valid: start < end && end <= 0x80000 && !/^0+$/.test(hash) };
}

export function modeRequestProblem(report, mode, confirmed) {
  if (!report || !/\bV2\b/i.test(report.info?.model ?? '')) return '장치 정보에서 micro:bit V2를 먼저 확인하세요.';
  if (report.status?.protocol !== 1) return '지원하는 부분 전송 서비스 버전이 확인되지 않았습니다.';
  if (mode !== 0 && mode !== 1) return '알 수 없는 전환 모드입니다.';
  if (![0, 1].includes(report.status.mode)) return '현재 모드를 확인할 수 없습니다.';
  if (report.status.mode === mode) return '이미 요청한 모드입니다.';
  if (mode === 0) {
    if (report.regions?.[1]?.hash === currentRuntime) return '현재 배포 런타임은 pairing_mode: 0입니다. 버튼 진입 비교 후 USB 시험본을 먼저 준비하세요.';
    if (!report.regions?.[1]?.valid || !report.regions?.[2]?.valid) return '런타임·프로그램 영역이 확인되지 않았습니다.';
    if (!confirmed) return 'pairing_mode: 1인 시험본을 이 보드에 USB로 설치했는지 확인하세요.';
  }
  return '';
}

export function fullDfuProblem(report) {
  if (!/\bV2\b/i.test(report?.info?.model ?? '') || report?.status?.protocol !== 1 || report.status.mode !== 0)
    return 'V2 시험본을 설치 대기 모드로 연결하고 진단하세요.';
  if (report.services?.dfu?.state !== 'available') return 'Secure DFU 서비스가 확인되지 않았습니다.';
  if (!trialPrograms.some(p => ['temperature', 'light-level'].includes(p.id) && p.runtimeHash === report.regions?.[1]?.hash && p.programHash === report.regions?.[2]?.hash))
    return '이번 전체 교체 시험은 확인된 온도/밝기 시험본 B에서 시작합니다.';
  return '';
}

/** Single GATT owner for diagnostics, mode requests and validated trial transfers. */
export function createDiagnostics({ bluetooth = globalThis.navigator?.bluetooth,
  support = () => getBluetoothSupport({ bluetooth }), onEvent = () => {}, onDisconnect = () => {},
  isDeviceInUse = () => false, timeoutMs = 6000 } = {}) {
  let active = null;
  const event = (kind, data = {}) => onEvent({ kind, ...data });
  function assertCurrent(ctx) {
    if (active !== ctx || ctx.closed) throw failure('cancelled', '연결 작업이 취소되었습니다.');
  }
  function close(ctx, reason = 'manual', keepConnection = false) {
    if (!ctx || ctx.closed) return;
    event('trace-diagnostic-cleanup', { reason, ownerConnectionId: ctx.traceConnectionId,
      keepConnection, wasActive: active === ctx, removingDisconnectListener: true });
    ctx.closed = true;
    if (active === ctx) active = null;
    ctx.device.removeEventListener('gattserverdisconnected', ctx.disconnected);
    ctx.control?.removeEventListener('characteristicvaluechanged', ctx.notified);
    for (const cancel of [...ctx.waiters]) cancel(failure('disconnected', '장치 연결이 끝났습니다.'));
    ctx.pending = null;
    if (keepConnection) event('diagnostic-released', { connected: ctx.device.gatt?.connected === true });
    else {
      if (ctx.device.gatt?.connected) ctx.device.gatt.disconnect();
      event('disconnected', { reason }); onDisconnect(reason);
    }
  }
  function wait(ctx, promise, stage) {
    try { assertCurrent(ctx); }
    catch (error) {
      // The operation may already have synchronously disconnected the GATT.
      Promise.resolve(promise).catch(() => {});
      return Promise.reject(error);
    }
    event('stage', { stage });
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true; clearTimeout(timer); ctx.waiters.delete(cancel);
        if (error) reject(error); else resolve(value);
      };
      const cancel = error => finish(error);
      const timer = setTimeout(() => {
        event('trace-timeout', { stage, ownerConnectionId: ctx.traceConnectionId, timeoutMs });
        finish(failure('timeout', `${stage}: 응답 시간이 초과됐습니다. 다시 연결하세요.`));
        // No request IDs exist in PFS: a timed-out session must not consume late replies.
        close(ctx, 'timeout');
      }, timeoutMs);
      ctx.waiters.add(cancel);
      Promise.resolve(promise).then(value => {
        try { assertCurrent(ctx); finish(null, value); } catch (error) { finish(error); }
      }, error => finish(error));
    });
  }
  function requestDevice() {
    if (support() !== 'supported') throw failure('unsupported', 'HTTPS 또는 localhost의 Bluetooth 지원 브라우저에서 여세요.');
    // Keep browser user activation: no asynchronous preparation before this call.
    return bluetooth.requestDevice({
      filters: [{ namePrefix: 'BBC micro:bit' }, { namePrefix: 'micro:bit' }, { namePrefix: 'BBC microbit' }],
      optionalServices: Object.values(services),
    }).catch(error => {
      if (error.name === 'NotFoundError') throw failure('chooser-cancelled', '장치 선택을 취소했습니다.');
      throw error;
    });
  }
  async function connect(device, { reuseConnection = false } = {}) {
    if (reuseConnection && active) throw failure('busy', '이전 진단 연결의 제어권을 먼저 정리하세요.');
    close(active);
    const ctx = { device, server: null, control: null, report: null, pending: null, waiters: new Set(), closed: false, busy: false };
    active = ctx;
    ctx.disconnected = () => {
      event('trace-diagnostic-event', { ownerConnectionId: ctx.traceConnectionId, handled: active === ctx, closed: ctx.closed });
      if (active === ctx) { ctx.resetDisconnected?.(); close(ctx, 'device'); }
    };
    device.addEventListener('gattserverdisconnected', ctx.disconnected);
    try {
      if (!device.gatt) throw failure('no-gatt', '장치가 GATT 연결을 제공하지 않습니다.');
      if (reuseConnection && !device.gatt.connected) throw failure('disconnected', '넘겨받을 GATT 연결이 끊겼습니다.');
      const connecting = reuseConnection ? Promise.resolve(device.gatt) : device.gatt.connect();
      ctx.traceConnectionId = device.gatt.__trialConnectionId;
      // An OS connection can finish after timeout/cancel. Do not leave it orphaned.
      connecting.then(() => {
        if (ctx.closed && active?.device !== device && !isDeviceInUse(device) && device.gatt.connected) {
          event('trace-late-cleanup', { reason: 'diagnostic connect completed after context closed', ownerConnectionId: ctx.traceConnectionId });
          device.gatt.disconnect();
        }
      }, () => {});
      ctx.server = await wait(ctx, connecting, 'GATT 연결');
      event('connected', { name: device.name ?? '', id: device.id ?? '', reused: reuseConnection });
    } catch (error) { close(ctx, 'connection-error'); throw error; }
  }
  async function inspectService(ctx, key) {
    try {
      const service = await wait(ctx, ctx.server.getPrimaryService(services[key]), `${key} 서비스 탐색`);
      ctx.report.services[key] = { state: 'available' };
      return service;
    } catch (error) {
      assertCurrent(ctx);
      ctx.report.services[key] = { state: error.name === 'NotFoundError' ? 'absent'
        : ['SecurityError', 'NotAllowedError'].includes(error.name) ? 'denied' : 'error', error: error.message };
      return null;
    }
  }
  async function write(ctx, packet) {
    assertCurrent(ctx);
    event('control-write', { bytes: hex(packet) });
    if (ctx.control.properties?.writeWithoutResponse !== true) throw failure('not-writable', '응답 없는 쓰기 특성이 없습니다.');
    const send = ctx.control.writeValueWithoutResponse ?? ctx.control.writeValue;
    if (!send) throw failure('not-writable', '이 브라우저에서 제어 명령을 보낼 수 없습니다.');
    const traced = packet[0] === 0xff || packet[0] === 2;
    if (traced) event('trace-command-start', { bytes: hex(packet), ownerConnectionId: ctx.traceConnectionId });
    try {
      await send.call(ctx.control, packet);
      if (traced) event('trace-command-end', { bytes: hex(packet), ownerConnectionId: ctx.traceConnectionId, outcome: 'resolved' });
    } catch (error) {
      if (traced) event('trace-command-end', { bytes: hex(packet), ownerConnectionId: ctx.traceConnectionId, outcome: 'rejected', error: error.message });
      throw error;
    }
  }
  async function query(ctx, packet, parse) {
    return exchange(ctx, packet, () => write(ctx, packet), parse);
  }
  async function exchange(ctx, packet, send, parse) {
    if (ctx.pending) throw failure('busy', '이전 진단 요청이 진행 중입니다.');
    const reply = new Promise((resolve, reject) => { ctx.pending = { packet, parse, resolve, reject }; });
    try {
      const [, result] = await wait(ctx, Promise.all([send(), reply]), `응답 ${hex(packet)}`);
      return result;
    } catch (error) {
      // Also retire a malformed/failed request; retry only on a fresh connection.
      close(ctx, 'query-error'); throw error;
    } finally { ctx.pending = null; }
  }
  async function prepareControl(ctx, service) {
    if (ctx.control) return;
    ctx.control = await wait(ctx, service.getCharacteristic(controlId), '진단 특성 탐색');
    ctx.notified = e => {
      if (active !== ctx || ctx.closed || e.target !== ctx.control || !e.target.value) return;
      const value = e.target.value, bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
      event('control-notify', { bytes: hex(bytes) });
      const pending = ctx.pending;
      if (!pending || bytes[0] !== pending.packet[0]) return;
      if (bytes[0] === 0 && bytes.length > 1 && bytes[1] !== pending.packet[1]) return;
      try { pending.resolve(pending.parse(bytes)); } catch (error) { pending.reject(error); }
    };
    ctx.control.addEventListener('characteristicvaluechanged', ctx.notified);
    await wait(ctx, ctx.control.startNotifications(), '진단 알림 구독');
  }
  async function diagnose() {
    const ctx = active;
    if (!ctx || ctx.busy) throw failure('not-ready', '장치를 연결하고 이전 작업이 끝난 뒤 다시 시도하세요.');
    ctx.busy = true;
    try { return await readReport(ctx); }
    finally { ctx.busy = false; }
  }
  async function readReport(ctx) {
    ctx.report = { at: new Date().toISOString(), services: {}, info: {}, status: null, regions: {}, errors: [] };
    try {
      const info = await inspectService(ctx, 'info');
      if (info) for (const [key, id] of Object.entries(infoIds)) {
        try {
          const characteristic = await wait(ctx, info.getCharacteristic(id), `${key} 특성`);
          const value = await wait(ctx, characteristic.readValue(), `${key} 읽기`);
          ctx.report.info[key] = new TextDecoder().decode(value).replace(/\0+$/, '');
        } catch (error) { assertCurrent(ctx); ctx.report.errors.push(`${key}: ${error.message}`); }
      }
      const partial = await inspectService(ctx, 'partial');
      await inspectService(ctx, 'dfu');
      await inspectService(ctx, 'uart');
      if (partial) {
        await prepareControl(ctx, partial);
        ctx.report.status = await query(ctx, Uint8Array.of(0xee), parseStatus);
        if (ctx.report.status.protocol === 1) for (const id of [1, 2]) {
          ctx.report.regions[id] = await query(ctx, Uint8Array.of(0, id), bytes => parseRegion(bytes, id));
        }
      }
      event('diagnosis', { report: structuredClone(ctx.report) });
      return structuredClone(ctx.report);
    } catch (error) { ctx.report = null; close(ctx, 'diagnosis-error'); throw error; }
  }
  async function flash(id, data, { progress = () => {}, finishing = () => {} } = {}) {
    const ctx = active;
    if (!ctx || ctx.busy) throw failure('not-ready', '장치를 연결하고 이전 작업이 끝난 뒤 다시 시도하세요.');
    ctx.busy = true;
    try {
      const image = await wait(ctx, verifyTrialProgram(id, data), '시험 파일 검증');
      const fresh = await readReport(ctx);
      const problem = partialFlashProblem(fresh, image.target);
      if (problem) throw failure('flash-blocked', problem);
      ctx.report = null;
      event('flash-start', { id, sha256: image.target.sha256, bytes: image.data.length });
      const result = await transferProgram(image, {
        sendBlock: packets => exchange(ctx, Uint8Array.of(1), async () => {
          for (const packet of packets) await write(ctx, packet);
        }, parseWriteAck),
        finish: async () => {
          assertCurrent(ctx);
          event('flash-finish-requested', { id, programHash: image.target.programHash });
          finishing();
          const requested = performance.now();
          await new Promise((resolve, reject) => {
            let done = false;
            const finish = error => {
              if (done) return;
              done = true; clearTimeout(timer); ctx.waiters.delete(cancel); ctx.resetDisconnected = null;
              error ? reject(error) : resolve();
            };
            const cancel = error => finish(error);
            const timer = setTimeout(() => {
              event('trace-timeout', { stage: 'flash-disconnect-event', ownerConnectionId: ctx.traceConnectionId, timeoutMs });
              finish(failure('timeout', '전송 완료 후 실제 연결 해제 이벤트 대기 시간 초과'));
            }, timeoutMs);
            ctx.waiters.add(cancel);
            ctx.resetDisconnected = () => {
              event('flash-device-disconnected', { id, elapsedMs: Math.round(performance.now() - requested) });
              finish();
            };
            void write(ctx, Uint8Array.of(2)).catch(error => finish(error));
          });
        },
        progress: state => { event('flash-progress', state); progress(state); },
      });
      event('flash-sent', result);
      return result; // Never installation success: reconnect and inspect program identity first.
    } catch (error) { close(ctx, 'flash-error'); throw error; }
    finally { ctx.busy = false; close(ctx, 'flash-finished'); }
  }
  async function reset(mode, { candidateConfirmed = false, waitForDisconnect = false } = {}) {
    const ctx = active;
    if (!ctx || ctx.busy || !ctx.control) throw failure('not-ready', '현재 연결에서 진단을 먼저 완료하세요.');
    const problem = modeRequestProblem(ctx.report, mode, candidateConfirmed);
    if (problem) throw failure('mode-blocked', problem);
    ctx.busy = true; ctx.report = null;
    if (waitForDisconnect) {
      // Temporary comparison: only the device event ends the old connection.
      const requested = performance.now();
      try {
        return await new Promise((resolve, reject) => {
          let done = false;
          const finish = (error, value) => {
            if (done) return;
            done = true; clearTimeout(timer); ctx.waiters.delete(cancel); ctx.resetDisconnected = null;
            error ? reject(error) : resolve(value);
          };
          const cancel = error => finish(error);
          const timer = setTimeout(() => {
            event('trace-timeout', { stage: 'mode-disconnect-event', mode, ownerConnectionId: ctx.traceConnectionId, timeoutMs });
            finish(failure('timeout', '실제 연결 해제 이벤트 대기 시간 초과'));
          }, timeoutMs);
          ctx.waiters.add(cancel);
          ctx.resetDisconnected = () => {
            const elapsedMs = Math.round(performance.now() - requested);
            event('reset-device-disconnected', { mode, elapsedMs });
            finish(null, { elapsedMs });
          };
          void write(ctx, Uint8Array.of(0xff, mode)).then(() => {
            if (!done) event('mode-requested', { mode, verified: false, waitingForDeviceDisconnect: true });
          }, error => finish(error));
        });
      } finally {
        // On timeout/error, cleanup happens only after the trial has failed.
        if (!ctx.closed) close(ctx, 'reset-event-wait-ended');
      }
    }
    try {
      await wait(ctx, write(ctx, Uint8Array.of(0xff, mode)), '모드 전환 요청');
      event('mode-requested', { mode, verified: false });
    } finally {
      // Reset is not acknowledged; disconnection is not proof of the requested mode.
      close(ctx, 'mode-request');
    }
  }
  async function enterFullDfu() {
    const ctx = active;
    if (!ctx || ctx.busy) throw failure('not-ready', '현재 장치 진단을 먼저 완료하세요.');
    ctx.busy = true;
    let button, notified;
    try {
      const problem = fullDfuProblem(await readReport(ctx));
      if (problem) throw failure('dfu-blocked', problem);
      const service = await wait(ctx, ctx.server.getPrimaryService(services.dfu), 'DFU 서비스 탐색');
      const characteristics = await wait(ctx, service.getCharacteristics(), 'DFU 특성 확인');
      event('dfu-characteristics', { values: characteristics.map(c => ({ uuid: c.uuid, write: c.properties.write, indicate: c.properties.indicate })) });
      button = characteristics.find(c => c.uuid === dfuIds.bondedButton) ?? characteristics.find(c => c.uuid === dfuIds.button);
      if (!button?.properties.write || !button.properties.indicate) throw failure('dfu-missing', 'DFU 진입 특성이 없습니다. USB로 복구하세요.');
      event('dfu-entry-kind', { bonded: button.uuid === dfuIds.bondedButton });
      let resolveReply, rejectReply;
      const reply = new Promise((resolve, reject) => { resolveReply = resolve; rejectReply = reject; });
      // Attach before enabling indications and writing; no blind retry on refusal.
      notified = e => {
        if (ctx.closed || e.target !== button) return;
        const v = e.target.value, bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();
        event('dfu-entry-response', { bytes: hex(bytes) });
        try { parseDfuResponse(bytes, 1, 0x20); resolveReply(); } catch (error) { rejectReply(error); }
      };
      button.addEventListener('characteristicvaluechanged', notified);
      await wait(ctx, button.startNotifications(), 'DFU 진입 응답 구독');
      await wait(ctx, Promise.all([button.writeValueWithResponse(Uint8Array.of(1)), reply]), 'DFU 진입 요청');
      event('dfu-entry-accepted');
    } catch (error) {
      event('dfu-entry-error', { name: error.name, message: error.message });
      throw new Error(`DFU 진입을 확인하지 못했습니다. ${error.message} 페어링/보안 조건을 확인하고 필요하면 USB로 복구하세요.`);
    } finally {
      button?.removeEventListener('characteristicvaluechanged', notified);
      ctx.busy = false; close(ctx, 'dfu-entry');
    }
  }
  async function releaseConnection() {
    const ctx = active;
    if (!ctx?.device.gatt?.connected || ctx.busy || ctx.pending || ctx.waiters.size)
      throw failure('not-ready', '진단이 끝난 연결에서 제어권을 넘기세요.');
    ctx.busy = true;
    try {
      ctx.control?.removeEventListener('characteristicvaluechanged', ctx.notified);
      if (ctx.control) await wait(ctx, ctx.control.stopNotifications(), '진단 알림 구독 해제');
      assertCurrent(ctx);
      close(ctx, 'handoff', true);
      return ctx.device;
    } catch (error) { close(ctx, 'handoff-error'); throw error; }
  }
  return { requestDevice, connect, diagnose, reset, flash, enterFullDfu, releaseConnection, disconnect: () => close(active),
    get connected() { return !!active?.server && !active.closed; },
    get report() { return active?.report ? structuredClone(active.report) : null; } };
}
