import { createReceptionMonitor } from './reception-monitor.js';

const fail = code => Object.assign(new Error(code), { code });
// Also lives before the first Run: observations and reservations belong to the
// measurement lifecycle, never to a view or a provisional database record.
/** @param {{config?:any,clock?:{utc:()=>number,mono:()=>number}}} [options] */
export function createPointCapture({ config = {}, clock = { utc: () => Date.now(), mono: () => performance.now() } } = {}) {
  const monitor = createReceptionMonitor(config);
  let sequence = 0, latest = null, accepted = 0, pending = null, generation = 0;
  function validate(candidate, connection) {
    const now = clock.mono(), input = candidate?.input;
    if (!connection?.connected || !connection.confirmed || !input || input.attemptId !== connection.attemptId
      || candidate.generation !== generation || !monitor.getSnapshot(now).reception.ready)
      throw fail('capture-reception');
    if (now < input.monotonicAt || now - input.monotonicAt >= (config.staleMs ?? Number.MAX_SAFE_INTEGER)) throw fail('capture-reception');
    if (candidate.sequence === accepted) throw fail('capture-duplicate');
  }
  return {
    accept(input) {
      monitor.accept(input);
      // Invalid readings and parse errors invalidate the candidate, rather than
      // falling back to a previous, apparently normal value.
      latest = input.type === 'reading' ? { input: structuredClone(input), sequence: ++sequence, generation, sampleId: null } : null;
    },
    recorded(sampleId) { if (latest) latest.sampleId = sampleId; },
    disconnected() { generation++; latest = null; monitor.disconnected(); },
    status(connection, requireSample = false) {
      try {
        if (pending) throw fail('capture-pending'); validate(latest, connection);
        if (requireSample && latest.sampleId === null) throw fail('capture-reception');
        return { ready: true, reason: '' };
      }
      catch (error) { return { ready: false, reason: error.code }; }
    },
    prepare(connection, manualValues = {}) {
      if (pending) throw fail('capture-pending');
      validate(latest, connection);
      if (Object.values(manualValues).some(value => value !== null && !Number.isFinite(value))) throw fail('capture-condition');
      const candidate = structuredClone(latest), input = candidate.input;
      const sample = { receivedAt: input.receivedAt, values: input.values, validity: input.validity };
      if (input.rawExtra !== undefined) sample.rawExtra = input.rawExtra;
      const point = { capturedAt: clock.utc(), manualValues: structuredClone(manualValues) };
      pending = candidate;
      let settled = false;
      return { sample, point, sampleId: candidate.sampleId,
        validate: connection => { if (settled) throw fail('capture-pending'); validate(candidate, connection); },
        accept() { if (!settled) { accepted = candidate.sequence; pending = null; settled = true; } },
        cancel() { if (!settled) { pending = null; settled = true; } },
      };
    },
  };
}
