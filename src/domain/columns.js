/** @typedef {{id:string,name:string,unit?:string|null,calculable?:boolean,supported?:boolean,min?:number,max?:number,digits?:number,color?:string}} Channel */
/** @param {any} context @returns {Channel[]} */
export function getSourceColumns(context) {
  const channels = Array.isArray(context) ? context : context?.channels ?? context?.sensor?.channels ?? [];
  return [{ id: 'sampleId', name: '번호', unit: null },
    ...channels.map(c => ({ ...c, calculable: c.calculable !== false && c.supported !== false })),
    { id: 'receivedAt', name: '수신 시각', unit: null }];
}
export const sourceColumns = getSourceColumns;
/** @param {any} sample @param {string} columnId @returns {{value:number|null,reason:string|null}} */
export function readCell(sample, columnId) {
  if (columnId === 'sampleId' || columnId === 'receivedAt') return { value: Number.isFinite(sample[columnId]) ? sample[columnId] : null, reason: Number.isFinite(sample[columnId]) ? null : '값 없음' };
  const calculated = sample.calculations?.[columnId];
  if (calculated) return { value: calculated.value, reason: calculated.reason ?? null };
  const imported = sample.importedValues?.[columnId];
  if (imported) return { value: imported.value, reason: imported.reason ?? null };
  const validity = sample.validity?.[columnId];
  const reasons = { missing: '값 없음', unsupported: '지원하지 않는 항목', 'out-of-range': '측정 범위 밖', error: '측정 오류' };
  const value = sample.values?.[columnId];
  return { value: Number.isFinite(value) ? value : null,
    reason: validity && validity !== 'valid' ? reasons[validity] ?? '측정 오류' : Number.isFinite(value) ? null : '값 없음' };
}
export const valueAt = readCell;
/** @param {any[]} calculated @param {any[]} imported @param {any} context */
export const graphColumns = (calculated = [], imported = [], context = undefined) => [
  ...getSourceColumns(context).filter(c => c.supported !== false), ...imported, ...calculated,
];
