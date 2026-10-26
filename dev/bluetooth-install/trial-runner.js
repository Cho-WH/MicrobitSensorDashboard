// Development-only orchestration. Transport/integrity checks remain in existing modules.
import { createBleClient } from '../../src/device/ble-client.js';
import { trialPrograms } from './firmware/programs.js';
import { loadTrialProgram, partialFlashProblem } from './partial-flash.js';
import { testPlans, decodeTrialSample } from './test-plans.js';
import { runConnectionTrial } from './connection-trial.js';
import { reconnectPolicy, retryConnection, requireDiagnosticReady } from './connection-retry.js';

const failure = (message, code = 'trial-failed') => Object.assign(new Error(message), { code });
export function identifyTrial(report) {
  return trialPrograms.find(p => p.runtimeHash === report?.regions?.[1]?.hash && p.programHash === report?.regions?.[2]?.hash);
}

export function createTrialRunner({ diagnostic, onEvent = () => {}, onState = () => {}, onOwner = () => {},
  createClient = createBleClient, loadImage = loadTrialProgram, retryDelaysMs = reconnectPolicy.delaysMs, sampleTimeoutMs = 10000 } = {}) {
  let active = null, state = { status: 'idle', steps: [] };
  const publish = patch => { Object.assign(state, patch); onState(structuredClone(state)); };
  function check(ctx) { if (active !== ctx || ctx.abort.signal.aborted) throw failure('시험을 중단했습니다.', 'cancelled'); }
  function wait(ctx, promise, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const done = (error, value) => { clearTimeout(timer); ctx.abort.signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(value); };
      const aborted = () => done(failure('시험을 중단했습니다.', 'cancelled'));
      const timer = setTimeout(() => done(failure('응답 시간이 초과됐습니다.', 'timeout')), timeout);
      ctx.abort.signal.addEventListener('abort', aborted, { once: true });
      Promise.resolve(promise).then(value => { try { check(ctx); done(null, value); } catch (e) { done(e); } }, error => done(error));
      if (ctx.abort.signal.aborted) aborted();
    });
  }
  const pause = (ctx, ms) => wait(ctx, new Promise(resolve => setTimeout(resolve, ms)), ms + 1000);
  async function readBoard(ctx, reconnect = false) {
    return retryConnection(async () => {
      check(ctx); onOwner(diagnostic);
      if (!diagnostic.connected) await diagnostic.connect(ctx.device);
      check(ctx); const report = await diagnostic.diagnose(); check(ctx);
      requireDiagnosticReady(report); return report;
    }, { phase: reconnect || 'partial-diagnose', check: () => check(ctx), cleanup: () => diagnostic.disconnect(),
      pause: ms => pause(ctx, ms), onEvent, delaysMs: retryDelaysMs });
  }
  function releaseUart(ctx) {
    const client = ctx.client; ctx.client = null;
    if (!client) return;
    // Retire the client immediately; late OS connections must not remain attached.
    ctx.device.gatt?.disconnect(); void client.disconnect().catch(() => {});
  }
  async function openUart(ctx, onLine, onDisconnected) {
    return retryConnection(async attempt => {
      check(ctx);
      const client = createClient(); ctx.client = client; onOwner(client);
      let ready = false;
      client.setDisconnectedListener(() => { if (ready) onDisconnected(); });
      try {
        const connecting = client.connect(ctx.device, { reuseConnection: attempt === 1,
          serviceDiscoveryTimeoutMs: reconnectPolicy.serviceDiscoveryTimeoutMs });
        const ownerConnectionId = ctx.device.gatt?.__trialConnectionId;
        connecting.finally(() => {
          if (active !== ctx && !active && ctx.device.gatt?.connected) {
            onEvent({ kind: 'trace-late-cleanup', reason: 'runner UART connect completed after trial ended', ownerConnectionId });
            ctx.device.gatt.disconnect();
          }
        }).catch(() => {});
        await wait(ctx, connecting);
        await wait(ctx, client.startNotifications(line => {
          if (active === ctx && ctx.client === client && !ctx.abort.signal.aborted) onLine(line);
        }));
        if (!ctx.device.gatt?.connected) throw failure('측정 연결 준비 중 연결이 끊겼습니다.', 'uart-disconnected');
        ready = true; return client;
      } catch (error) { releaseUart(ctx); throw error; }
    }, { phase: 'partial-uart-prepare', check: () => check(ctx), cleanup: () => releaseUart(ctx),
      pause: ms => pause(ctx, ms), onEvent, delaysMs: retryDelaysMs });
  }
  async function receive(ctx, target) {
    await diagnostic.releaseConnection(); check(ctx);
    onEvent({ kind: 'trial-handoff', from: 'diagnostic', to: 'uart', connected: ctx.device.gatt?.connected === true });
    let resolveSample, rejectSample, resolveChoice, resolveSkipped;
    const samples = [], choice = new Promise(resolve => { resolveChoice = resolve; }), skipped = new Promise(resolve => { resolveSkipped = resolve; });
    const received = new Promise((resolve, reject) => { resolveSample = resolve; rejectSample = reject; });
    received.catch(() => {});
    try {
      let accepting = false;
      const client = await openUart(ctx, line => {
        onEvent({ kind: 'trial-uart-line', id: target.id, line });
        if (line === '@mag,2,choice') resolveChoice();
        if (line === '@mag,2,skipped') resolveSkipped();
        if (!accepting) return;
        const { decoded, valid } = decodeTrialSample(target.id, line);
        if (decoded?.type === 'device-status') return;
        if (!valid) { rejectSample(failure('결측·형식 오류·범위 밖 측정값을 수신했습니다.')); return; }
        if (samples.length < 3) samples.push({ raw: line, values: decoded.values });
        publish({ samples: samples.length, lastLine: line });
        if (samples.length === 3) resolveSample();
      }, () => rejectSample(failure('측정 중 연결이 끊겼습니다.')));
      if (target.id === 'magnetometer') {
        await wait(ctx, client.sendStartCommand('prepare')); await wait(ctx, choice);
        onEvent({ kind: 'trial-calibration-skipped', reason: '수신 시험; 보정 정확도 미검증' });
        accepting = true;
        await wait(ctx, client.sendStartCommand('skip')); await wait(ctx, skipped);
      } else {
        accepting = true;
        await wait(ctx, client.sendStartCommand(target.id === 'bmp280' ? 'bme' : 'start'));
      }
      await wait(ctx, received, sampleTimeoutMs);
      await wait(ctx, client.sendStartCommand('stop'));
      await wait(ctx, client.releaseConnection()); check(ctx);
      ctx.client = null; onOwner(diagnostic);
      await wait(ctx, diagnostic.connect(ctx.device, { reuseConnection: true }));
      onEvent({ kind: 'trial-handoff', from: 'uart', to: 'diagnostic', connected: ctx.device.gatt?.connected === true });
      return samples;
    } finally { releaseUart(ctx); }
  }
  async function run(device, planId) {
    if (active) throw failure('이미 시험 중입니다.');
    if (!device || !Object.hasOwn(testPlans, planId)) throw failure('장치와 시험을 선택하세요.');
    const ctx = { device, abort: new AbortController(), client: null }; active = ctx;
    state = { status: 'running', reconnectPolicy, plan: planId, device: { id: device.id, name: device.name }, startedAt: new Date().toISOString(), steps: [] };
    publish({ stage: '파일 검사', target: null, progress: 0 });
    onEvent({ kind: 'trial-start', plan: planId, device: state.device });
    try {
      const plan = testPlans[planId];
      if (plan.connectionOnly) {
        publish({ stage: '현재 프로그램·모드 확인', connectionResults: [] });
        const report = await readBoard(ctx);
        if (!identifyTrial(report)) throw failure('등록된 시험본에서만 연결 비교를 실행하세요.');
        const results = await runConnectionTrial({ diagnostic, device, initialReport: report,
          check: () => check(ctx), onEvent,
          onStage: stage => publish({ stage }),
          onResult: result => publish({ connectionResults: [...state.connectionResults, result] }) });
        const passed = results.every(result => result.status === 'passed');
        publish({ status: passed ? 'passed' : 'failed', progress: 100,
          stage: passed ? '연결 비교 완료 · 일반 모드 복귀 확인' : '연결 비교 중단',
          ...(passed ? {} : { error: results.at(-1).error }) });
      } else {
        // Preflight every file before the first mode request/write, including the return image.
        const images = [];
        for (const id of testPlans[planId].targets) { images.push(await wait(ctx, loadImage(id))); check(ctx); }
        let report = await readBoard(ctx);
        if (!identifyTrial(report)) throw failure('등록된 시험본이 아닙니다. USB로 시험본 B를 먼저 설치하세요.');
        for (const image of images) {
          check(ctx);
          const { target } = image;
          const problem = partialFlashProblem({ ...report, status: { ...report.status, mode: 0 } }, target);
          if (problem || ![0, 1].includes(report.status?.mode)) throw failure(problem || '보드 모드를 확인할 수 없습니다.');
          publish({ target: target.id, stage: '설치 모드', progress: 0, samples: 0, lastLine: null });
          if (report.status.mode !== 0) {
            const previousIdentity = [report.regions[1].hash, report.regions[2].hash];
            await diagnostic.reset(0, { candidateConfirmed: true, waitForDisconnect: true, allowDisconnectTimeout: true }); check(ctx);
            report = await readBoard(ctx, 'partial-install-mode');
            if (report.status?.mode !== 0) throw failure('재연결 후 설치 모드가 확인되지 않았습니다.');
            if (report.regions?.[1]?.hash !== previousIdentity[0] || report.regions?.[2]?.hash !== previousIdentity[1])
              throw failure('설치 모드 진입 후 기존 런타임·프로그램 식별값이 달라졌습니다.');
          }
          publish({ stage: '부분 전송' });
          await diagnostic.flash(target.id, image.data, {
            progress: p => { check(ctx); publish({ progress: Math.round(p.sent / p.total * 100) }); },
            finishing: () => publish({ stage: '전송 완료 · 보드 연결 해제 이벤트 대기' }),
          });
          publish({ stage: '재연결·프로그램 확인' });
          report = await readBoard(ctx, 'partial-post-install');
          if (report.status?.mode !== 1 || identifyTrial(report)?.id !== target.id)
            throw failure('재연결 후 대상 프로그램·일반 실행이 확인되지 않았습니다.');
          onEvent({ kind: 'trial-program-verified', id: target.id, programHash: target.programHash, sha256: target.sha256 });
          publish({ stage: '측정값 3개 수신' });
          const samples = await receive(ctx, target);
          state.steps.push({ id: target.id, status: 'passed', programHash: target.programHash, sha256: target.sha256, samples,
            scope: '프로그램 식별·측정값 형식/범위; 물리 정확도 검증 아님' });
          onEvent({ kind: 'trial-step-passed', id: target.id, samples });
          report = await readBoard(ctx);
        }
        publish({ status: 'passed', stage: '왕복 교체·수신 확인' });
      }
    } catch (error) {
      publish({ status: ctx.abort.signal.aborted ? 'cancelled' : 'failed', error: error.message,
        stage: '중단 · 현재 보드 상태를 진단하고 필요하면 USB로 복구하세요.' });
    } finally {
      releaseUart(ctx);
      const connectionRetained = state.status === 'passed' && !ctx.abort.signal.aborted
        && diagnostic.connected && ctx.device.gatt?.connected === true;
      if (connectionRetained) {
        onOwner(diagnostic);
        onEvent({ kind: 'trace-trial-connection-retained', ownerConnectionId: ctx.device.gatt.__trialConnectionId });
      } else {
        diagnostic.disconnect(); ctx.device.gatt?.disconnect(); onOwner(null);
      }
      active = null; publish({ endedAt: new Date().toISOString(), connectionRetained });
      onEvent({ kind: 'trial-ended', result: structuredClone(state) });
    }
    return structuredClone(state);
  }
  return { run, get running() { return !!active; }, get state() { return structuredClone(state); }, cancel() {
    if (!active) return;
    active.abort.abort(); diagnostic.disconnect(); releaseUart(active); active.device.gatt?.disconnect();
  } };
}
