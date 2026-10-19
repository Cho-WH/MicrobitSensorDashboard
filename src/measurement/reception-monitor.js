// Adapted from Cho-WH/bme280 59c5c149, diagnostics/reception.js and
// measurement/reception-monitor.js. Required channels and timing come from the sensor.
const initial = () => ({ firstAt: null, lastAt: null, count: 0, attemptId: null });
export function discontinuityReason(previous, input, gapMs) {
  if (!previous) return null;
  if (previous.attemptId !== input.attemptId) return 'reconnected';
  const monoDelta = input.monotonicAt - previous.monotonicAt;
  const utcDelta = input.receivedAt - previous.receivedAt;
  if (monoDelta < 0 || utcDelta < 0 || Math.abs(utcDelta - monoDelta) >= gapMs) return 'clock-change';
  return monoDelta >= gapMs ? 'reception-gap' : null;
}

export function createReceptionMonitor(config = {}) {
  const { staleMs = Number.MAX_SAFE_INTEGER, confirmationCount = 1, confirmationSpanMs = 0,
    requiredChannelIds = [] } = config;
  let reception = initial(), latest = null, lastInput = null;
  const valid = input => input?.type === 'reading' && (requiredChannelIds.length
    ? requiredChannelIds.every(id => input.validity?.[id] === 'valid')
    : Object.values(input.validity ?? {}).some(value => value === 'valid'));
  function observe(previous, input, now) {
    let next = { ...previous };
    const expired = next.lastAt !== null && (now - next.lastAt >= staleMs || now < next.lastAt);
    if (expired || input?.type === 'parse-error' || (input?.type === 'reading' && !valid(input))
      || (input?.attemptId != null && input.attemptId !== next.attemptId)) next = initial();
    if (valid(input)) {
      next.attemptId = input.attemptId; next.firstAt ??= input.monotonicAt;
      next.lastAt = input.monotonicAt; next.count++;
    }
    return { nextState: next, observation: { state: next.count ? 'receiving' : previous.count || expired ? 'stale' : 'waiting',
      ready: next.count >= confirmationCount && next.lastAt - next.firstAt >= confirmationSpanMs,
      count: next.count, spanMs: next.count ? next.lastAt - next.firstAt : 0 } };
  }
  return {
    accept(input) {
      if (input.type === 'reading') latest = structuredClone(input);
      if (discontinuityReason(lastInput, input, staleMs)) reception = initial();
      reception = observe(reception, input, input.monotonicAt).nextState;
      lastInput = input;
    },
    disconnected() { reception = initial(); lastInput = null; },
    getSnapshot(now) { return { reception: observe(reception, null, now).observation, latest: structuredClone(latest) }; },
  };
}
