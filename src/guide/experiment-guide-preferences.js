// Adapted from G/guide/experiment-guide-preferences.js. Never preparation evidence.
export function createExperimentGuidePreferences(activityId, version, getStorage = () => globalThis.localStorage) {
  const key = `microbit.sensor-lab.guide:${activityId}@${version}:suppressed`;
  let memory = false, localOnly = false, seen = false;
  function isSuppressed() {
    if (!localOnly) { try { memory = getStorage()?.getItem(key) === 'true'; } catch { /* Use page memory. */ } }
    return memory;
  }
  return {
    isSuppressed,
    setSuppressed(value) { memory = value; try { getStorage()?.setItem(key,String(value)); localOnly=false; } catch { localOnly=true; } },
    shouldShow: () => !seen && !isSuppressed(),
    markSeen() { seen=true; },
  };
}
