// micro:bit V2 application DFU format; pinned upstream references in README.md.
export const appStart = 0x1c000, appLimit = 0x77000;
export const bytesHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export async function digest(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}
export async function createInitPacket(data) {
  if (!(data instanceof Uint8Array) || !data.length || data.length % 4 || data.length > appLimit - appStart)
    throw new Error('V2 애플리케이션 크기가 올바르지 않습니다.');
  const result = new Uint8Array(56), view = new DataView(result.buffer);
  result.set(new TextEncoder().encode('microbit_app'));
  view.setUint32(12, 1, true); view.setUint32(16, data.length, true); view.setUint32(20, 32, true);
  result.set((await digest(data)).reverse(), 24); // Never use the hash_size=0 bypass.
  return result;
}
export async function verifyFullImage(target, input, initInput) {
  if (!target || !(input instanceof Uint8Array) || !(initInput instanceof Uint8Array)) throw new Error('등록된 전체 시험 파일이 필요합니다.');
  const data = input.slice(), init = initInput.slice();
  if (target.start !== appStart || target.end !== appStart + data.length || target.end > appLimit
      || data.length !== target.bytes || data.length % 4 || data.length < 32)
    throw new Error('전체 이미지 영역·크기가 일치하지 않습니다.');
  if (bytesHex(await digest(data)) !== target.sha256 || bytesHex(await digest(init)) !== target.initSha256)
    throw new Error('전체 시험 파일 SHA-256이 일치하지 않습니다.');
  const expected = await createInitPacket(data);
  if (init.length !== expected.length || !init.every((b, i) => b === expected[i])) throw new Error('DFU 초기화 자료가 이미지와 일치하지 않습니다.');
  const vector = new DataView(data.buffer), stack = vector.getUint32(0, true), reset = vector.getUint32(4, true);
  if (stack < 0x20000000 || stack > 0x20020000 || !(reset & 1) || reset < appStart || reset >= target.end)
    throw new Error('V2 실행 벡터가 올바르지 않습니다.');
  return { target, data, init };
}
