// Keep only a few verified files / parsed sources, never connections or install state.
// Dependencies isolate custom transports and verifiers (including test fixtures).
const entries = [];
const limit = 6;

export function reuseFirmware(key, dependencies, prepare, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  let index = entries.findIndex(entry => entry.key === key &&
    entry.dependencies.length === dependencies.length && entry.dependencies.every((value, i) => value === dependencies[i]));
  let entry = index < 0 ? null : entries.splice(index, 1)[0];
  if (!entry) {
    let promise;
    try { promise = Promise.resolve(prepare()); } catch (error) { promise = Promise.reject(error); }
    entry = { key, dependencies, promise };
    const pending = entry;
    entry.promise.catch(() => {
      const failed = entries.indexOf(pending);
      if (failed >= 0) entries.splice(failed, 1);
    });
  }
  entries.push(entry);
  if (entries.length > limit) entries.shift();
  return waitForFirmware(entry.promise, signal);
}

export function waitForFirmware(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) { promise.catch(() => {}); return Promise.reject(signal.reason); }
  // Leaving a guide cancels this consumer, not another consumer's shared download.
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
