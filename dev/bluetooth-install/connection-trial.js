// Connection timing only: no program transfer, UART commands, or measured-attempt retry.
export async function runConnectionTrial({ diagnostic, device, initialReport, check,
  onStage, onEvent, onResult, now = () => performance.now() }) {
  if (initialReport.status?.mode !== 1) throw new Error('일반 실행 모드에서 연결 비교를 시작하세요.');
  const identity = [initialReport.regions[1].hash, initialReport.regions[2].hash];
  const verify = (report, mode) => {
    if (report.status?.mode !== mode || report.regions?.[1]?.hash !== identity[0] || report.regions?.[2]?.hash !== identity[1])
      throw new Error('재시작 후 모드 또는 기존 프로그램 식별값이 일치하지 않습니다.');
  };
  const results = [];
  for (const mode of [0, 1]) {
    check(); onStage(`${mode === 0 ? '설치 모드' : '일반 모드'} · 실제 연결 해제 이벤트 대기`);
    const requested = now(), result = { mode, strategy: 'device-disconnect-event', requestedAt: new Date().toISOString(), status: 'running' };
    onEvent({ kind: 'connection-trial-reset', mode, strategy: result.strategy });
    let stage = 'disconnect-event';
    try {
      const disconnected = await diagnostic.reset(mode, { candidateConfirmed: true, waitForDisconnect: true }); check();
      result.disconnectAfterRequestMs = disconnected.elapsedMs;
      result.attemptAfterRequestMs = Math.round(now() - requested);
      onStage(`${mode === 0 ? '설치 모드' : '일반 모드'} · 첫 연결·서비스 조회`);
      onEvent({ kind: 'connection-trial-attempt', ...result });
      stage = 'connect';
      await diagnostic.connect(device); check();
      result.gattResolvedAfterRequestMs = Math.round(now() - requested);
      stage = 'diagnose';
      const report = await diagnostic.diagnose(); check(); verify(report, mode);
      result.diagnosedAfterRequestMs = Math.round(now() - requested);
      result.status = 'passed';
    } catch (error) {
      check(); diagnostic.disconnect();
      Object.assign(result, { status: 'failed', failedStage: stage,
        failedAfterRequestMs: Math.round(now() - requested), error: error.message });
    }
    results.push(result); onResult(structuredClone(result));
    onEvent({ kind: 'connection-trial-result', ...result });
    if (result.status === 'failed') break;
  }
  return results;
}
