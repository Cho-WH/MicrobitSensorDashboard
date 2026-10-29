import { WIRING_CHANNEL as CHANNEL, WIRING_VERSION, validateViewerOptions } from '../../public/assets/devices/wiring/protocol.js';

/** @param {any} frame @param {(state:string, detail:any)=>void} onState @param {any} options */
export function createViewerAdapter(frame, onState, options = {}) {
  const events = options.events ?? window;
  const schedule = options.setTimeout ?? globalThis.setTimeout;
  const cancel = options.clearTimeout ?? globalThis.clearTimeout;
  // Only application code supplies this URL. Imported experiment content never does.
  const url = new URL(options.url);
  const parentOrigin = options.origin ?? location.origin;
  if (url.origin !== parentOrigin || !['http:', 'https:'].includes(url.protocol)) throw new Error('배선 안내는 이 앱과 같은 주소에서만 열 수 있습니다.');
  let currentStep, lastRequest = null, pendingType = null, timer, ready = false, started = false, disposed = false;
  let sequence = 0, selection = { ...(options.defaults ?? {}) }, detail = false, hasAppliedState = false;
  const isWiring = () => Boolean(currentStep?.model?.wire);
  const notify = state => { if (!disposed) onState(state, { options: { ...selection }, detail: isWiring() && detail, hasAppliedState }); };
  function unavailable() { ready = false; pendingType = null; notify('unavailable'); }
  function request(type, state) {
    if (disposed) return;
    cancel(timer); lastRequest = String(++sequence); pendingType = type;
    frame.contentWindow?.postMessage({ channel: CHANNEL, version: WIRING_VERSION, requestId: lastRequest, type, state }, url.origin);
    timer = schedule(unavailable, 5000);
  }
  function restoreStep() {
    if (ready && currentStep?.model) {
      const state = { ...currentStep.model, options: { ...selection } };
      if (isWiring() && detail) { state.view = 'connector'; state.explosion = 60; }
      notify('loading'); request('apply-state', state);
    }
  }
  function loaded() { if (!started || disposed) return; ready = false; hasAppliedState = false; notify('loading'); request('prepare'); }
  function receive(event) {
    const data = event.data;
    if (disposed || event.source !== frame.contentWindow || event.origin !== url.origin || data?.channel !== CHANNEL || data.version !== WIRING_VERSION) return;
    if (data.type === 'unavailable') { cancel(timer); unavailable(); return; }
    if (!pendingType || data.requestId !== lastRequest
      || !['ready', 'applied', 'error'].includes(data.type)
      || (data.type === 'ready' && pendingType !== 'prepare')
      || (data.type === 'applied' && pendingType !== 'apply-state')) return;
    cancel(timer); pendingType = null;
    if (data.type === 'ready') { ready = true; restoreStep(); }
    else if (data.type === 'applied') { hasAppliedState = true; notify('applied'); }
    else unavailable();
  }
  frame.addEventListener('load', loaded); frame.addEventListener('error', unavailable);
  events.addEventListener('message', receive);
  return {
    applyStep(step) {
      if (disposed || !step?.model) return;
      if (currentStep?.id !== step.id) { detail = false; selection = { ...selection, ...validateViewerOptions(options.choices ?? [], step.model.options ?? {}) }; }
      currentStep = structuredClone(step);
      if (!started) {
        started = true; frame.src = url.href; notify('loading'); timer = schedule(unavailable, 8000);
      } else if (ready) restoreStep(); else request('prepare');
    },
    setOption(id, value) {
      if (disposed || !ready || !isWiring() || selection[id] === value) return;
      try { validateViewerOptions(options.choices ?? [], { [id]: value }); } catch { return; }
      selection = { ...selection, [id]: value }; restoreStep();
    },
    toggleDetail() { if (!disposed && isWiring() && ready) { detail = !detail; restoreStep(); } },
    restoreStep() { if (!started || disposed) return; detail = false; if (ready) restoreStep(); else loaded(); },
    dispose() { disposed = true; cancel(timer); frame.removeEventListener('load', loaded); frame.removeEventListener('error', unavailable); events.removeEventListener('message', receive); },
  };
}
