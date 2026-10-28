import { RUN_SCHEMA_VERSION } from '../domain/contracts.js';

// Used by the v1 file boundary and the IndexedDB upgrade transaction. Raw arrays are untouched.
export function upgradeRun(run) {
  if (run.schemaVersion !== 1) return run;
  if (['recordingMode', 'manualColumns', 'pointDataRevision'].some(key => Object.hasOwn(run, key)))
    throw new Error('구형 실험에 새 기록 형식이 섞여 있습니다.');
  const deviceSource = ['device', 'replay'].includes(run.source)
    || (run.source === 'import' && ['device', 'replay'].includes(run.importedFrom?.source));
  return { ...run, schemaVersion: RUN_SCHEMA_VERSION, recordingMode: deviceSource ? 'continuous' : null,
    manualColumns: [], pointDataRevision: 0 };
}

export function upgradeWorkspace(workspace) {
  if (workspace == null) return null;
  if (Object.hasOwn(workspace, 'bySource')) throw new Error('구형 분석에 새 기록 형식이 섞여 있습니다.');
  return { runId: workspace.runId, envelopeRevision: 1, activeSourceId: 'recorded', bySource: { recorded: workspace } };
}
