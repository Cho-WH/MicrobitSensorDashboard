// A simulated BLE boundary. Decoding, timing and readiness use the real Transport.
import { getSensorRuntime } from '../catalog/index.js';
import { getFirmwareArtifact } from './firmware.js';

/** @param {()=>ReturnType<import('../catalog/index.js').getExperiment>} getContext
 * @param {{timers?:Pick<typeof globalThis,'setInterval'|'clearInterval'>,now?:()=>number}} options */
export function createMockBleClient(getContext, { timers = globalThis, now = () => performance.now() } = {}) {
  let notify = null, timer = null;
  const device = { name: '모의 micro:bit' };
  return {
    isSupported: () => true,
    requestDevice: () => Promise.resolve(device),
    async connect() {},
    async startNotifications(handler) { notify = handler; },
    setDisconnectedListener() {},
    async sendStartCommand() {
      if (timer !== null) return;
      const runtime = getSensorRuntime(getContext());
      const firmware = getFirmwareArtifact(runtime.definition.firmware.id, runtime.definition.firmware.version);
      timer = timers.setInterval(() => notify?.(runtime.mockLine(now())), firmware.sampleIntervalMs);
    },
    async disconnect() { timers.clearInterval(timer); timer = null; notify = null; },
  };
}
