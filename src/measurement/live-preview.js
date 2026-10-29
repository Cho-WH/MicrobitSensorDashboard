// Display-only observations: never a source of persisted sample IDs.
export function createLivePreview() {
  let rows = [], head = 0, latest = null, origin = null, frozen = null;
  function trim(now) {
    while (head + 1 < rows.length && rows[head + 1].monotonicAt < now - 60000) head++;
    if (head > 1024 && head > rows.length / 2) { rows = rows.slice(head); head = 0; }
  }
  return {
    accept(input) {
      if (frozen || input.type !== 'reading') return;
      if (latest && (input.attemptId !== latest.attemptId || input.receivedAt < latest.receivedAt)) this.reset();
      latest = input; origin ??= input.receivedAt;
      rows.push(input); trim(input.monotonicAt);
    },
    freeze(paused, now = Date.now(), mono = performance.now()) {
      if (paused) frozen ??= { latest, points: rows.slice(head), origin, now, mono };
      else frozen = null;
    },
    snapshot(now = Date.now(), mono = performance.now()) {
      if (frozen) return frozen;
      trim(mono);
      return { latest, points: rows.slice(head), origin, now, mono };
    },
    reset() { rows = []; head = 0; latest = null; origin = null; },
  };
}
