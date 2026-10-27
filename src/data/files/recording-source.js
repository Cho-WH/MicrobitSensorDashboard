import { getSensorRuntime } from '../../catalog/index.js';

// Import compatibility boundary shared by connection, recording and raw-data admission.
// Stored source metadata is compatibility evidence, never executable device configuration.
export function canResumeImportedRun(run) {
  if (run?.source !== 'import' || run.importedFrom?.source !== 'device') return false;
  try {
    const { definition } = getSensorRuntime(run.context), context = run.context;
    if (context.firmware.sha256 !== definition.firmware.sha256
      || context.channels.some((channel, i) => ['unit', 'quantity', 'min', 'max'].some(key => channel[key] !== definition.channels[i][key]))) return false;
    // The legacy adapter resolves its registered historical firmware; also check the original program.
    if (run.provenance?.format === 'gay-lussac-experiment') {
      const profile = run.profile;
      if (run.program?.sha256 !== definition.firmware.sha256 || profile?.id !== definition.codecId
        || profile.fieldCount !== 3 || profile.humiditySupported !== false
        || JSON.stringify(profile.temperatureRange) !== '[-40,85]' || JSON.stringify(profile.pressureRange) !== '[300,1100]') return false;
    }
    return true;
  } catch { return false; }
}
