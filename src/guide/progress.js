// Adapted from G/guide/progress.js Set-based preparation history. Live readiness
// is kept separate and is deliberately never restored from browser storage or Run.setup.
import { composeGuideSteps } from './steps.js';
import { registry } from '../catalog/modules.js';

const key = value => JSON.stringify(value);
const sensorKey = context => key([context?.sensor?.id, context?.sensor?.version]);
const activityKey = context => key([context?.activity?.id, context?.activity?.version]);
const firmwareKey = firmware => key([firmware?.id, firmware?.version, firmware?.sha256 ?? firmware?.hash ?? null]);
const emptyBattery = () => ({ startedAt: null, confirmedAt: null, observedAt: null, firstReceivedAt: null, lastReceivedAt: null, count: 0 });
/** @param {any} initialContext @param {{now?:()=>number,modules?:typeof registry}} options */
export function createGuideProgress(initialContext, { now = () => Date.now(), modules = registry } = {}) {
  let context = structuredClone(initialContext), steps = composeGuideSteps(context, modules), attemptId = null;
  const confirmations = new Map();
  let installedThisSession = null, connected = false, receptionReady = false, calibration = 'unknown', simulated = false, lastProgrammerStatus = null;
  let battery = emptyBattery();
  function clear(ids) { for (const id of ids) confirmations.delete(id); }
  function resetLive() { clear(steps.filter(step => step.scope === 'attempt').map(step => step.id)); connected = receptionReady = false; calibration = 'unknown'; battery = emptyBattery(); }
  function setContext(next) {
    if (sensorKey(next) !== sensorKey(context)) { confirmations.clear(); installedThisSession = null; lastProgrammerStatus = null; resetLive(); attemptId = null; }
    else {
      if (firmwareKey(next.firmware) !== firmwareKey(context.firmware)) { clear(['program']); installedThisSession = null; lastProgrammerStatus = null; resetLive(); }
      if (activityKey(next) !== activityKey(context)) { clear(steps.filter(step => step.scope === 'activity').map(step => step.id)); battery = emptyBattery(); }
    }
    context = structuredClone(next); steps = composeGuideSteps(context, modules);
    clear([...confirmations.keys()].filter(id => !steps.some(step => step.id === id)));
    return getState();
  }
  function setAttempt(next) { if (next !== attemptId) { attemptId = next; resetLive(); } }
  function confirm(id) {
    const step = steps.find(item => item.id === id);
    if (!step || !['manual', 'program', 'calibration'].includes(step.kind)) return false;
    if (step.kind === 'calibration') { if (!connected) return false; if (calibration !== 'device-reported') calibration = 'user-confirmed'; }
    else confirmations.set(id, { at: now(), evidence: 'user-confirmed' });
    return true;
  }
  function beginBatteryCheck() {
    if (!connected || !steps.some(step => step.id === 'battery')) return false;
    const at = now(); battery = { ...emptyBattery(), startedAt: at, confirmedAt: at }; return true;
  }
  /** @param {import('./types.js').GuideFacts} facts */
  function observe(facts) {
    if (facts.attemptId !== attemptId) return false;
    const hadReception = receptionReady;
    connected = facts.connected === true;
    simulated = facts.mock === true;
    receptionReady = connected && facts.receptionReady === true;
    if (hadReception && !receptionReady && battery.startedAt !== null) battery = { ...emptyBattery(), startedAt: battery.startedAt, confirmedAt: battery.confirmedAt };
    if (!connected) { calibration = 'unknown'; battery = emptyBattery(); }
    if (facts.firmwareInstalled === false) installedThisSession = null;
    const programmerStatus = facts.programmerState?.status ?? null;
    // Rendering may skip a short connecting/flashing state. Invalidate on the
    // first observed outcome too, while preserving a later user confirmation.
    if (programmerStatus !== lastProgrammerStatus && ['connecting', 'flashing', 'error', 'cancelled'].includes(programmerStatus)) {
      installedThisSession = null; clear(['program']);
    }
    lastProgrammerStatus = programmerStatus;
    if (facts.firmwareInstalled && firmwareKey(facts.firmwareInstalled) === firmwareKey(context.firmware)
      && firmwareKey(installedThisSession) !== firmwareKey(facts.firmwareInstalled)) installedThisSession = { ...structuredClone(facts.firmwareInstalled), observedAt: now() };
    if (connected && facts.calibration === 'device-reported') calibration = 'device-reported';
    if (connected && facts.calibration === 'user-confirmed' && calibration === 'unknown') calibration = 'user-confirmed';
    if (battery.startedAt !== null && connected && Number.isFinite(facts.receivedAt) && facts.receivedAt > battery.startedAt && (battery.lastReceivedAt === null || facts.receivedAt > battery.lastReceivedAt)) {
      battery.firstReceivedAt ??= facts.receivedAt;
      battery.lastReceivedAt = facts.receivedAt; battery.count++;
      const count = context.connectionPolicy?.confirmationCount ?? 3, span = context.connectionPolicy?.confirmationSpanMs ?? 1000;
      if (receptionReady && battery.count >= count && battery.lastReceivedAt - battery.firstReceivedAt >= span) battery.observedAt = facts.receivedAt;
    }
    return true;
  }
  function getState() {
    const stateSteps = steps.map(step => {
      const evidence = step.kind === 'program' ? installedThisSession ? 'device-observed' : confirmations.has(step.id) ? 'user-confirmed' : null
        : step.kind === 'connection' ? connected ? simulated ? 'simulated' : 'device-observed' : null
        : step.kind === 'reception' ? receptionReady ? simulated ? 'simulated' : 'device-observed' : null
        : step.kind === 'calibration' ? calibration === 'unknown' ? null : calibration
        : step.kind === 'battery' ? battery.observedAt !== null && receptionReady ? simulated ? 'simulated' : 'device-observed' : null
        : confirmations.get(step.id)?.evidence ?? null;
      return { ...step, complete: Boolean(evidence), evidence };
    });
    const user = Object.fromEntries(confirmations);
    return structuredClone({ canMeasure: stateSteps.length > 0 && connected && receptionReady,
      ready: stateSteps.length > 0 && stateSteps.every(step => !step.required || step.complete), steps: stateSteps,
      confirmations: user, observations: { installedThisSession, programUserConfirmed: confirmations.has('program'), connected, receptionReady, calibration, battery, simulated },
      setup: { confirmations: user, firmware: installedThisSession, calibration, battery: { userConfirmedAt: battery.confirmedAt, observedAt: battery.observedAt }, attemptId, simulated } });
  }
  return { setContext, setAttempt, confirm, observe, beginBatteryCheck, getState, clear };
}
