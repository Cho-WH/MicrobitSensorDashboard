// Bounded development adapter for Nordic Secure DFU. Protocol references and
// comparison with web-bluetooth-dfu 1.2.1 are recorded in README.md.
import { fullPrograms } from './firmware/full-programs.js';
import { verifyFullImage } from './full-image.js';
export const dfuIds = Object.freeze({ service: 0xfe59,
  control: '8ec90001-f315-4f60-9fb8-838830daea50', packet: '8ec90002-f315-4f60-9fb8-838830daea50',
  button: '8ec90003-f315-4f60-9fb8-838830daea50', bondedButton: '8ec90004-f315-4f60-9fb8-838830daea50' });
export function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
const u32 = n => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, n, true); return a; };
export function parseDfuResponse(bytes, opcode, prefix = 0x60) {
  if (bytes.length < 3 || bytes[0] !== prefix || bytes[1] !== opcode) throw new Error('DFU 응답 형식이 올바르지 않습니다.');
  if (bytes[2] !== 1) throw new Error(`DFU 명령 ${opcode.toString(16)} 거부: ${bytes[2].toString(16)}${bytes.length > 3 ? ` / ${bytes[3].toString(16)}` : ''}`);
  return new DataView(bytes.buffer, bytes.byteOffset + 3, bytes.length - 3);
}
function checksum(response, data, offset) {
  if (response.byteLength !== 8 || response.getUint32(0, true) !== offset || response.getUint32(4, true) !== crc32(data.subarray(0, offset)))
    throw new Error(`DFU 오프셋 또는 CRC 불일치: 예상 ${offset} B, 수신 ${response.byteLength === 8 ? response.getUint32(0, true) : '알 수 없음'} B. 전송을 중단합니다.`);
}
/** Full replacement from byte zero. Never silently resume an earlier download. */
export async function transferFullImage(image, { command, packet, progress = () => {}, finalizing = () => {}, checkpointPackets = 0 }) {
  await command(Uint8Array.of(2, 0, 0)); // Explicit CRC checks per object, no unsolicited PRN responses.
  for (const [type, data] of [[1, image.init], [2, image.data]]) {
    const selected = await command(Uint8Array.of(6, type));
    if (selected.byteLength !== 12) throw new Error('DFU 객체 정보 길이 오류');
    const max = selected.getUint32(0, true);
    if (!max || max > 65536 || max % 4 || (type === 1 && max < data.length)) throw new Error('DFU 객체 크기 오류');
    // Creating a NEW init object discards a previous transfer. If the bootloader
    // retains data afterwards, refuse to claim a fresh full replacement.
    if (type === 2 && (selected.getUint32(4, true) !== 0 || selected.getUint32(8, true) !== 0))
      throw new Error('이전 DFU 데이터가 남았습니다. 이번 전체 교체 시험은 USB 복구 후 다시 시작하세요.');
    for (let offset = 0; offset < data.length;) {
      const end = Math.min(offset + max, data.length);
      await command(Uint8Array.of(1, type, ...u32(end - offset)));
      for (let p = offset, packets = 0; p < end; p += 20) {
        await packet(data.slice(p, Math.min(p + 20, end)));
        // Windows writeWithoutResponse can resolve while bytes are still queued.
        // Experiment C bounds each burst with a real receiver offset/CRC response.
        if (checkpointPackets > 0 && ++packets % checkpointPackets === 0 && p + 20 < end)
          checksum(await command(Uint8Array.of(3)), data, p + 20);
      }
      checksum(await command(Uint8Array.of(3)), data, end);
      if (type === 2 && end === data.length) finalizing();
      const executed = await command(Uint8Array.of(4));
      if (executed.byteLength !== 0) throw new Error('DFU 실행 응답 길이 오류');
      offset = end;
      if (type === 2) progress({ sent: offset, total: data.length });
    }
  }
  return { sent: image.data.length, verified: false }; // Application reconnect remains required.
}

export function createSecureDfu({ timeoutMs = 10000, onEvent = () => {}, programs = fullPrograms } = {}) {
  let active = null;
  const fail = message => new Error(message);
  function close(ctx) {
    if (!ctx || ctx.closed) return;
    ctx.closed = true; if (active === ctx) active = null;
    ctx.device.removeEventListener('gattserverdisconnected', ctx.disconnected);
    ctx.control?.removeEventListener('characteristicvaluechanged', ctx.notified);
    for (const reject of [...ctx.waiters]) reject(fail('DFU 연결이 종료됐습니다. 재연결 확인 또는 USB 복구가 필요합니다.'));
    if (ctx.device.gatt.connected) ctx.device.gatt.disconnect();
  }
  const current = ctx => { if (active !== ctx || ctx.closed) throw fail('DFU 작업이 취소됐습니다.'); };
  function wait(ctx, start, stage) {
    current(ctx);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error, value) => {
        if (done) return; done = true; clearTimeout(timer); ctx.waiters.delete(cancel);
        error ? reject(error) : resolve(value);
      };
      const cancel = error => finish(error);
      const timer = setTimeout(() => { finish(fail(`${stage}: 응답 시간 초과`)); close(ctx); }, timeoutMs);
      ctx.waiters.add(cancel);
      Promise.resolve().then(() => { current(ctx); return start(); }).then(value => {
        try { current(ctx); finish(null, value); } catch (error) { finish(error); }
      }, error => finish(error));
    });
  }
  async function flash(device, image, options = {}) {
    if (active) throw fail('이전 DFU 작업이 진행 중입니다.');
    const ctx = { device, closed: false, waiters: new Set(), pending: null };
    active = ctx; ctx.disconnected = () => close(ctx);
    device.addEventListener('gattserverdisconnected', ctx.disconnected);
    try {
      image = await wait(ctx, () => verifyFullImage(programs.find(p => p.id === image.target?.id), image.data, image.init), '전체 파일 검증');
      const server = await wait(ctx, () => {
        const connecting = device.gatt.connect();
        connecting.then(() => { if (ctx.closed && active?.device !== device) device.gatt.disconnect(); }, () => {});
        return connecting;
      }, 'DFU 연결');
      const service = await wait(ctx, () => server.getPrimaryService(dfuIds.service), 'DFU 서비스');
      ctx.control = await wait(ctx, () => service.getCharacteristic(dfuIds.control), 'DFU 제어 특성');
      const dataCharacteristic = await wait(ctx, () => service.getCharacteristic(dfuIds.packet), 'DFU 데이터 특성');
      if (!ctx.control.properties.write || !dataCharacteristic.properties.writeWithoutResponse) throw fail('DFU 특성 쓰기 방식이 지원되지 않습니다.');
      ctx.notified = event => {
        if (ctx.closed || event.target !== ctx.control || !ctx.pending) return;
        const v = event.target.value, bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();
        onEvent({ kind: 'dfu-response', bytes: Array.from(bytes) });
        try { ctx.pending.resolve(parseDfuResponse(bytes, ctx.pending.opcode)); }
        catch (error) { ctx.pending.reject(error); }
      };
      ctx.control.addEventListener('characteristicvaluechanged', ctx.notified);
      await wait(ctx, () => ctx.control.startNotifications(), 'DFU 응답 구독');
      const command = async bytes => {
        current(ctx);
        const reply = new Promise((resolve, reject) => { ctx.pending = { opcode: bytes[0], resolve, reject }; });
        onEvent({ kind: 'dfu-command', bytes: Array.from(bytes) });
        try { const [, result] = await wait(ctx, () => Promise.all([ctx.control.writeValueWithResponse(bytes), reply]), 'DFU 명령'); return result; }
        finally { ctx.pending = null; }
      };
      return await transferFullImage(image, { command,
        checkpointPackets: options.checkpointPackets ?? 0,
        packet: bytes => wait(ctx, () => dataCharacteristic.writeValueWithoutResponse(bytes), 'DFU 데이터'),
        progress: state => { onEvent({ kind: 'dfu-progress', ...state }); options.progress?.(state); },
        finalizing: () => { onEvent({ kind: 'dfu-finalizing', id: image.target.id }); options.finalizing?.(); } });
    } finally { close(ctx); }
  }
  return { flash, disconnect: () => close(active) };
}
