const base = '/__dev/bluetooth-trial';
export function createBridgeClient({ snapshot, execute, onStatus, onLost }) {
  let session = null, timer = null, completed = [], generation = 0;
  async function post(path, body) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sensor-Lab-Trial': '1' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(2500), keepalive: path === '/close' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
  }
  async function poll(token) {
    if (token !== generation || !session) return;
    try {
      const sent = completed.slice();
      const { command } = await post('/poll', { session, snapshot: snapshot(), completed: sent });
      if (token !== generation) return;
      completed = completed.filter(item => !sent.includes(item));
      if (command) {
        // Polling continues during long BLE operations so cancel/status stay available.
        void Promise.resolve().then(() => execute(command)).then(
          result => { if (token === generation) completed.push({ id: command.id, status: result?.status ?? 'completed' }); },
          error => { if (token === generation) completed.push({ id: command.id, status: 'failed', error: error.message }); });
      }
      timer = setTimeout(() => void poll(token), 750);
    } catch (error) {
      if (token !== generation) return;
      const previous = session; session = null; generation++; completed = [];
      void post('/close', { session: previous }).catch(() => {});
      onStatus(`로컬 제어 끊김: ${error.message}`); onLost();
    }
  }
  return { get connected() { return !!session; }, async open() {
    const token = ++generation; const result = await post('/open', {});
    if (token !== generation) { void post('/close', result).catch(() => {}); return; }
    session = result.session; onStatus('로컬 제어 연결됨 · 명령과 결과를 이 컴퓨터에서만 교환합니다.'); void poll(token);
  }, close() {
    clearTimeout(timer); ++generation; const previous = session; session = null; completed = [];
    if (previous) void post('/close', { session: previous }).catch(() => {});
    onStatus('로컬 제어 꺼짐');
  } };
}
