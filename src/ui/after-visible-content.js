/** Best-effort preparation after current visible images, without delaying actions.
 * @param {HTMLElement} root @param {()=>unknown} prepare @param {AbortSignal} [signal] */
export function afterVisibleContent(root, prepare, signal) {
  let cancelled = false, idle, timer;
  const cleanups = [];
  function cancel() {
    cancelled = true;
    if (idle !== undefined) window.cancelIdleCallback(idle);
    clearTimeout(timer);
    cleanups.splice(0).forEach(cleanup => cleanup());
    signal?.removeEventListener('abort', cancel);
  }
  if (signal?.aborted || Reflect.get(navigator, 'connection')?.saveData) return cancel;
  const run = () => {
    if (cancelled || !root.isConnected || !root.checkVisibility()) return;
    signal?.removeEventListener('abort', cancel);
    // Optional preparation may fail; the explicit action retains its retry path.
    Promise.resolve().then(prepare).catch(() => {});
  };
  const schedule = () => {
    cleanups.splice(0).forEach(cleanup => cleanup());
    if (cancelled) return;
    if ('requestIdleCallback' in window) idle = window.requestIdleCallback(run, { timeout: 1500 });
    else timer = setTimeout(run, 100);
  };
  const images = [...root.querySelectorAll('img')].filter(image => {
    const box = image.getBoundingClientRect();
    return image.src && !image.complete && image.checkVisibility() && box.bottom > 0 && box.top < innerHeight;
  });
  let pending = images.length;
  for (const image of images) {
    const settled = () => { cleanup(); if (--pending === 0) schedule(); };
    const cleanup = () => { image.removeEventListener('load', settled); image.removeEventListener('error', settled); };
    image.addEventListener('load', settled, { once: true });
    image.addEventListener('error', settled, { once: true });
    cleanups.push(cleanup);
  }
  signal?.addEventListener('abort', cancel, { once: true });
  if (!pending) schedule();
  return cancel;
}
