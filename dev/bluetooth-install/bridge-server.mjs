// Loopback-only, bounded command mailbox. No eval, arbitrary firmware, or chooser API.
import { randomUUID } from 'node:crypto';
import { validateCommand } from './test-plans.js';
export const bridgePath = '/__dev/bluetooth-trial';
const loopback = value => ['localhost', '127.0.0.1', '[::1]', '::1', '::ffff:127.0.0.1'].includes(value);
export function createTrialBridge({ now = Date.now } = {}) {
  let session = null, snapshot = null, previousSnapshot = null, pending = null, inflight = null, lastCommand = null, seen = 0;
  const fresh = () => !!session && now() - seen < 5000;
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  return async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith(bridgePath)) return false;
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    try {
      const origin = `http://${req.headers.host}`, host = new URL(origin).hostname;
      if (!loopback(req.socket.remoteAddress) || !loopback(host) || (req.headers.origin && req.headers.origin !== origin)
        || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) fail(403, 'localhost의 같은 출처에서만 접근할 수 있습니다.');
      const route = pathname.slice(bridgePath.length);
      let body = {};
      if (req.method === 'POST') {
        if (req.headers['x-sensor-lab-trial'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) fail(403, '명시적인 로컬 시험 요청이 필요합니다.');
        let data = '';
        for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 2_000_000) fail(413, '로그 크기 초과'); }
        try { body = JSON.parse(data); } catch { fail(400, 'JSON 형식 오류'); }
      }
      let result;
      if (req.method === 'GET' && route === '/status') result = { online: fresh(), armed: fresh() && snapshot?.armed === true,
        busy: fresh() && (!!pending || !!inflight || snapshot?.busy === true), state: snapshot?.state ?? null,
        device: snapshot?.device ?? null, lastCommand, updatedAt: seen ? new Date(seen).toISOString() : null };
      else if (req.method === 'GET' && route === '/log') result = { online: fresh(), snapshot, previousSnapshot, lastCommand };
      else if (req.method === 'POST' && route === '/open') {
        if (fresh()) fail(409, '다른 시험 페이지가 연결되어 있습니다. 해당 페이지의 로컬 제어를 먼저 해제하세요.');
        session = randomUUID(); seen = now(); pending = inflight = null;
        if (snapshot?.log) previousSnapshot = snapshot;
        snapshot = { armed: false, busy: false, state: null }; result = { session };
      } else if (req.method === 'POST' && route === '/command') {
        try { validateCommand(body); } catch (e) { fail(400, e.message); }
        if (!fresh() || snapshot?.armed !== true) fail(409, '시험 페이지에서 장치를 선택하고 로컬 제어를 켜세요.');
        if (body.action !== 'cancel' && (pending || inflight || snapshot?.busy)) fail(409, '이전 시험이 진행 중입니다.');
        if (body.action === 'cancel' && pending) lastCommand = { ...pending, status: 'cancelled-before-start' };
        pending = { id: randomUUID(), ...body, createdAt: new Date(now()).toISOString() }; result = pending;
      } else if (req.method === 'POST' && ['/poll', '/close'].includes(route)) {
        if (!session || body.session !== session) fail(409, '시험 세션이 만료됐습니다. 로컬 제어를 다시 켜세요.');
        if (route === '/close') {
          session = null; pending = inflight = null; result = { closed: true };
        } else {
          // A paused/reloaded page must not receive stale commands on its return.
          if (!fresh()) { session = null; pending = inflight = null; fail(409, '시험 페이지 응답이 끊겨 세션을 종료했습니다.'); }
          seen = now(); snapshot = body.snapshot;
          if (!snapshot || typeof snapshot.armed !== 'boolean' || typeof snapshot.busy !== 'boolean') fail(400, '상태 형식 오류');
          for (const done of Array.isArray(body.completed) ? body.completed : []) {
            if (done.id === inflight?.id) { lastCommand = { ...inflight, ...done }; inflight = null; }
          }
          if (!snapshot.armed) pending = null;
          const command = pending; pending = null;
          if (command) { inflight = command; lastCommand = { ...command, status: 'delivered' }; }
          result = { command }; // Delivered once; a lost response is never replayed.
        }
      } else fail(404, '지원하지 않는 시험 경로');
      res.writeHead(200); res.end(JSON.stringify(result));
    } catch (error) { res.writeHead(error.status ?? 500); res.end(JSON.stringify({ error: error.message })); }
    return true;
  };
}
