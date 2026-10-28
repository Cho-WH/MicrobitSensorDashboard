// Adapted from Cho-WH/bme280 gay-lussac/analysis/scope.js at 59c5c149450f970bace2deaa183857c275595853.
// One interpretation of scope/exclusion for the table, charts and file exports.
export function scopeMembership(state, fallbackIds = []) {
  const candidates = new Set(state?.appliedIds ?? fallbackIds);
  const excluded = new Set(state?.exclusions?.map(e => e.sampleId) ?? []);
  const withdrawn = new Set(state?.inputSnapshot?.points.filter(p => p.withdrawn).map(p => p.capturedSampleId) ?? []);
  for (const id of withdrawn) excluded.add(id);
  return { candidates, excluded,
    status: id => withdrawn.has(id) ? 'withdrawn' : !candidates.has(id) ? 'outside' : excluded.has(id) ? 'excluded' : 'included',
    includes: id => candidates.has(id) && !excluded.has(id) };
}

export const statusLabels = Object.freeze({ included: '분석 포함', excluded: '제외', outside: '범위 밖', withdrawn: '기록 취소' });

export function timeOrigin(samples, run = {}) {
  return run.timeOrigin ?? samples.find(sample => Number.isFinite(sample.receivedAt))?.receivedAt ?? null;
}

export function timeBounds(samples, origin = timeOrigin(samples)) {
  const timed = samples.filter(s => Number.isFinite(s.receivedAt));
  if (!timed.length) return null;
  let startAt = Infinity, endAt = -Infinity;
  for (const s of timed) { startAt = Math.min(startAt, s.receivedAt); endAt = Math.max(endAt, s.receivedAt); }
  return { startAt, endAt, origin };
}

export function rangeSampleIds(samples, range) {
  if (!range || ![range.startAt, range.endAt].every(Number.isFinite) || range.startAt > range.endAt)
    throw new Error('시작과 끝 시간을 확인하세요. 시작은 끝보다 늦을 수 없어요.');
  return samples.filter(s => Number.isFinite(s.receivedAt) && s.receivedAt >= range.startAt && s.receivedAt <= range.endAt).map(s => s.sampleId);
}

export function validateAnalysisRange(range, samples, state) {
  if (range == null) return null;
  const throughSampleId = range.throughSampleId ?? state.tableLastSampleId;
  if (!Number.isSafeInteger(throughSampleId) || throughSampleId < 1 || throughSampleId > state.tableLastSampleId)
    throw new Error('저장된 구간의 자료 경계를 확인하세요.');
  const normalized = { startAt: range.startAt, endAt: range.endAt, throughSampleId };
  const ids = rangeSampleIds(samples.filter(s => s.sampleId <= throughSampleId), normalized);
  const applied = new Set(state.appliedIds);
  if (state.appliedScope !== 'selection' || !ids.length || ids.length !== applied.size || ids.some(id => !applied.has(id)))
    throw new Error('저장된 시간 구간과 분석 자료가 일치하지 않아요.');
  return normalized;
}
