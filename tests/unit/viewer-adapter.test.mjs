import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewerAdapter } from '../../src/guide/viewer-adapter.js';

const wiring = id => ({ id, model: { view: 'front', wire: id, explosion: 18 } });
const equipment = { id: 'equipment', model: { view: 'iso', wire: null, explosion: 0 } };
function fixture() {
  const events = new EventTarget(), frame = new EventTarget(), sent = [], notices = [], timers = new Map(); let timerId = 0;
  frame.contentWindow = { postMessage: (data, origin) => sent.push({ data, origin }) };
  const options = { url: 'https://lab.test/base/public/viewers/wiring/index.html?embed=1', origin: 'https://lab.test', events, defaults:{connector:'socket'}, choices:[{id:'connector',values:[{id:'socket'},{id:'pin'}]}],
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  const adapter = createViewerAdapter(frame, (state, detail) => notices.push({ state, detail }), options);
  function reply(type, overrides = {}) {
    const last = sent.at(-1)?.data;
    const event = new Event('message'); Object.assign(event, { origin: options.origin, source: frame.contentWindow,
      data: { channel: 'sensor-lab-wiring', version: 1, requestId: last?.requestId, type }, ...overrides }); events.dispatchEvent(event);
  }
  return { adapter, frame, sent, notices, timers, reply, events, options };
}

test('3D assets load lazily and only the current step is applied after handshake', () => {
  const { adapter, frame, sent, reply, notices } = fixture();
  assert.equal(frame.src, undefined); assert.equal(sent.length, 0);
  adapter.applyStep(wiring('vcc')); assert.match(frame.src, /\/base\/public\/viewers\/wiring\/index.html\?embed=1$/);
  adapter.applyStep(wiring('sda')); frame.dispatchEvent(new Event('load')); assert.equal(sent.at(-1).data.type, 'prepare');
  reply('ready'); assert.deepEqual(sent.at(-1).data.state, { view: 'front', wire: 'sda', explosion: 18, options: {connector:'socket'} });
  reply('applied'); assert.equal(notices.at(-1).detail.hasAppliedState, true);
  frame.dispatchEvent(new Event('load')); assert.equal(notices.at(-1).detail.hasAppliedState, false);
  adapter.dispose();
});

test('a scene arriving after iframe load recovers the handshake and displays the current step', () => {
  const { adapter, frame, reply, notices, sent } = fixture();
  adapter.applyStep(wiring('vcc'));
  frame.dispatchEvent(new Event('load')); // No scene listener yet: the first prepare is lost.
  adapter.applyStep(wiring('sda'));
  reply('scene-loaded'); reply('ready');
  assert.equal(sent.at(-1).data.state.wire, 'sda');
  reply('applied');
  assert.equal(notices.at(-1).state, 'applied');
  assert.equal(notices.at(-1).detail.hasAppliedState, true);
  adapter.dispose();
});

test('viewer rejects wrong origin, source, contract, stale ID, type and response phase without accepting or cancelling timeout', () => {
  const { adapter, frame, sent, reply, timers, notices } = fixture();
  adapter.applyStep(equipment); frame.dispatchEvent(new Event('load'));
  const baseline = notices.length, count = sent.length, request = structuredClone(sent.at(-1).data);
  reply('ready', { origin: 'https://evil.test' }); reply('ready', { source: {} });
  for (const data of [{ ...request, type: 'ready', channel: 'other' }, { ...request, type: 'ready', version: 2 },
    { ...request, type: 'ready', requestId: '0' }, { ...request, type: 'unknown' }, { ...request, type: 'applied' }]) reply('ready', { data });
  assert.equal(notices.length, baseline); assert.equal(sent.length, count); assert.equal(timers.size, 1);
  reply('ready'); assert.equal(sent.at(-1).data.type, 'apply-state'); const applyCount = sent.length;
  reply('ready'); assert.equal(sent.length, applyCount); assert.equal(timers.size, 1);
  reply('applied'); assert.equal(notices.at(-1).state, 'applied'); assert.equal(timers.size, 0);
  adapter.dispose();
});

test('connector selection persists, detail resets across steps, failed viewer can retry, dispose removes pending work', () => {
  const { adapter, frame, sent, reply, timers, notices } = fixture();
  adapter.applyStep(wiring('vcc')); frame.dispatchEvent(new Event('load')); reply('ready'); reply('applied');
  adapter.setOption('connector','pin'); assert.equal(sent.at(-1).data.type, 'apply-state'); reply('applied');
  adapter.setOption('connector','unknown'); assert.equal(notices.at(-1).state,'applied');
  adapter.toggleDetail(); assert.equal(sent.at(-1).data.state.view, 'connector'); reply('applied');
  adapter.applyStep(wiring('scl')); assert.deepEqual(sent.at(-1).data.state, { view: 'front', wire: 'scl', explosion: 18, options: {connector:'pin'} });
  reply('error'); assert.equal(notices.at(-1).state, 'unavailable');
  adapter.restoreStep(); assert.equal(sent.at(-1).data.type, 'prepare'); reply('ready'); reply('applied');
  adapter.applyStep(equipment); assert.equal(sent.at(-1).data.state.options.connector, 'pin');
  adapter.setOption('connector','socket'); assert.equal(sent.at(-1).data.type, 'apply-state');
  adapter.dispose(); assert.equal(timers.size, 0); const sentCount = sent.length, noticesCount = notices.length;
  reply('applied'); frame.dispatchEvent(new Event('load')); adapter.applyStep(wiring('sda'));
  assert.equal(sent.length, sentCount); assert.equal(notices.length, noticesCount);
});

test('viewer cannot load a remote or non-web URL', () => {
  const { frame, options, adapter } = fixture(); adapter.dispose();
  for (const url of ['https://other.test/model.html', 'file:///model.html', 'data:text/html,hello']) {
    assert.throws(() => createViewerAdapter(frame, () => {}, { ...options, url }), /같은 주소/);
  }
});
