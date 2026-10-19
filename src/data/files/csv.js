// CSV schema checks and typed cells adapted from the original Gay-Lussac file adapters.
import { createCalculator, columnLabel } from '../../analysis/calculations.js';
import { scopeMembership } from '../../analysis/scope.js';
import { LIMITS } from '../../domain/limits.js';
import { validateExperimentSnapshot, checkFileSize, object } from './validation.js';
import { parseLegacyCsv } from './legacy-csv.js';
import { papa } from './papa.js';

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const unescapeFormula = text => /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
function fail(message, row, code = 'INVALID_CSV', details = {}) {
  throw Object.assign(new Error(`CSV${row ? ` 자료 ${row}행` : ''}: ${message}`), { code, ...details });
}
function number(text, name, row, optional = true) {
  const value = text.trim();
  if (!value && optional) return null;
  if (!NUMBER.test(value) || !Number.isFinite(Number(value))) fail(`${name}에 숫자 또는 빈칸을 사용하세요.`, row);
  return Number(value);
}
function timestamp(text, row) {
  if (!text.trim()) return null;
  const value = text.trim(), match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) fail('시간대가 있는 ISO 시각이 필요합니다. 예: 2026-10-12T10:00:00.000Z', row);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const zone = match[7], ms = Date.parse(value);
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59
    || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) || !Number.isFinite(ms)) fail('유효한 날짜와 시각을 입력하세요.', row);
  return ms;
}

export function analysisExportInfo(snapshot) {
  const { candidates, excluded } = scopeMembership(snapshot.workspace, snapshot.samples.map(s => s.sampleId));
  const rows = snapshot.samples.filter(s => candidates.has(s.sampleId));
  return { candidateCount: rows.length, excludedCount: rows.filter(s => excluded.has(s.sampleId)).length,
    rows: rows.filter(s => !excluded.has(s.sampleId)), columns: snapshot.workspace?.calculatedColumns ?? [] };
}

function exportCsv(snapshot, rows, calculated = []) {
  const channels = snapshot.run.context.channels, imported = snapshot.run.importedColumns ?? [];
  const fields = ['sample_id', 'timestamp', ...channels.flatMap(c => [c.id, c.id + ':validity', c.id + ':meta'])];
  const extras = [...imported, ...calculated];
  if (channels.length + extras.length > LIMITS.maxChannels)
    fail('다시 가져올 수 있도록 숫자 열을 16개 이하로 선택하세요. 모든 계산식은 전체 실험 JSON으로 보관할 수 있어요.');
  for (const c of extras) fields.push(`${columnLabel(c)} [${c.id}]`, `${c.id}:validity`, `${c.id}:reason`, `${c.id}:meta`);
  const sourceIds = rows.some(s => s.sourceSampleId != null);
  if (sourceIds) fields.push('source_sample_id');
  const calculate = createCalculator(snapshot.workspace?.calculatedColumns ?? [], imported, snapshot.run.context);
  const data = rows.map(s => {
    const values = { ...s.importedValues, ...calculate(s) };
    return [s.sampleId, s.receivedAt === null ? '' : new Date(s.receivedAt).toISOString(),
      ...channels.flatMap(c => [s.values[c.id], s.validity[c.id], JSON.stringify({ name: c.name, unit: c.unit ?? null })]),
      ...extras.flatMap(c => { const r = values[c.id]; return [r.value, r.reason ? 'invalid' : 'valid', r.reason ?? '', JSON.stringify({ name: c.name, unit: c.unit ?? null })]; }),
      ...(sourceIds ? [s.sourceSampleId ?? s.sampleId] : [])];
  });
  const text = '\uFEFF' + papa().unparse({ fields, data }, { newline: '\r\n', escapeFormulae: true });
  checkFileSize(text); return text;
}
export function buildCsv(snapshot) {
  const data = validateExperimentSnapshot(snapshot);
  return exportCsv(data, data.samples);
}
export function buildAnalysisCsv(snapshot, columnIds = snapshot.workspace?.calculatedColumns.map(c => c.id) ?? []) {
  const data = validateExperimentSnapshot(snapshot), { rows, columns } = analysisExportInfo(data), selected = new Set(columnIds);
  if (selected.size !== columnIds.length || columnIds.some(id => !columns.some(c => c.id === id))) throw new Error('내보낼 계산 열을 다시 선택하세요.');
  return exportCsv(data, rows, columns.filter(c => selected.has(c.id)));
}

function parseRows(text) {
  checkFileSize(text);
  if (text.includes('\uFFFD')) fail('UTF-8 형식으로 저장한 CSV 파일을 선택하세요.');
  const parsed = papa().parse(text.replace(/^\uFEFF/, ''), { delimiter: ',', skipEmptyLines: true, dynamicTyping: false });
  if (parsed.errors.length) fail('따옴표·쉼표 형식이 올바르지 않습니다. ' + parsed.errors[0].message);
  const [rawHeaders, ...rows] = parsed.data;
  if (!rawHeaders?.length || !rows.length || rows.length > LIMITS.maxSamples) fail('열 이름과 1~100,000행의 측정 자료가 필요합니다.');
  const headers = rawHeaders.map(h => h.trim()), indexes = new Map(headers.map((h, i) => [h, i]));
  if (indexes.size !== headers.length || headers.some(h => !h)) fail('빈 열 이름이나 중복된 열 이름이 있습니다.');
  rows.forEach((row, i) => { if (row.length !== headers.length) fail('열 개수가 헤더와 다릅니다.', i + 1); });
  return { headers, rows, get: (row, key) => indexes.has(key) ? row[indexes.get(key)] : '' };
}

function readMeta(get, row, key, label) {
  let meta;
  try { meta = JSON.parse(get(row, key)); } catch { fail(`${label} 열의 이름·단위를 확인하세요.`); }
  if (!object(meta) || typeof meta.name !== 'string' || (meta.unit != null && typeof meta.unit !== 'string')) fail(`${label} 열의 이름·단위를 확인하세요.`);
  return { name: meta.name, unit: meta.unit ?? null };
}

/** Unknown CSVs require an explicit confirmed mapping; timestamp:null keeps absent times as null. */
export function parseExperimentCsv(text, { filename = '가져온 자료.csv', id = crypto.randomUUID(), now = Date.now(), mapping = null } = {}) {
  const { headers, rows, get } = parseRows(text);
  const legacyCore = ['timestamp', 'temperature_c', 'pressure_hpa'].every(h => headers.includes(h));
  const legacySchema = legacyCore && (headers.includes('humidity_pct')
    || ['sample_id', 'temperature_validity', 'pressure_validity'].every(h => headers.includes(h)));
  if (!mapping && legacySchema) {
    try { return parseLegacyCsv(text, { filename, id, now }); }
    catch (error) {
      if (/지원하지 않는 열/.test(error.message)) fail('열의 뜻과 단위를 확인한 뒤 가져오세요.', null, 'CSV_MAPPING_REQUIRED', { headers });
      throw error;
    }
  }
  const dashboard = headers.length === 5 && ['timestamp', 'x', 'y', 'z', 'strength'].every(h => headers.includes(h));
  let descriptors = [], timeHeader = 'timestamp', idHeader = headers.includes('sample_id') ? 'sample_id' : null;
  const known = new Set(['timestamp', 'sample_id', 'source_sample_id']);
  if (mapping) {
    if (mapping.confirmed !== true || !Array.isArray(mapping.columns) || (mapping.timestamp !== null && !headers.includes(mapping.timestamp)))
      fail('시간 열과 숫자 열의 대응을 확인하세요.', null, 'CSV_MAPPING_REQUIRED', { headers });
    timeHeader = mapping.timestamp; idHeader = mapping.sampleId ?? null;
    known.clear(); known.add(timeHeader); if (idHeader) known.add(idHeader);
    if (idHeader && !headers.includes(idHeader)) fail('자료 번호 열을 확인하세요.');
    descriptors = mapping.columns.map(c => {
      if (!headers.includes(c.header)) fail('대응할 열을 찾지 못했어요.');
      known.add(c.header);
      if (c.validityHeader) { if (!headers.includes(c.validityHeader)) fail('유효성 열을 찾지 못했어요.'); known.add(c.validityHeader); }
      return { ...c, validity: c.validityHeader ?? null, imported: false, meta: null };
    });
    for (const h of mapping.ignoredHeaders ?? []) { if (!headers.includes(h)) fail('제외할 열을 찾지 못했어요.'); known.add(h); }
  } else if (dashboard) {
    descriptors = ['x', 'y', 'z', 'strength'].map(key => ({ id: key, header: key, name: key === 'strength' ? '자기장 크기' : `자기장 ${key.toUpperCase()}`, unit: 'µT', imported: false }));
    descriptors.forEach(d => known.add(d.header));
  } else {
    for (const header of headers) {
      if (known.has(header) || /:(?:validity|reason|meta)$/.test(header)) continue;
      const extra = /^(.*?) \[((?:calc|data)-[\w-]+)\]$/.exec(header);
      const originalId = extra ? extra[2] : header, metaKey = originalId + ':meta', flagKey = originalId + ':validity';
      if (!headers.includes(metaKey) || !headers.includes(flagKey)) continue;
      const meta = readMeta(get, rows[0], metaKey, header), imported = Boolean(extra);
      if (extra && unescapeFormula(extra[1]) !== columnLabel(meta)) fail('열 제목과 이름·단위가 다릅니다.');
      const reason = imported ? originalId + ':reason' : null;
      if (reason && !headers.includes(reason)) fail('계산 결과의 사유 열이 없습니다.');
      const d = { id: originalId.startsWith('calc-') ? 'data-' + originalId : originalId, header, ...meta, validity: flagKey, meta: metaKey, reason, imported };
      descriptors.push(d); [header, metaKey, flagKey, reason].filter(Boolean).forEach(h => known.add(h));
    }
  }
  const unknown = headers.filter(h => !known.has(h));
  if (!descriptors.length || (timeHeader !== null && !headers.includes(timeHeader)) || unknown.length)
    fail('열의 뜻과 단위를 확인한 뒤 가져오세요.', null, 'CSV_MAPPING_REQUIRED', { headers, unknownHeaders: unknown });
  if (descriptors.length > LIMITS.maxChannels || new Set(descriptors.map(d => d.id)).size !== descriptors.length)
    fail('숫자 열은 중복 없이 16개 이하여야 합니다.');
  const channelDefinitions = descriptors.filter(d => !d.imported).map(d => ({ id: d.id, name: d.name, unit: d.unit ?? null,
    quantity: 'imported', supported: true, calculable: true, graphable: true, digits: 3 }));
  const imported = descriptors.filter(d => d.imported).map(({ id: key, name, unit }) => ({ id: key, name, unit }));
  const seenIds = new Set();
  const samples = rows.map((row, i) => {
    const ordinal = i + 1, sample = { runId: id, sampleId: ordinal, receivedAt: timeHeader === null ? null : timestamp(get(row, timeHeader), ordinal), values: {}, validity: {} };
    if (idHeader) {
      const source = number(get(row, idHeader), idHeader, ordinal, false);
      if (!Number.isSafeInteger(source) || source <= 0 || seenIds.has(source)) fail('자료 번호는 중복 없는 양의 정수여야 합니다.', ordinal);
      seenIds.add(source); sample.sourceSampleId = source;
    }
    if (headers.includes('source_sample_id') && !mapping) {
      const source = number(get(row, 'source_sample_id'), 'source_sample_id', ordinal, false);
      if (!Number.isSafeInteger(source) || source <= 0) fail('원본 자료 번호를 확인하세요.', ordinal);
      sample.sourceSampleId = source;
    }
    if (imported.length) sample.importedValues = {};
    for (const d of descriptors) {
      const value = number(get(row, d.header), d.name, ordinal);
      if (d.meta) {
        const meta = readMeta(get, row, d.meta, d.name);
        if (meta.name !== d.name || meta.unit !== d.unit) fail(`${d.name} 열 정보가 행마다 다릅니다.`, ordinal);
      }
      if (d.imported) {
        const flag = get(row, d.validity).trim(), reason = unescapeFormula(get(row, d.reason));
        if ((value === null && flag !== 'invalid') || (value !== null && (flag !== 'valid' || reason.trim()))) fail(`${d.name}의 값·유효성·사유가 일치하지 않습니다.`, ordinal);
        sample.importedValues[d.id] = { value, reason: value === null ? reason || 'CSV에 값이 없습니다.' : null };
      } else {
        const flag = d.validity ? get(row, d.validity).trim() : value === null ? 'missing' : 'valid';
        if (!(value === null ? ['missing', 'unsupported', 'error'].includes(flag) : ['valid', 'out-of-range', 'error'].includes(flag))) fail(`${d.name}의 값·유효성이 일치하지 않습니다.`, ordinal);
        sample.values[d.id] = value; sample.validity[d.id] = flag;
      }
    }
    return sample;
  });
  const missingTimestamps = samples.some(s => s.receivedAt === null);
  const context = { sensor: { id: 'csv-import', version: 1, name: dashboard ? '기존 자기장 자료' : 'CSV 자료' }, activity: null,
    channels: channelDefinitions, firmware: null, classConfig: null, setup: {}, analysisTemplates: [],
    defaultGraph: { xColumnId: missingTimestamps ? 'sampleId' : 'receivedAt', yColumnId: channelDefinitions[0]?.id, type: missingTimestamps ? 'scatter' : 'line', connectGaps: false, view: 'measured' } };
  return validateExperimentSnapshot({ run: { id, schemaVersion: 1, runRevision: 1,
    name: filename.replace(/\.csv$/i, '').slice(0, 100) || '가져온 CSV 자료', createdAt: now, updatedAt: now,
    status: 'complete', source: 'import', context, importedColumns: imported,
    csvImport: { filename, format: dashboard ? 'microbit-dashboard-csv' : mapping ? 'mapped-csv' : 'microbit-sensor-lab-csv', missingTimestamps },
    lastSavedSampleId: samples.length, lastSavedEventId: 0 }, samples, events: [], workspace: null });
}
