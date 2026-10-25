// Adapted from Cho-WH/bme280@59c5c149 gay-lussac/data/contracts.js.
// Fixed thermal columns are supplied by a saved experiment context.
import { getSourceColumns, graphColumns } from './columns.js';
import { LIMITS } from './limits.js';
export { graphColumns, LIMITS };
export const DATABASE = Object.freeze({ name: 'microbit.sensor-lab', version: 1 });
/** @typedef {import('./columns.js').Channel} Channel */
/** @typedef {{sensor:any,activity:any,classConfig:any,channels:Channel[],firmware:any,setup:any,defaultGraph:any,analysisTemplates:any[],questions:any[]}} ExperimentContext */
/** @typedef {{runId:string,sampleId:number,receivedAt:number|null,values:Record<string,number|null>,validity:Record<string,string>,sourceSampleId?:number,rawExtra?:any}} Sample */
/** @typedef {{type:'reading',values:Record<string,number|null>,validity:Record<string,string>,receivedAt:number,monotonicAt:number,attemptId:number,rawExtra?:any}} Reading */
/** @typedef {{id:string,schemaVersion:number,runRevision:number,name:string,createdAt:number,updatedAt:number,status:string,context:ExperimentContext,source:string,lastSavedSampleId:number,lastSavedEventId:number}} Run */
export const CALCULATION_OPERATORS = Object.freeze({ '+': '+', '-': '−', '*': '×', '/': '÷', '^': '거듭제곱' });
export const isValidReading = input => input?.type === 'reading' && Object.values(input.validity ?? {}).some(v => v === 'valid');
export function withEventNote(event, note) {
  if (!event || event.source !== 'user') throw new Error('사용자 조작 기록의 메모만 수정할 수 있어요.');
  if (typeof note !== 'string' || note.length > 500) throw new Error('메모는 500자 이내로 입력하세요.');
  return { ...event, payload: { ...event.payload, note: note.trim() } };
}
export function validateChannels(channels) {
  if (!Array.isArray(channels) || !channels.length || channels.length > LIMITS.channels) throw new Error('측정 항목은 1~16개여야 합니다.');
  const ids = new Set(['sampleId', 'receivedAt', 'timestamp', 'usage', 'note', '__proto__', 'constructor', 'prototype']);
  return channels.map(c => {
    if (!c || typeof c.id !== 'string' || !/^[a-zA-Z][\w-]*$/.test(c.id) || c.id.startsWith('calc-') || ids.has(c.id)
      || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 60 || (c.unit != null && (typeof c.unit !== 'string' || c.unit.length > 30))) throw new Error('측정 항목의 ID·이름·단위를 확인하세요.');
    ids.add(c.id); return { ...c };
  });
}
export function validateImportedColumns(columns = [], context = undefined) {
  if (!Array.isArray(columns)) throw new Error('가져온 자료 열 목록을 확인하세요.');
  const ids = new Set(getSourceColumns(context).map(c => c.id));
  return columns.map(c => {
    if (!c || typeof c.id !== 'string' || !/^data-[\w-]+$/.test(c.id) || ids.has(c.id)
      || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 60
      || (c.unit != null && (typeof c.unit !== 'string' || c.unit.length > 30))) throw new Error('가져온 자료 열의 ID·이름·단위를 확인하세요.');
    ids.add(c.id); return { id: c.id, name: c.name, unit: c.unit || null };
  });
}
export function validateGraph(graph, calculated = [], imported = [], context = undefined) {
  if (graph == null) return null;
  const ids = new Set(graphColumns(calculated, imported, context).map(c => c.id));
  if (!ids.has(graph.xColumnId) || !ids.has(graph.yColumnId) || ['receivedAt','sampleId'].includes(graph.yColumnId)) throw new Error('그래프에 사용할 X축과 Y축을 선택하세요.');
  if (!['scatter', 'line'].includes(graph.type) || (graph.type === 'line' && graph.xColumnId !== 'receivedAt')) throw new Error('꺾은선 그래프는 가로축이 경과 시간일 때 사용할 수 있어요.');
  const right = graph.right;
  if (right != null && (typeof right !== 'object' || Array.isArray(right) || !ids.has(right.yColumnId)
    || ['receivedAt','sampleId',graph.yColumnId].includes(right.yColumnId) || right.right != null
    || (right.trendEnabled != null && typeof right.trendEnabled !== 'boolean')
    || (right.view != null && !['measured','extended'].includes(right.view)))) throw new Error('오른쪽 세로축에는 다른 측정 항목 하나를 선택하세요.');
  return { xColumnId: graph.xColumnId, yColumnId: graph.yColumnId, type: graph.type, connectGaps: graph.connectGaps === true, view: graph.view === 'extended' ? 'extended' : 'measured',
    ...(right == null ? {} : {right:{yColumnId:right.yColumnId,trendEnabled:right.trendEnabled===true,view:right.trendEnabled&&right.view==='extended'?'extended':'measured'}}) };
}
export function validateCalculatedColumns(definitions, imported = [], context = undefined) {
  if (!Array.isArray(definitions) || definitions.length > LIMITS.calculatedColumns) throw new Error('계산 열은 32개까지 만들 수 있어요.');
  const source = getSourceColumns(context), ids = new Set([...source, ...imported].map(c => c.id));
  const columns = definitions.map(c => {
    if (!c || typeof c.id !== 'string' || !/^calc-[\w-]+$/.test(c.id) || ids.has(c.id)) throw new Error('계산 열 ID가 올바르지 않거나 중복됩니다.');
    ids.add(c.id);
    if (typeof c.name !== 'string' || !c.name.trim() || c.name.trim().length > 60) throw new Error('열 이름을 1~60자로 입력하세요.');
    if (c.unit != null && (typeof c.unit !== 'string' || c.unit.trim().length > 30)) throw new Error('단위는 30자 이내로 입력하세요.');
    if (!Object.hasOwn(CALCULATION_OPERATORS, c.op)) throw new Error('계산 연산을 선택하세요.');
    return { id: c.id, name: c.name.trim(), unit: c.unit?.trim() || null, lhs: c.lhs, op: c.op, rhs: c.rhs };
  });
  const available = new Set([...source.filter(c => c.calculable), ...imported, ...columns].map(c => c.id));
  for (const c of columns) for (const side of ['lhs', 'rhs']) {
    const operand = c[side];
    if (operand?.kind === 'constant' && Number.isFinite(operand.value)) c[side] = { kind: 'constant', value: operand.value };
    else if (operand?.kind === 'column' && available.has(operand.columnId)) c[side] = { kind: 'column', columnId: operand.columnId };
    else throw new Error('A와 B에 자료 열 또는 유한한 숫자를 입력하세요.');
  }
  const byId = new Map(columns.map(c => [c.id, c])), visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error('자기 자신을 참조하거나 계산 열끼리 순환하는 식은 사용할 수 없습니다.');
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const operand of [byId.get(id).lhs, byId.get(id).rhs]) if (operand.kind === 'column') visit(operand.columnId);
    visiting.delete(id); visited.add(id);
  }
  columns.forEach(c => visit(c.id)); return columns;
}
export function validateSample(sample, context) {
  if (!sample || !Number.isSafeInteger(sample.sampleId) || sample.sampleId < 1 || typeof sample.runId !== 'string'
    || (sample.receivedAt !== null && (!Number.isFinite(sample.receivedAt) || Math.abs(sample.receivedAt) > 8.64e15))) throw new Error('측정 자료의 번호·시각을 확인하세요.');
  const channels = validateChannels(context?.channels ?? context?.sensor?.channels);
  const allowed = new Set(channels.map(c => c.id));
  if (!sample.values || !sample.validity || Array.isArray(sample.values) || Array.isArray(sample.validity)
    || Object.keys(sample.values).some(k => !allowed.has(k)) || Object.keys(sample.validity).some(k => !allowed.has(k))) throw new Error('알 수 없는 측정 항목입니다.');
  for (const c of channels) {
    const value = sample.values[c.id], status = sample.validity[c.id];
    const finiteValue = Number.isFinite(value) && ['valid', 'out-of-range', 'error'].includes(status);
    const absentValue = value === null && ['missing', 'unsupported', 'error'].includes(status);
    if (!finiteValue && !absentValue) throw new Error('측정값과 유효성 표시가 올바르지 않습니다.');
  }
  return structuredClone(sample);
}
