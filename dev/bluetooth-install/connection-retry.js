// Bench recovery only: callers keep firmware/mode/start writes outside this loop.
export const reconnectPolicy = Object.freeze({
  revision: 'connection-backoff-2-4-8-discovery-2s-v2', attempts: 4,
  delaysMs: Object.freeze([2000, 4000, 8000]), disconnectWaitMs: 10000,
  serviceDiscoveryTimeoutMs: 2000,
});
export const connectionNotReady = message => Object.assign(new Error(message), { code: 'connection-not-ready' });
export function retryableConnectionError(error) {
  return ['NetworkError', 'InvalidStateError', 'NotFoundError'].includes(error.name)
    || ['disconnected', 'timeout', 'connection-not-ready', 'uart-disconnected'].includes(error.code);
}
export async function retryConnection(work, { phase, check, cleanup, pause, onEvent = () => {},
  delaysMs = reconnectPolicy.delaysMs } = {}) {
  const started = performance.now();
  const emit = (event, attempt, extra = {}) => onEvent({ kind: `connection-retry-${event}`, phase, attempt,
    elapsedMs: Math.round(performance.now() - started), revision: reconnectPolicy.revision, ...extra });
  for (let attempt = 1; attempt <= delaysMs.length + 1; attempt++) {
    check(); emit('start', attempt);
    try {
      const result = await work(attempt); check(); emit('ready', attempt); return result;
    } catch (error) {
      await cleanup(); check();
      const retry = attempt <= delaysMs.length && retryableConnectionError(error);
      emit('failed', attempt, { name: error.name, code: error.code, error: error.message, retry });
      if (!retry) throw error;
      emit('wait', attempt, { delayMs: delaysMs[attempt - 1] });
      await pause(delaysMs[attempt - 1]); check();
    }
  }
}

// Missing services can be a reboot transition; an explicit denial is not transient.
export function requireDiagnosticReady(report) {
  for (const key of ['info', 'partial']) {
    const service = report.services?.[key];
    if (service?.state === 'denied') throw new DOMException(service.error, 'SecurityError');
    if (service?.state !== 'available') throw connectionNotReady(`${key} 서비스 준비 미완료: ${service?.error ?? '없음'}`);
  }
  if (!report.info?.model || !report.status) throw connectionNotReady('장치 정보·모드 조회가 아직 완료되지 않았습니다.');
}
