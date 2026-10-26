// Independent device state model shared by isolated Node/browser tests.
export function secureDfuFixture(crc32, options = {}) {
  const device = new EventTarget(), control = new EventTarget();
  const state = { commands: [], objects: [], data: { 1: [], 2: [] }, type: 1, packets: 0, connects: 0 };
  device.name = 'DfuTarg'; device.id = 'test-dfu-device';
  const words = (...values) => { const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer); values.forEach((v, i) => view.setUint32(i * 4, v, true)); return bytes; };
  function notify(opcode, payload = [], result = 1) {
    if (options.silent === opcode) return;
    const bytes = Uint8Array.of(77, 0x60, opcode, result, ...payload, 88);
    control.value = new DataView(bytes.buffer, 1, bytes.length - 2);
    control.dispatchEvent(new Event('characteristicvaluechanged'));
  }
  Object.assign(control, { properties: { write: true, notify: true }, async startNotifications() {},
    async writeValueWithResponse(bytes) {
      state.commands.push([...bytes]);
      const op = bytes[0], view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (op === 6) { state.type = bytes[1]; notify(op, words(options.maxSize ?? 4096, state.data[state.type].length, crc32(Uint8Array.from(state.data[state.type])))); }
      else if (op === 1) {
        state.type = bytes[1];
        if (state.type === 1) state.data = { 1: [], 2: [] };
        state.remaining = view.getUint32(2, true);
        state.objects.push({ type: state.type, size: state.remaining }); notify(op);
      } else if (op === 3) {
        const data = Uint8Array.from(state.data[state.type]);
        notify(op, words(data.length + (options.badOffset ? 1 : 0), (crc32(data) ^ (options.badCrc ? 1 : 0)) >>> 0));
      } else if (op === 4) {
        if (state.remaining !== 0) throw new Error('Incomplete object execution');
        if (state.type === 2 && options.disconnectFinal && state.data[2].length === options.bytes) { device.gatt.disconnect(); return; }
        notify(op, [], options.rejectExecute ? 5 : 1);
        if (state.type === 2 && state.data[2].length === options.bytes) options.complete?.();
      } else if (op === 2) notify(op);
      else throw new Error('Unexpected opcode');
    } });
  const packet = { properties: { writeWithoutResponse: true }, async writeValueWithoutResponse(bytes) {
    if (bytes.length > 20 || bytes.length > state.remaining) throw new Error('Oversized packet');
    state.packets++; state.remaining -= bytes.length; state.data[state.type].push(...bytes);
    if (options.disconnectPacket === state.packets) device.gatt.disconnect();
  } };
  const server = { async getPrimaryService(uuid) {
    if (uuid !== 0xfe59) throw new Error('Wrong service');
    return { async getCharacteristic(id) {
      if (id.startsWith('8ec90001')) return control;
      if (id.startsWith('8ec90002')) return packet;
      throw new Error('Unexpected characteristic');
    } };
  } };
  device.gatt = { connected: false, async connect() { state.connects++; this.connected = true; return server; },
    disconnect() { if (!this.connected) return; this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); } };
  return { device, state, control, packet, server, notify };
}
