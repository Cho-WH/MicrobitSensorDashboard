import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { createTrialBridge, bridgePath } from '../../dev/bluetooth-install/bridge-server.mjs';
async function setup(t) {
  let time = 100000;
  const handler = createTrialBridge({ now: () => time });
  const server = createServer((req, res) => void handler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, headers = {}) => {
    if (headers.Host) return new Promise((resolve, reject) => {
      const req = httpRequest(origin + bridgePath + path, { headers }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode })); });
      req.on('error', reject); req.end();
    });
    const r = await fetch(origin + bridgePath + path, body === undefined ? { headers } : { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sensor-Lab-Trial': '1', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  return { request, advance: ms => { time += ms; } };
}
test('bridge requires local origin, explicit headers, one armed page and registered commands', async t => {
  const { request } = await setup(t);
  assert.equal((await request('/open', {}, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await request('/open', {}, { 'X-Sensor-Lab-Trial': '' })).status, 403);
  assert.equal((await request('/status', undefined, { Host: 'attacker.example' })).status, 403);
  assert.equal((await request('/command', { action: 'run', plan: 'quick' })).status, 409);
  const { session } = (await request('/open', {})).data;
  assert.equal((await request('/open', {})).status, 409);
  assert.equal((await request('/poll', { session: 'wrong' })).status, 409);
  await request('/poll', { session, snapshot: { armed: true, busy: false } });
  assert.equal((await request('/command', { action: 'eval', code: 'anything' })).status, 400);
  assert.equal((await request('/command', { action: 'run', plan: '__proto__' })).status, 400);
  assert.equal((await request('/command', { action: 'run', plan: 'connect-6s' })).status, 400);
  for (const plan of ['connect-3s']) {
    const result = await request('/command', { action: 'run', plan });
    assert.equal(result.status, 200);
    await request('/poll', { session, snapshot: { armed: true, busy: false } });
    await request('/poll', { session, snapshot: { armed: true, busy: false }, completed: [{ id: result.data.id, status: 'passed' }] });
  }
});
test('commands deliver once, busy rejects duplicates, cancellation and completion settle', async t => {
  const { request } = await setup(t);
  const { session } = (await request('/open', {})).data;
  const poll = (busy, completed = []) => request('/poll', { session, snapshot: { armed: true, busy }, completed });
  await poll(false);
  const command = (await request('/command', { action: 'run', plan: 'quick' })).data;
  assert.equal((await request('/command', { action: 'run', plan: 'quick' })).status, 409);
  assert.equal((await poll(false)).data.command.id, command.id);
  assert.equal((await poll(true)).data.command, null);
  const cancel = (await request('/command', { action: 'cancel' })).data;
  assert.equal((await poll(true)).data.command.id, cancel.id);
  await poll(false, [{ id: command.id, status: 'cancelled' }, { id: cancel.id, status: 'cancel-requested' }]);
  assert.equal((await request('/status')).data.busy, false);
  assert.equal((await request('/command', { action: 'diagnose' })).status, 200);
});
test('stale pages cannot execute queued commands and logs survive a new session', async t => {
  const { request, advance } = await setup(t);
  const { session } = (await request('/open', {})).data;
  await request('/poll', { session, snapshot: { armed: true, busy: false, log: { evidence: 'preserved' } } });
  await request('/command', { action: 'run', plan: 'quick' });
  advance(5001);
  assert.equal((await request('/status')).data.online, false);
  assert.equal((await request('/poll', { session, snapshot: { armed: true, busy: false } })).status, 409);
  assert.equal((await request('/log')).data.snapshot.log.evidence, 'preserved');
  const next = (await request('/open', {})).data.session;
  assert.equal((await request('/poll', { session: next, snapshot: { armed: false, busy: false } })).data.command, null);
  assert.equal((await request('/log')).data.previousSnapshot.log.evidence, 'preserved');
});
