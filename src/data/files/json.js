import { validateExperimentSnapshot, checkFileSize, checkJson, requireValue } from './validation.js';
import { parseLegacyGayLussac } from './legacy-gay-lussac.js';

export function buildExperimentJson(snapshot) {
  const data = validateExperimentSnapshot(snapshot);
  const text = JSON.stringify({ format: 'microbit-sensor-lab', fileVersion: 1, ...data });
  checkFileSize(text);
  return text;
}

export function parseExperimentJson(text) {
  checkFileSize(text);
  let file;
  try { file = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw Object.assign(new Error('JSON 파일을 읽지 못했어요. 전체 실험 JSON 파일을 선택하세요.'), { code: 'INVALID_JSON' }); }
  checkJson(file);
  if (file?.format === 'gay-lussac-experiment') return parseLegacyGayLussac(file);
  requireValue(file?.format === 'microbit-sensor-lab' && file.fileVersion === 1, '지원하는 전체 실험 JSON 형식·버전이 아닙니다.');
  return validateExperimentSnapshot({ run: file.run, samples: file.samples, events: file.events, workspace: file.workspace });
}

// Pure preparation: callers acquire the new Run lock and write this result atomically.
/** @param {any} snapshot @param {{newId?:()=>string,now?:()=>number}} [options] */
export function prepareImportedSnapshot(snapshot, { newId = () => crypto.randomUUID(), now = () => Date.now() } = {}) {
  const data = validateExperimentSnapshot(snapshot), original = data.run, id = newId();
  requireValue(typeof id === 'string' && id.length > 0 && id !== original.id, '가져올 실험에 새로운 ID가 필요합니다.');
  const remap = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'runId' && child === original.id) value[key] = id;
      else if (!['provenance', 'importedFrom'].includes(key)) remap(child);
    }
  };
  remap(data);
  data.run = { ...original, id, source: 'import', runRevision: 1,
    importedFrom: { runId: original.id, source: original.importedFrom?.source ?? original.source, importedAt: now() },
    lastSavedSampleId: data.samples.length, lastSavedEventId: data.events.length };
  return validateExperimentSnapshot(data);
}
