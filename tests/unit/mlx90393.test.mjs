import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMlx90393 } from '../../src/catalog/sensors/mlx90393/codec.js';
import { normalizeSettings } from '../../src/catalog/sensors/mlx90393/settings.js';
import { createPreparationSession } from '../../src/catalog/sensors/mlx90393/preparation.js';
import { getExperiment } from '../../src/catalog/index.js';
import { createTransport } from '../../src/device/transport.js';

test('MLX signed counts produce four physical channels with preset coefficients and saturation flags', () => {
  const normal = decodeMlx90393('mlx,1,normal,1,100,-200,0');
  assert.deepEqual([normal.values.magneticX, normal.values.magneticY, normal.values.magneticZ], [15, -30, 0]);
  assert.equal(decodeMlx90393('mlx,1,wide,2,100,-200,100').values.magneticZ, 242);
  assert.equal(normal.values.magneticStrength, Math.hypot(15, -30, 0));
  const channels = getExperiment('mlx90393').channels.map(c => c.id);
  assert.deepEqual(channels, ['magneticX', 'magneticY', 'magneticZ', 'magneticStrength']);
  assert.deepEqual(Object.keys(normal.values), channels);
  assert.equal(decodeMlx90393('mlx,1,normal,1,32767,0,0').validity.magneticX, 'out-of-range');
  assert.equal(decodeMlx90393('mlx,1,wide,1,0,0,25000').validity.magneticZ, 'out-of-range');
  for (const line of ['mlx,1,wide,1,NaN,0,0', 'mlx,1,normal,1,32768,0,0', '1,2,3', '@mlx,2,ready']) assert.equal(decodeMlx90393(line).type, 'parse-error');
  assert.throws(() => normalizeSettings({ version: 2, preset: 'normal' }));
  assert.throws(() => normalizeSettings({ version: 1, preset: 'unknown' }));
});

test('configuration ACK and reading tokens gate settings; reconnect restores the preset without changing values', async () => {
  const commands = [], changes = [], errors = [];
  const options = { send: async cmd => commands.push(cmd), onChange: state => changes.push(state), onError: error => errors.push(error) };
  const s = createPreparationSession(options);
  s.start(); s.accept(decodeMlx90393('@mlx,1,ready'));
  assert.equal(commands.at(-1), 'configure,normal,1');
  assert.equal(s.processReading(decodeMlx90393('mlx,1,normal,1,1,2,3')), null);
  s.accept(decodeMlx90393('@mlx,1,applied,wide,1'));
  assert.equal(s.getState().allowReadings, false);
  s.accept(decodeMlx90393('@mlx,1,applied,normal,1'));
  const saved = s.getState().settings;
  assert.deepEqual(saved, { version: 1, preset: 'normal' });
  const input = decodeMlx90393('mlx,1,normal,1,100,200,300');
  const value = s.processReading(input);
  assert.deepEqual(value.values, input.values);
  s.dispose();
  const reconnect = createPreparationSession({ ...options, settings: saved });
  reconnect.start(); reconnect.accept(decodeMlx90393('@mlx,1,ready')); reconnect.accept(decodeMlx90393('@mlx,1,applied,normal,1'));
  assert.deepEqual(reconnect.getState().settings, saved);
  await reconnect.act('preset:wide');
  assert.equal(reconnect.processReading(value), null);
  reconnect.accept(decodeMlx90393('@mlx,1,applied,normal,1'));
  assert.equal(reconnect.getState().allowReadings, false);
  reconnect.accept(decodeMlx90393('@mlx,1,applied,wide,2'));
  assert.deepEqual(reconnect.getState().settings, { version: 1, preset: 'wide' });
  assert.equal(reconnect.processReading(decodeMlx90393('mlx,1,wide,1,1,2,3')), null);
  assert.equal(reconnect.processReading(decodeMlx90393('mlx,1,wide,2,1,2,3')).type, 'reading');
  reconnect.dispose(); assert.deepEqual(errors, []);
});

test('transport discards stale preset notifications and requires fresh reception after reconfiguration', async () => {
  let notify, now = 0;
  const commands = [], inputs = [];
  const ble = { isSupported: () => true, requestDevice: async () => ({ name: 'test' }), connect: async () => {},
    startNotifications: async cb => { notify = cb; }, setDisconnectedListener() {},
    sendStartCommand: async cmd => { commands.push(cmd); }, disconnect: async () => {} };
  const transport = createTransport({ ble, clock: { utc: () => now, mono: () => now } });
  try {
    await transport.connect(getExperiment('mlx90393'), input => inputs.push(input));
    notify('@mlx,1,ready'); notify('@mlx,1,applied,normal,1');
    for (let i = 0; i < 5; i++) { now += 100; notify('mlx,1,normal,1,100,200,300'); }
    assert.equal(transport.getState().confirmed, true);
    await transport.performAction('preset:wide');
    assert.equal(transport.getState().confirmed, false);
    notify('mlx,1,normal,1,100,200,300');
    assert.equal(inputs.length, 5);
    notify('@mlx,1,applied,wide,2');
    assert.equal(transport.getState().confirmed, false);
    for (let i = 0; i < 5; i++) { now += 100; notify('mlx,1,wide,2,100,200,300'); }
    assert.equal(transport.getState().confirmed, true);
    assert.equal(inputs.at(-1).values.magneticZ, 726);
  } finally { await transport.disconnect(); }
});
