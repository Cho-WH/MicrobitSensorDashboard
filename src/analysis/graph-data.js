// Adapted from Cho-WH/bme280 gay-lussac/analysis/graph-data.js at 59c5c149450f970bace2deaa183857c275595853.
import { graphColumns } from '../domain/contracts.js';
import { columnLabel } from './calculations.js';
import { readCell } from '../domain/columns.js';
import { scopeMembership, timeBounds } from './scope.js';

// Uses analysis candidates, never the table's filter, sort or transient checks.
export function graphData(samples, state, imported = [], context = state.context, timeOrigin = timeBounds(samples)?.origin ?? null) {
  if (!state.graph) return null;
  const graph = state.graph, columns = graphColumns(state.calculatedColumns, imported, context);
  const { candidates, excluded } = scopeMembership(state);
  const points = [], excludedPoints = [], line = [];
  let invalidCount = 0, candidateCount = 0, excludedCount = 0, previous = null;
  for (const sample of samples) {
    if (sample.sampleId > state.tableLastSampleId || !candidates.has(sample.sampleId)) continue;
    candidateCount++; if (excluded.has(sample.sampleId)) excludedCount++;
    const xCell = readCell(sample, graph.xColumnId), yCell = readCell(sample, graph.yColumnId);
    const x = xCell.reason ? null : xCell.value, y = yCell.reason ? null : yCell.value;
    const point = { x, y, sampleId: sample.sampleId };
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (!excluded.has(sample.sampleId)) invalidCount++;
      line.push({ x: previous?.x ?? 0, y: null }); previous = null; continue;
    }
    if (excluded.has(sample.sampleId)) {
      excludedPoints.push(point); line.push({ x, y: null }); previous = null; continue;
    }
    if (previous && (sample.receivedAt < previous.receivedAt
      || (!graph.connectGaps && sample.receivedAt - previous.receivedAt >= (context?.connectionPolicy?.staleMs ?? context?.connection?.staleMs ?? 5000)))) line.push({ x, y: null });
    points.push(point); line.push(point); previous = { x, receivedAt: sample.receivedAt };
  }
  const yColumn = columns.find(c => c.id === graph.yColumnId);
  const right = graph.right ? graphData(samples,{...state,graph:{...graph,right:undefined,yColumnId:graph.right.yColumnId,
    view:graph.right.view,trendEnabled:graph.right.trendEnabled}},imported,context,timeOrigin) : null;
  return { ...graph, ...(right ? {right} : {}), points, excludedPoints, line, invalidCount, candidateCount, excludedCount, includedCount: candidateCount - excludedCount,
    yQuantity:yColumn?.quantity, yQuantityLabel:yColumn?.quantityLabel,
    xUnit: graph.xColumnId === 'receivedAt' ? '초' : columns.find(c => c.id === graph.xColumnId)?.unit,
    yUnit: columns.find(c => c.id === graph.yColumnId)?.unit,
    ...(graph.xColumnId === 'receivedAt' ? {timeOrigin} : {}),
    xLabel: graph.xColumnId === 'receivedAt' ? '경과 시간' : columnLabel(columns.find(c => c.id === graph.xColumnId)),
    yLabel: columnLabel(columns.find(c => c.id === graph.yColumnId)) };
}
