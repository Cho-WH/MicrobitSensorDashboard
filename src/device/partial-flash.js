// CODAL V2 PFS v1. Sources: docs/sensor-program-installation-roadmap.md §7.
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const error = message => Object.assign(new Error(message), { code: 'flash-blocked' });

export async function verifyProgram(target, input) {
  if (!target || !(input instanceof Uint8Array)) throw error('등록된 프로그램 파일을 선택하세요.');
  const data = input.slice(); // Do not retain a buffer the caller can mutate during transfer.
  if (data.length !== target.bytes || data.length % 64 || target.end !== target.start + data.length
    || target.start !== 0x49000 || target.end > 0x73000) throw error('프로그램 파일 크기·전송 범위가 올바르지 않습니다.');
  const digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
  if (digest !== target.sha256 || hex(data.slice(0, 16)) !== '708e3b92c615a841c49866c975ee5197'
    || hex(data.slice(16, 24)) !== target.runtimeHash || hex(data.slice(24, 32)) !== target.programHash)
    throw error('프로그램 파일 검증에 실패했습니다. 파일을 다시 빌드하세요.');
  return { target, data };
}

export function partialFlashProblem(report, target) {
  if (!target || !report || !/\bV2\b/i.test(report.info?.model ?? '')) return 'V2 보드를 먼저 진단하세요.';
  if (report.status?.protocol !== 1 || report.services?.partial?.state !== 'available') return '지원하는 전송 서비스를 확인하지 못했습니다.';
  if (report.status.mode !== 0) return '먼저 설치 모드로 전환하고 재연결하세요.';
  const runtime = report.regions?.[1], program = report.regions?.[2];
  if (!runtime?.valid || !program?.valid) return '보드 영역 정보를 확인하지 못했습니다. USB로 프로그램을 설치하세요.';
  if (runtime.hash !== target.runtimeHash || runtime.start !== 0x1c000 || runtime.end > target.start)
    return '런타임이 다른 보드입니다. USB로 프로그램을 먼저 설치하세요.';
  if (program.start !== target.start || target.end > program.end || program.end > 0x73000)
    return '보드와 파일의 프로그램 영역이 일치하지 않습니다. USB로 설치하세요.';
  return '';
}

export function blockPackets(data, offset, address, sequence) {
  if (!(data instanceof Uint8Array) || offset < 0 || offset % 64 || offset + 64 > data.length
    || !Number.isInteger(address) || address % 64 || address < 0x49000 || address + 64 > 0x73000)
    throw error('전송 블록이 프로그램 영역을 벗어났습니다.');
  return Array.from({ length: 4 }, (_, i) => {
    const packet = new Uint8Array(20), view = new DataView(packet.buffer);
    packet[0] = 1; view.setUint16(1, i === 0 ? address & 0xffff : address >>> 16);
    packet[3] = (sequence + i) & 255;
    packet.set(data.subarray(offset + i * 16, offset + (i + 1) * 16), 4);
    return packet;
  });
}

export function parseWriteAck(bytes) {
  if (![2, 20].includes(bytes.length) || bytes[0] !== 1 || ![0xff, 0xaa].includes(bytes[1]))
    throw error('전송 응답이 올바르지 않습니다. USB 복구 또는 재연결이 필요합니다.');
  return bytes[1];
}

// Only explicit NACKs are retried; a timeout has no request ID and must retire the connection.
export async function transferProgram({ target, data }, { sendBlock, finish, progress = (_value) => {} }) {
  let sequence = 0, retries = 0;
  for (let offset = 0; offset < data.length; offset += 64) {
    let accepted = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const packets = blockPackets(data, offset, target.start + offset, sequence);
      sequence = (sequence + 4) & 255;
      const ack = await sendBlock(packets);
      if (ack === 0xff) { accepted = true; break; }
      if (ack !== 0xaa) throw error('알 수 없는 전송 응답입니다.');
      retries++;
    }
    if (!accepted) throw error('같은 블록의 전송이 반복해서 실패했습니다. USB로 복구하세요.');
    progress({ sent: offset + 64, total: data.length, retries });
  }
  await finish();
  return { id: target.id, sent: data.length, retries, verified: false };
}
