// Adapted from Cho-WH/bme280@59c5c149 js/bluetooth.js and this repository's
// js/bluetooth.js: UART discovery and cleanup retained; framing is byte-bounded and streaming.
import { getBluetoothSupport } from './browser-support.js';
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_002 = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const UART_003 = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const CCCD = '00002902-0000-1000-8000-00805f9b34fb';
const deviceFilters = [{ namePrefix: 'BBC micro:bit' }, { namePrefix: 'micro:bit' }, { namePrefix: 'BBC microbit' }];

/** Streaming UTF-8 lines; oversized/invalid frames are discarded only through their own newline. */
export function createLineFramer({ onLine, onError = (_error) => {}, maxFrameBytes = 1024 }) {
  let decoder, text, bytes, dropping;
  function reset() { decoder = new TextDecoder('utf-8', { fatal: true }); text = ''; bytes = 0; dropping = false; }
  function append(part, complete) {
    if (!dropping) {
      bytes += part.length;
      if (bytes > maxFrameBytes) {
        dropping = true; text = ''; decoder = new TextDecoder('utf-8', { fatal: true });
        onError({ type: 'frame-error', reasonCode: 'frame-too-long' });
      } else {
        try { text += decoder.decode(part, { stream: !complete }); }
        catch { dropping = true; text = ''; onError({ type: 'frame-error', reasonCode: 'invalid-utf8' }); }
      }
    }
    if (complete) {
      const line = dropping ? '' : text.replace(/\r$/, '').trim();
      reset();
      if (line) onLine(line);
    }
  }
  reset();
  return { reset, push(value) {
    const data = value instanceof ArrayBuffer ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    let start = 0;
    for (let index = 0; index < data.length; index++) if (data[index] === 10) {
      append(data.subarray(start, index), true); start = index + 1;
    }
    if (start < data.length) append(data.subarray(start), false);
  } };
}

/** @param {{bluetooth?:any}} options */
export function createBleClient({ bluetooth = /** @type {any} */ (globalThis.navigator)?.bluetooth } = {}) {
  let device = null, service = null, writer = null, notifier = null, epoch = 0;
  let inputHandler = null, disconnectListener = null, notificationListener = null, gattListener = null;
  const encoder = new TextEncoder();
  const framer = createLineFramer({ onLine: line => inputHandler?.(line), onError: error => inputHandler?.(error) });
  const getSupport = () => getBluetoothSupport({ bluetooth });
  const isSupported = () => getSupport() === 'supported';
  const checkAvailable = () => { if (!isSupported()) throw Object.assign(new Error('이 브라우저에서는 Bluetooth 측정을 지원하지 않습니다.'), { code: 'bluetooth-unavailable' }); };
  function clearReferences() {
    notifier?.removeEventListener('characteristicvaluechanged', notificationListener);
    device?.removeEventListener('gattserverdisconnected', gattListener);
    device = service = writer = notifier = inputHandler = notificationListener = gattListener = null;
    framer.reset();
  }
  function requestDevice() {
    checkAvailable();
    // Deliberately no await before the chooser: the caller's click remains the activation boundary.
    return bluetooth.requestDevice({ filters: deviceFilters, optionalServices: [UART_SERVICE] });
  }
  async function connect(selectedDevice) {
    checkAvailable();
    if (device) await disconnect();
    const token = ++epoch;
    device = selectedDevice; framer.reset();
    const current = () => token === epoch && device === selectedDevice;
    const assertCurrent = () => { if (!current()) throw new DOMException('연결 시도가 취소되었습니다.', 'AbortError'); };
    gattListener = event => {
      if (!current() || event?.target !== selectedDevice) return;
      ++epoch; clearReferences(); disconnectListener?.();
    };
    device.addEventListener('gattserverdisconnected', gattListener);
    const server = await device.gatt?.connect(); assertCurrent();
    if (!server) throw new Error('장치의 Bluetooth 서비스에 연결하지 못했습니다.');
    service = await server.getPrimaryService(UART_SERVICE); assertCurrent();
    const characteristics = await service.getCharacteristics(); assertCurrent();
    const classified = await Promise.all(characteristics.map(async characteristic => {
      const properties = characteristic.properties ?? {};
      let descriptors = [];
      try { descriptors = await characteristic.getDescriptors?.() ?? []; } catch { /* Optional metadata. */ }
      return { characteristic, uuid: characteristic.uuid?.toLowerCase(),
        write: !!(properties.write || properties.writeWithoutResponse),
        notify: !!(properties.notify || properties.indicate) || descriptors.some(d => d.uuid?.toLowerCase() === CCCD) };
    }));
    assertCurrent();
    // Properties determine direction. Old devices may expose only UUIDs/CCCD metadata.
    writer = classified.find(c => c.write)?.characteristic ?? null;
    notifier = classified.find(c => c.notify)?.characteristic ?? null;
    if (!writer) writer = classified.find(c => c.uuid === (notifier?.uuid?.toLowerCase() === UART_002 ? UART_003 : UART_002))?.characteristic ?? null;
    if (!notifier) notifier = classified.find(c => c.uuid === (writer?.uuid?.toLowerCase() === UART_003 ? UART_002 : UART_003))?.characteristic ?? null;
    if (!writer || !notifier || writer === notifier) throw new Error('장치의 UART 쓰기·수신 특성을 확인하지 못했습니다.');
  }
  async function startNotifications(handler) {
    if (!notifier) throw new Error('장치의 수신 통로가 준비되지 않았습니다.');
    const target = notifier, token = epoch;
    target.removeEventListener('characteristicvaluechanged', notificationListener);
    framer.reset(); inputHandler = handler;
    notificationListener = event => {
      if (token !== epoch || event.target !== notifier || event.target !== target || !target.value) return;
      framer.push(target.value);
    };
    target.addEventListener('characteristicvaluechanged', notificationListener);
    await target.startNotifications();
  }
  async function sendStartCommand(command) {
    if (!writer) throw new Error('장치의 쓰기 통로가 준비되지 않았습니다.');
    if (typeof command !== 'string' || !command.trim() || command.length > 64 || /[\r\n]/.test(command)) throw new Error('시작 명령은 64자 이내의 한 줄이어야 합니다.');
    const payload = encoder.encode(command + '\n');
    if (writer.properties?.write && writer.writeValueWithResponse) await writer.writeValueWithResponse(payload);
    else if (writer.writeValue) await writer.writeValue(payload);
    else if (writer.writeValueWithoutResponse) await writer.writeValueWithoutResponse(payload);
    else throw new Error('장치에 시작 명령을 보낼 수 없습니다.');
  }
  async function disconnect() {
    const previousDevice = device, previousNotifier = notifier;
    ++epoch; clearReferences();
    try { await previousNotifier?.stopNotifications(); } catch { /* A disconnected device has no active subscription to stop. */ }
    if (previousDevice?.gatt?.connected) previousDevice.gatt.disconnect();
  }
  return { requestDevice, connect, startNotifications, sendStartCommand, disconnect, isSupported, getSupport,
    setDisconnectedListener(listener) { disconnectListener = listener; },
    getContext: () => ({ device, service, txCharacteristic: writer, rxCharacteristic: notifier }),
  };
}
