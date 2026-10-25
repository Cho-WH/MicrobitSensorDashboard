/** Synchronous, permission-free capability check. API presence is not a successful connection.
 * @param {{bluetooth?:any, secure?:boolean, policy?:any}} options
 * @returns {'supported'|'insecure'|'blocked'|'unsupported'}
 */
export function getBluetoothSupport({
  bluetooth = /** @type {any} */ (globalThis.navigator)?.bluetooth,
  secure = globalThis.isSecureContext,
  policy = /** @type {any} */ (globalThis.document)?.permissionsPolicy ?? /** @type {any} */ (globalThis.document)?.featurePolicy,
} = {}) {
  if (secure === false) return 'insecure';
  if (typeof bluetooth?.requestDevice !== 'function') return 'unsupported';
  try { if (policy?.allowsFeature('bluetooth') === false) return 'blocked'; }
  catch { /* Older browsers may not expose this policy; connection errors remain authoritative. */ }
  return 'supported';
}

// Used only to choose help text. iPad desktop mode can identify itself as a Mac.
export function isAppleMobile({ userAgent = '', platform = '', maxTouchPoints = 0 } = globalThis.navigator ?? {}) {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}
