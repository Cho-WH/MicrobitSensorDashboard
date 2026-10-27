import { wirelessFirmware } from './wireless-firmware.js';
import { staleFirmware } from './stale-firmware.js';
// Only current releases enter the installation allowlist.
const freeze = value => { Object.values(value).forEach(child => { if (child && typeof child === 'object') freeze(child); }); return Object.freeze(value); };
export const firmwareManifest = freeze(Object.fromEntries(Object.entries(wirelessFirmware).map(([id, next]) => [id, {
  ...next, stale: false, url: new URL('../../public/firmware/' + next.fileName, import.meta.url).href,
  verification: { hexReader: 'official-v2-reader', embeddedSource: 'exact-normalized-match', embeddedConfig: 'matched', hardware: 'product-acceptance-pending' },
  partial: { ...next.partial, url: new URL('../../public/firmware/' + next.partial.file, import.meta.url).href },
}])));
function unknownFirmware() {
  return Object.assign(new Error('선택한 센서의 프로그램 버전을 찾지 못했어요.'), { code: 'unknown-firmware' });
}
export function getFirmwareArtifact(id, version = null) {
  const artifact = typeof id === 'string' && Object.hasOwn(firmwareManifest, id) ? firmwareManifest[id] : null;
  if (!artifact || (version !== null && artifact.version !== version)) throw unknownFirmware();
  return artifact;
}
// An explicit historical identity permits compatible records to resume with an
// already-installed board. It never grants permission to download or install.
export function getFirmwareIdentity(id, version) {
  const stale = staleFirmware.find(item => item.id === id && item.version === version);
  return stale ?? getFirmwareArtifact(id, version);
}
