// Shared Node/browser fake. No native Bluetooth calls or persistent browser state.
export function bluetoothFixture(options = {}) {
  const ids = { partial: 'e97dd91d-251d-470a-a062-fa1922dfa9a8', info: '0000180a-0000-1000-8000-00805f9b34fb',
    dfu: '0000fe59-0000-1000-8000-00805f9b34fb', uart: '6e400001-b5a3-f393-e0a9-e50e24dcca9e' };
  const writes = [], requests = [], state = { mode: options.mode ?? 1, connects: 0, disconnects: 0,
    controlSubscribed: false, uartSubscribed: false,
    programHash: options.programHash ?? options.runtimeHash ?? '11f3cd7e54807276', packets: 0, batches: [], expectedSequence: 0 };
  let batch = [], lastNack = false;
  const device = new EventTarget(), control = new EventTarget(), rx = new EventTarget(), dfuButton = new EventTarget();
  Object.assign(dfuButton, { uuid: '8ec90004-f315-4f60-9fb8-838830daea50', properties: { write: true, indicate: true },
    async startNotifications() { if (options.dfuDenied) throw new DOMException('Insufficient authentication', 'SecurityError'); },
    async writeValueWithResponse(bytes) {
      writes.push(['dfu-entry', ...bytes]);
      dfuButton.value = new DataView(Uint8Array.of(0x20, 1, options.dfuRejected ? 4 : 1).buffer);
      dfuButton.dispatchEvent(new Event('characteristicvaluechanged'));
    } });
  const missing = () => { throw new DOMException('Not present', 'NotFoundError'); };
  device.name = 'BBC micro:bit [trial]'; device.id = 'test-device-only';
  function notify(bytes) {
    // Non-zero offset protects DataView parsing from accidental whole-buffer reads.
    const length = options.fixedFrame && !options.badStatus ? 20 : bytes.length;
    const padded = new Uint8Array(length + 6); padded.set(bytes, 3);
    control.value = new DataView(padded.buffer, 3, length);
    control.dispatchEvent(new Event('characteristicvaluechanged'));
  }
  Object.assign(control, { properties: { notify: true, writeWithoutResponse: true },
    async startNotifications() { state.controlSubscribed = true; }, async stopNotifications() { state.controlSubscribed = false; },
    async writeValueWithoutResponse(packet) {
      writes.push([...packet]);
      if (options.silent) return;
      if (packet[0] === 0xee) notify(options.badStatus ? [0xee, 1] : [0xee, options.protocol ?? 1, state.mode]);
      else if (packet[0] === 0) {
        state.expectedSequence = 0; batch = [];
        const bytes = new Uint8Array(18), view = new DataView(bytes.buffer);
        bytes.set([0, packet[1]]); view.setUint32(2, packet[1] === 1 ? 0x1c000 : options.programStart ?? 0x49000);
        view.setUint32(6, packet[1] === 1 ? 0x49000 : options.programEnd ?? 0x73000);
        bytes.set((packet[1] === 1 ? options.runtimeHash ?? '11f3cd7e54807276' : state.programHash).match(/../g).map(v => parseInt(v, 16)), 10);
        notify(bytes);
      } else if (packet[0] === 0xff) {
        state.mode = packet[1];
        if (options.disconnectOnReset) device.gatt.disconnect();
      } else if (options.flash && packet[0] === 1) {
        if (packet.length !== 20 || packet[3] !== (state.expectedSequence++ & 255)) throw new Error('Invalid packet framing/sequence');
        state.packets++; batch.push([...packet]);
        if (options.disconnectAtPacket === state.packets) { device.gatt.disconnect(); return; }
        if (batch.length === 1 && options.earlyNack && !lastNack) { notify([1, 0xaa]); lastNack = true; }
        if (batch.length === 4) {
          const current = batch; batch = [];
          if (options.earlyNack && state.packets === 4) return;
          if (options.nackAlways || (options.nackOnce && !lastNack)) { lastNack = true; notify([1, 0xaa]); return; }
          const address = ((current[1][1] << 24) | (current[1][2] << 16) | (current[0][1] << 8) | current[0][2]) >>> 0;
          const payload = current.flatMap(p => p.slice(4));
          state.batches.push({ address, payload });
          if (address === 0x49000) state.programHash = payload.slice(24, 32).map(b => b.toString(16).padStart(2, '0')).join('');
          if (!options.silentAck) notify(options.badAck ? [1, 0x55] : [1, 0xff]);
        }
      } else if (options.flash && packet[0] === 2) {
        state.mode = 1;
        if (options.finishProgramHash) state.programHash = options.finishProgramHash;
        if (options.disconnectOnFinish) device.gatt.disconnect();
      } else throw new Error('Firmware write is forbidden in the diagnostic fixture');
    },
  });
  rx.uuid = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; rx.properties = { notify: true };
  rx.startNotifications = async () => { state.uartSubscribed = true; };
  rx.stopNotifications = async () => { state.uartSubscribed = false; }; rx.getDescriptors = async () => [];
  const tx = { uuid: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', properties: { write: true }, getDescriptors: async () => [],
    async writeValueWithResponse(value) {
      const command = new TextDecoder().decode(value); writes.push(command);
      if (!options.autoSamples) return;
      const emit = text => { rx.value = new DataView(new TextEncoder().encode(text).buffer); rx.dispatchEvent(new Event('characteristicvaluechanged')); };
      if (command === 'prepare\n') emit('@mag,2,choice\n');
      else if (['start\n', 'bme\n', 'skip\n'].includes(command)) {
        if (command === 'skip\n') emit('@mag,2,skipped\n');
        const line = options.autoSamples[state.programHash];
        if (line != null) emit(`${line}\n${line}\n${line}\n`);
      }
    } };
  const server = { async getPrimaryService(uuid) {
    if (options.denied === uuid) throw new DOMException('Not permitted', 'SecurityError');
    if (options.missing === uuid) return missing();
    if (uuid === ids.partial) return { getCharacteristic: async () => control };
    if (uuid === ids.dfu) return { getCharacteristics: async () => options.fullDfu ? [dfuButton] : [] };
    if (uuid === ids.uart) return { getCharacteristics: async () => [rx, tx] };
    if (uuid === ids.info) return { getCharacteristic: async id => ({ readValue: async () => new DataView(new TextEncoder().encode(
      { [0x2a24]: options.model ?? 'BBC micro:bit V2', [0x2a25]: 'test-serial', [0x2a26]: 'test-runtime' }[id]).buffer) }) };
    return missing();
  } };
  device.gatt = Object.assign(server, { connected: false, async connect() { state.connects++; this.connected = true; return this; },
    disconnect() { if (!this.connected) return; this.connected = false; state.disconnects++;
      state.controlSubscribed = state.uartSubscribed = false; device.dispatchEvent(new Event('gattserverdisconnected')); } });
  const bluetooth = { requestDevice(args) { requests.push(args); return options.cancel
    ? Promise.reject(new DOMException('Cancelled', 'NotFoundError')) : Promise.resolve(device); } };
  return { bluetooth, device, control, server, requests, writes, state, notify,
    line(text) { rx.value = new DataView(new TextEncoder().encode(text).buffer); rx.dispatchEvent(new Event('characteristicvaluechanged')); } };
}
