import { getSourceColumns } from './columns.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };

export function validateManualColumns(columns, context, imported = []) {
  requireValue(Array.isArray(columns) && columns.length <= 1, '숫자 조건 열은 하나까지 사용할 수 있어요.');
  const ids = new Set([...getSourceColumns(context), ...imported].map(c => c.id));
  return columns.map(c => {
    requireValue(object(c) && typeof c.id === 'string' && /^manual-[\w-]+$/.test(c.id) && !ids.has(c.id) && c.type === 'number'
      && typeof c.name === 'string' && c.name.trim().length > 0 && c.name.length <= 60
      && (c.unit === null || (typeof c.unit === 'string' && c.unit.length <= 30)), '조건 열의 ID·이름·단위를 확인하세요.');
    return { id: c.id, name: c.name.trim(), unit: c.unit?.trim() || null, type: 'number' };
  });
}

export function validateManualValues(values, columns) {
  requireValue(object(values) && Object.keys(values).length === columns.length
    && columns.every(c => Object.hasOwn(values, c.id) && (values[c.id] === null || Number.isFinite(values[c.id]))),
  '조건값에는 유한한 숫자 또는 빈칸을 사용하세요.');
  return Object.fromEntries(columns.map(c => [c.id, values[c.id]]));
}

export function validatePointRecord(point, run, sample) {
  requireValue(object(point) && point.runId === run.id && positive(point.pointRecordId)
    && positive(point.capturedSampleId) && sample?.runId === run.id && sample.sampleId === point.capturedSampleId
    && Number.isFinite(sample.receivedAt) && Number.isFinite(point.capturedAt) && Math.abs(point.capturedAt) <= 8.64e15
    && typeof point.note === 'string' && point.note.length <= 500 && typeof point.withdrawn === 'boolean'
    && positive(point.revision) && point.revision <= run.pointDataRevision, '점 기록의 번호·원자료 참조·시각·수정 버전을 확인하세요.');
  return { runId: run.id, pointRecordId: point.pointRecordId, capturedSampleId: point.capturedSampleId,
    capturedAt: point.capturedAt, manualValues: validateManualValues(point.manualValues, run.manualColumns),
    note: point.note, withdrawn: point.withdrawn, revision: point.revision };
}

export function samePointOrigin(a, b) {
  return ['runId', 'pointRecordId', 'capturedSampleId', 'capturedAt'].every(key => a[key] === b[key]);
}

// Analysis copies only editable numeric inputs; immutable sensor samples stay in their one source.
export function capturePointInput(run, pointRecords, throughSampleId) {
  return structuredClone({ sourceRevision: run.pointDataRevision, throughSampleId,
    manualColumns: run.manualColumns, points: pointRecords.map(({ pointRecordId, capturedSampleId, manualValues, withdrawn, revision }) =>
      ({ pointRecordId, capturedSampleId, manualValues, withdrawn, revision })) });
}

export function validatePointInput(input, run, samples, pointRecords) {
  requireValue(object(input) && Number.isSafeInteger(input.sourceRevision) && input.sourceRevision >= 0
    && input.sourceRevision <= run.pointDataRevision && Number.isSafeInteger(input.throughSampleId)
    && input.throughSampleId >= 0 && input.throughSampleId <= samples.length
    && Array.isArray(input.points) && input.points.length <= pointRecords.length, '점 분석의 입력 사본·자료 경계를 확인하세요.');
  const manualColumns = validateManualColumns(input.manualColumns, run.context, run.importedColumns);
  requireValue(manualColumns.every(c => run.manualColumns.some(current => current.id === c.id)), '점 분석의 조건 열 참조를 확인하세요.');
  const points = input.points.map((point, i) => {
    const original = pointRecords[i];
    requireValue(object(point) && point.pointRecordId === i + 1 && point.capturedSampleId === original.capturedSampleId
      && point.capturedSampleId <= input.throughSampleId && typeof point.withdrawn === 'boolean'
      && positive(point.revision) && point.revision <= input.sourceRevision && point.revision <= original.revision,
    '점 분석 사본의 원자료 참조·수정 버전을 확인하세요.');
    const manualValues = validateManualValues(point.manualValues, manualColumns);
    requireValue(point.revision !== original.revision || (point.withdrawn === original.withdrawn
      && Object.keys(original.manualValues).length === manualColumns.length
      && manualColumns.every(c => manualValues[c.id] === original.manualValues[c.id])), '같은 수정 버전의 점 입력이 서로 다릅니다.');
    return { pointRecordId: point.pointRecordId, capturedSampleId: point.capturedSampleId,
      manualValues, withdrawn: point.withdrawn, revision: point.revision };
  });
  requireValue(input.sourceRevision !== run.pointDataRevision || (points.length === pointRecords.length
    && JSON.stringify(manualColumns) === JSON.stringify(run.manualColumns)), '최신 점 분석 사본의 조건 정의·자료 수를 확인하세요.');
  return { sourceRevision: input.sourceRevision, throughSampleId: input.throughSampleId, manualColumns, points };
}
