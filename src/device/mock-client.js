// A simulated BLE boundary. Decoding, timing and readiness use the real Transport.
import { getSensorRuntime } from '../catalog/index.js';
import { getFirmwareArtifact } from './firmware.js';

/** @param {()=>ReturnType<import('../catalog/index.js').getExperiment>} getContext
 * @param {{timers?:any,now?:()=>number}} options */
export function createMockBleClient(getContext, { timers = globalThis, now = () => performance.now() } = {}) {
  let notify = null, timer = null, preparation = null;
  function stopStreaming() { timers.clearInterval(timer); timer = null; }
  function startStreaming() {
    if (timer !== null) return;
    const runtime = getSensorRuntime(getContext()), firmware = getFirmwareArtifact(runtime.definition.firmware.id, runtime.definition.firmware.version);
    timer = timers.setInterval(() => notify?.(runtime.mockLine(now())), firmware.sampleIntervalMs);
  }
  const device = { name: '모의 micro:bit' };
  return {
    isSupported: () => true,
    requestDevice: () => Promise.resolve(device),
    async connect() {
      preparation?.dispose();
      preparation = getSensorRuntime(getContext()).preparation?.createMock({emit:line=>notify?.(line),startStreaming,stopStreaming,timers}) ?? null;
    },
    async startNotifications(handler) { notify = handler; },
    setDisconnectedListener() {},
    async sendStartCommand(command) {
      if (preparation) preparation.command(command); else startStreaming();
    },
    async disconnect() { preparation?.dispose(); preparation = null; stopStreaming(); notify = null; },
  };
}
