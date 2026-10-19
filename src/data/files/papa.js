// Keep the pinned UMD library confined to the CSV adapter boundary.
export function papa() {
  if (!globalThis.Papa) throw new Error('CSV 도구를 불러오지 못했어요.');
  return globalThis.Papa;
}
