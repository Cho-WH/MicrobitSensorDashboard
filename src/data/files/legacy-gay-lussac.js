// Legacy boundary for Cho-WH/bme280 59c5c149450f970bace2deaa183857c275595853.
import { getExperiment } from '../../catalog/index.js';
import { unpackSamples } from './compact-samples.js';
import { checkJson, requireValue, object, validateExperimentSnapshot } from './validation.js';

export function parseLegacyGayLussac(file) {
  requireValue(file?.format === 'gay-lussac-experiment' && [1, 2].includes(file.version), '지원하는 전체 실험 JSON 형식·버전이 아닙니다.');
  checkJson(file.snapshot);
  const old = file.version === 2 ? unpackSamples(file.snapshot) : structuredClone(file.snapshot);
  requireValue(object(old) && object(old.run) && old.run.schemaVersion === 2
    && object(old.run.program) && object(old.run.profile) && Array.isArray(old.samples), '게이뤼삭 실험 정보·버전을 확인하세요.');
  for (const s of old.samples) requireValue(object(s) && Number.isFinite(s.receivedAt) && object(s.validity) && ['temperatureC', 'pressureHpa'].every(id =>
    (Number.isFinite(s[id]) && ['valid', 'out-of-range'].includes(s.validity[id]))
      || (s[id] === null && s.validity[id] === 'missing')), '원자료 숫자·유효성 표시를 확인하세요.');
  const snapshot = { ...old, run: { ...old.run, schemaVersion: 1, context: getExperiment('bmp280', 'gay-lussac'),
    provenance: { format: file.format, fileVersion: file.version, schemaVersion: 2, runId: old.run.id } },
    samples: old.samples.map(s => {
      const { temperatureC, pressureHpa, validity, ...rest } = s;
      const legacyValidity = Object.fromEntries(Object.entries(validity).filter(([id]) => !['temperatureC', 'pressureHpa'].includes(id)));
      return { ...rest, values: { temperatureC, pressureHpa }, validity: { temperatureC: validity.temperatureC, pressureHpa: validity.pressureHpa },
        ...(Object.keys(legacyValidity).length ? { rawExtra: {
          ...(rest.rawExtra !== undefined ? { legacyRawExtra: rest.rawExtra } : {}), legacyValidity } } : {}) };
    }) };
  return validateExperimentSnapshot(snapshot);
}
