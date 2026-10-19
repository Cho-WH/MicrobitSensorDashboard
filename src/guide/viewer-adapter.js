// Port of G/guide/viewer-adapter.js, with strict reply phase checks and local URL.
const CHANNEL = 'gay-lussac-guide';

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
  let sequence = 0, cableSide = 'left', detail = false, hasAppliedState = false;
  const isWiring = () => Boolean(currentStep?.model?.wire);
  const notify = state => { if (!disposed) onState(state, { side: isWiring() ? cableSide : 'left', detail: isWiring() && detail, hasAppliedState }); };
  function unavailable() { ready = false; pendingType = null; notify('unavailable'); }
  function request(type, state) {
    if (disposed) return;
    cancel(timer); lastRequest = String(++sequence); pendingType = type;
    frame.contentWindow?.postMessage({ channel: CHANNEL, version: 1, requestId: lastRequest, type, state }, url.origin);
    timer = schedule(unavailable, 5000);
  }
  function restoreStep() {
    if (ready && currentStep?.model) {
      const state = { ...currentStep.model, side: isWiring() ? cableSide : 'left' };
      if (isWiring() && detail) { state.view = 'connector'; state.explosion = 60; }
      notify('loading'); request('apply-state', state);
    }
  }
  function loaded() { if (!started || disposed) return; ready = false; hasAppliedState = false; notify('loading'); request('prepare'); }
  function receive(event) {
    const data = event.data;
    if (disposed || !pendingType || event.source !== frame.contentWindow || event.origin !== url.origin
      || data?.channel !== CHANNEL || data.version !== 1 || data.requestId !== lastRequest
      || !['ready', 'applied', 'error'].includes(data.type)
      || (data.type === 'ready' && pendingType !== 'prepare')
      || (data.type === 'applied' && !['apply-state', 'set-side'].includes(pendingType))) return;
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
      if (currentStep?.id !== step.id) detail = false;
      currentStep = structuredClone(step);
      if (!started) {
        started = true; frame.src = url.href; notify('loading'); timer = schedule(unavailable, 8000);
      } else if (ready) restoreStep(); else request('prepare');
    },
    setCableSide(side) {
      if (disposed || !isWiring() || !ready || !['left', 'right'].includes(side) || side === cableSide) return;
      cableSide = side;
      if (detail) restoreStep(); else { notify('loading'); request('set-side', { side }); }
    },
    toggleDetail() { if (!disposed && isWiring() && ready) { detail = !detail; restoreStep(); } },
    restoreStep() { if (!started || disposed) return; detail = false; if (ready) restoreStep(); else loaded(); },
    dispose() { disposed = true; cancel(timer); frame.removeEventListener('load', loaded); frame.removeEventListener('error', unavailable); events.removeEventListener('message', receive); },
  };
}
