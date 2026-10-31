import { assetUrl } from '../app/asset-url.js';
import { wirelessFirmware } from './wireless-firmware.js';
import { staleFirmware } from './stale-firmware.js';
import { reuseFirmware } from './firmware-cache.js';
// Only current releases enter the installation allowlist.
const freeze = value => { Object.values(value).forEach(child => { if (child && typeof child === 'object') freeze(child); }); return Object.freeze(value); };
export const firmwareManifest = freeze(Object.fromEntries(Object.entries(wirelessFirmware).map(([id, next]) => [id, {
  ...next, stale: false, url: assetUrl('../../public/firmware/' + next.fileName, import.meta.url).href,
  verification: { hexReader: 'official-v2-reader', embeddedSource: 'exact-normalized-match', embeddedConfig: 'matched', hardware: 'product-acceptance-pending' },
  partial: { ...next.partial, url: assetUrl('../../public/firmware/' + next.partial.file, import.meta.url).href },
}])));
function unknownFirmware() {
  return Object.assign(new Error('선택한 센서의 프로그램 버전을 찾지 못했어요.'), { code: 'unknown-firmware' });
}
export function getFirmwareArtifact(id, version = null) {
  const artifact = typeof id === 'string' && Object.hasOwn(firmwareManifest, id) ? firmwareManifest[id] : null;
  if (!artifact || (version !== null && artifact.version !== version)) throw unknownFirmware();
  return artifact;
}
// Direct installation and manual download use the same allowlist and integrity rule.
export async function loadFirmwareHex(id, version = null, { fetchFile = globalThis.fetch, crypto = globalThis.crypto, signal = undefined } = {}) {
  const program = getFirmwareArtifact(id, version);
  return reuseFirmware(`hex:${program.id}:${program.version}:${program.sha256}`, [fetchFile, crypto], async () => {
    const response = await fetchFile(program.url);
    if (!response.ok) throw new Error('프로그램 파일을 불러오지 못했어요. 연결을 확인하고 다시 시도하세요.');
    const bytes = await response.arrayBuffer();
    const hex = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hex)));
    const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
    if (program.digestMode !== 'utf8-crlf-to-lf' || hash !== program.sha256)
      throw new Error('프로그램 파일 확인에 실패했어요. 화면을 새로고침한 뒤 다시 시도하세요.');
    return Object.freeze({ hex, fileName: program.fileName });
  }, signal);
}
// An explicit historical identity permits compatible records to resume with an
// already-installed board. It never grants permission to download or install.
export function getFirmwareIdentity(id, version) {
  const stale = staleFirmware.find(item => item.id === id && item.version === version);
  return stale ?? getFirmwareArtifact(id, version);
}
