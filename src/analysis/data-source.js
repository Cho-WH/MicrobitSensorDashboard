import { capturePointInput } from '../domain/point-records.js';
import { getSourceColumns } from '../domain/columns.js';
import { timeOrigin } from './scope.js';

export function pointSourceRows(samples, input) {
  const byId = new Map(samples.map(sample => [sample.sampleId, sample]));
  return input.points.map(point => ({ ...byId.get(point.capturedSampleId), pointRecordId: point.pointRecordId,
    manualValues: { ...point.manualValues }, withdrawn: point.withdrawn }));
}

// A pure read model shared by analysis and output; it never writes or renumbers source samples.
export function getAnalysisSourceSnapshot(snapshot, sourceId = 'recorded') {
  const { run, samples, pointRecords = [] } = snapshot;
  if (!['recorded', 'points'].includes(sourceId) || (sourceId === 'recorded' && run.recordingMode === 'point')
    || (sourceId === 'points' && !pointRecords.length && run.recordingMode !== 'point')) throw new Error('분석할 자료를 확인하세요.');
  const inputSnapshot = sourceId === 'points' ? capturePointInput(run, pointRecords, samples.at(-1)?.sampleId ?? 0) : null;
  const rows = inputSnapshot ? pointSourceRows(samples, inputSnapshot) : samples;
  const context = inputSnapshot ? { ...run.context, analysisSource: 'points', manualColumns: inputSnapshot.manualColumns } : run.context;
  return structuredClone({ sourceId, availableIds: rows.filter(row => sourceId !== 'points' || !row.withdrawn).map(row => row.sampleId), rows,
    sourceColumns: getSourceColumns(context), sourceRevision: inputSnapshot?.sourceRevision ?? samples.at(-1)?.sampleId ?? 0,
    timeOrigin: timeOrigin(samples, run), inputSnapshot });
}
