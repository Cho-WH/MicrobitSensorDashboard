// Adapted from Cho-WH/bme280@59c5c149 and MicrobitSensorDashboard@5d80407
// js/bluetooth.js: UART discovery and cleanup retained; framing is byte-bounded and streaming.
import { getBluetoothSupport } from './browser-support.js';
import { waitForConnection } from './connection-wait.js';
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

/** @param {{bluetooth?:any,getStorage?:()=>any}} options */
export function createBleClient({ bluetooth = /** @type {any} */ (globalThis.navigator)?.bluetooth, getStorage = () => globalThis.sessionStorage } = {}) {
  const deviceKey = 'sensor-lab:last-device';
  async function restoreDevice() {
    try {
      const id = getStorage()?.getItem(deviceKey);
      if (!id || typeof bluetooth?.getDevices !== 'function') return null;
      const devices = await waitForConnection(bluetooth.getDevices(), {timeoutMs:1500});
      return devices.find(device => device.id === id) ?? null;
    } catch { return null; } // Missing permission/API/storage falls back to the chooser.
  }
  function rememberDevice(selected) {
    try { if (selected?.id) getStorage()?.setItem(deviceKey, selected.id); } catch { /* Optional tab preference. */ }
  }
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
  async function connect(selectedDevice, { reuseConnection = false, serviceDiscoveryTimeoutMs = 0, connectionTimeoutMs = 0, signal = undefined } = {}) {
    checkAvailable();
    if (reuseConnection && device) throw new Error('이전 측정 연결의 제어권을 먼저 정리하세요.');
    if (device) await disconnect();
    const token = ++epoch;
    device = selectedDevice; framer.reset();
    const current = () => token === epoch && device === selectedDevice;
    const assertCurrent = () => { if (!current()) throw new DOMException('연결 시도가 취소되었습니다.', 'AbortError'); };
    async function discover(promise, timeoutMs = serviceDiscoveryTimeoutMs) {
      try {
        return await waitForConnection(promise, { signal, timeoutMs });
      } catch (error) {
        if (current() && (error.code === 'timeout' || error.name === 'AbortError')) await disconnect();
        throw error;
      }
    }
    gattListener = event => {
      if (!current() || event?.target !== selectedDevice) return;
      ++epoch; clearReferences(); disconnectListener?.();
    };
    device.addEventListener('gattserverdisconnected', gattListener);
    if (reuseConnection && !device.gatt?.connected) throw new DOMException('넘겨받을 GATT 연결이 끊겼습니다.', 'NetworkError');
    const connecting = reuseConnection ? Promise.resolve(device.gatt) : device.gatt?.connect();
    // A timed-out OS request can still finish. Do not leave an orphan connected,
    // or disconnect the same device after a newer attempt has taken ownership.
    Promise.resolve(connecting).then(() => {
      if (!current() && device !== selectedDevice && selectedDevice.gatt?.connected) selectedDevice.gatt.disconnect();
    }, () => {});
    const server = await discover(connecting, connectionTimeoutMs); assertCurrent();
    if (!server) throw new Error('장치의 Bluetooth 서비스에 연결하지 못했습니다.');
    const discoveredService = await discover(server.getPrimaryService(UART_SERVICE)); assertCurrent();
    service = discoveredService;
    const characteristics = await discover(service.getCharacteristics()); assertCurrent();
    const classified = await Promise.all(characteristics.map(async characteristic => {
      const properties = characteristic.properties ?? {};
      let descriptors = [];
      try { descriptors = await discover(characteristic.getDescriptors?.()) ?? []; }
      catch (error) { if (error.code === 'timeout') throw error; /* Optional metadata. */ }
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
  async function startNotifications(handler, { timeoutMs = 0, signal = undefined } = {}) {
    if (!notifier) throw new Error('장치의 수신 통로가 준비되지 않았습니다.');
    const target = notifier, token = epoch;
    target.removeEventListener('characteristicvaluechanged', notificationListener);
    framer.reset(); inputHandler = handler;
    notificationListener = event => {
      if (token !== epoch || event.target !== notifier || event.target !== target || !target.value) return;
      framer.push(target.value);
    };
    target.addEventListener('characteristicvaluechanged', notificationListener);
    try {
      await waitForConnection(target.startNotifications(), { signal, timeoutMs });
    } catch (error) {
      if (token === epoch) await disconnect();
      throw error;
    }
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
    const previousDevice = device;
    ++epoch; clearReferences();
    // Disconnect ends subscriptions too. Never defer this across another owner's connect.
    if (previousDevice?.gatt?.connected) previousDevice.gatt.disconnect();
  }
  async function releaseConnection() {
    const previousDevice = device, previousNotifier = notifier, token = ++epoch;
    clearReferences();
    // The caller must await subscription cleanup before giving the GATT to its next owner.
    await previousNotifier?.stopNotifications();
    if (token !== epoch || !previousDevice?.gatt?.connected)
      throw new DOMException('측정 연결의 제어권을 넘기기 전에 연결이 끝났습니다.', 'AbortError');
    return previousDevice;
  }
  return { requestDevice, restoreDevice, rememberDevice, connect, startNotifications, sendStartCommand, disconnect, releaseConnection, isSupported, getSupport,
    setDisconnectedListener(listener) { disconnectListener = listener; },
    getContext: () => ({ device, service, txCharacteristic: writer, rxCharacteristic: notifier }),
  };
}
