// Adapted from Cho-WH/bme280 59c5c149450f970bace2deaa183857c275595853; legacy import only.
import { LIMITS } from '../../domain/limits.js';
// File-only representation. RunStore and IndexedDB continue using full sample records.
const COLUMNS = ['sampleId', 'receivedAt', 'temperatureC', 'pressureHpa'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const encoder = new TextEncoder();
const bytes = value => encoder.encode(JSON.stringify(value)).byteLength;
const MAX_EXPANDED_BYTES = LIMITS.maxFileBytes;
function requireValue(ok) {
  if (!ok) throw new Error('실험 파일: 압축 원자료의 열·행·예외 정보를 확인하세요.');
}

export function unpackSamples(snapshot) {
  requireValue(object(snapshot) && object(snapshot.samples));
  const packed = snapshot.samples, { columns, defaults, rows, overrides } = packed;
  requireValue(Object.keys(packed).length === 4 && Array.isArray(columns)
    && columns.length === COLUMNS.length && columns.every((key, i) => key === COLUMNS[i])
    && object(defaults) && !COLUMNS.some(key => own(defaults, key))
    && Array.isArray(rows) && rows.length <= LIMITS.maxSamples && Array.isArray(overrides));
  const patches = new Map();
  let previous = -1;
  for (const entry of overrides) {
    requireValue(Array.isArray(entry) && entry.length === 3);
    const [index, values, missing] = entry;
    requireValue(Number.isSafeInteger(index) && index > previous && index < rows.length
      && object(values) && !COLUMNS.some(key => own(values, key))
      && Array.isArray(missing) && new Set(missing).size === missing.length
      && missing.every(key => typeof key === 'string' && own(defaults, key) && !own(values, key)));
    previous = index; patches.set(index, { values, missing });
  }
  // Bound expansion before copying shared nested values into thousands of records.
  const fieldBytes = (key, value) => bytes(key) + 1 + bytes(value) + 1;
  const defaultSizes = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, fieldBytes(key, value)]));
  const baseSize = Object.values(defaultSizes).reduce((sum, size) => sum + size, 0);
  let expandedBytes = bytes({ ...snapshot, samples: [] });
  rows.forEach((row, index) => {
    requireValue(Array.isArray(row) && row.length === COLUMNS.length);
    const patch = patches.get(index);
    let size = 2 + baseSize + row.reduce((sum, value, i) => sum + fieldBytes(COLUMNS[i], value), 0);
    for (const key of patch?.missing ?? []) size -= defaultSizes[key];
    for (const [key, value] of Object.entries(patch?.values ?? {})) size += fieldBytes(key, value) - (defaultSizes[key] ?? 0);
    expandedBytes += size;
    if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error('실험 파일: 복원할 자료가 너무 큽니다. 32 MiB 이하의 자료로 나누어 주세요.');
  });
  const samples = rows.map((row, index) => {
    const patch = patches.get(index);
    const sample = { ...structuredClone(defaults), ...Object.fromEntries(COLUMNS.map((key, i) => [key, row[i]])),
      ...structuredClone(patch?.values ?? {}) };
    for (const key of patch?.missing ?? []) delete sample[key];
    return sample;
  });
  return { ...snapshot, samples };
}

