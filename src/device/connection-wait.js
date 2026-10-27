// Stop waiting for native Bluetooth work without trusting it to settle on cancellation.
/** @template T
 * @param {PromiseLike<T>|T} promise
 * @param {{signal?:AbortSignal,timeoutMs?:number,timers?:any}} options
 * @returns {Promise<T>} */
export function waitForConnection(promise, { signal, timeoutMs = 0, timers = globalThis } = {}) {
  return new Promise((resolve, reject) => {
    let timer, done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      timers.clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      error ? reject(error) : resolve(value);
    };
    const cancel = () => finish(new DOMException('연결 시도가 취소되었습니다.', 'AbortError'), undefined);
    // Always observe the native promise, including a rejection after cancellation.
    Promise.resolve(promise).then(value => finish(null, value), error => finish(error, undefined));
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    if (timeoutMs) timer = timers.setTimeout(() => finish(
      Object.assign(new Error('장치 연결 준비 시간이 초과됐습니다.'), { code: 'timeout' }), undefined), timeoutMs);
  });
}
