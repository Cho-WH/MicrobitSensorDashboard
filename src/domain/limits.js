/** Shared admission limits for live records and imported/exported experiments. */
export const LIMITS = Object.freeze({
  fileBytes: 32 * 1024 * 1024, maxFileBytes: 32 * 1024 * 1024,
  samples: 100000, maxSamples: 100000,
  channels: 16, maxChannels: 16,
  calculatedColumns: 32, maxCalculatedColumns: 32,
});
