import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { displayMock, sensorDisplaySource } from '../helpers/sensor-display.mjs';

function fixture(options) {
  const screen = displayMock(options);
  return { screen, display: runInNewContext(sensorDisplaySource + '\nSensorDisplay', screen) };
}

test('connecting during the icon or native scroll cancels late drawing, including a newer calibration display', () => {
  for (const stage of ['icon', 'scroll']) {
    let interrupt = true;
    const change = () => {
      if (!interrupt) return;
      interrupt = false;
      f.display.setMode('connected');
      f.display.setMode('calibrating');
      f.screen.led.plot(4, 4); // Native calibration takes display ownership.
    };
    const f = fixture({ duringPause: () => { if (stage === 'icon') change(); },
      duringScroll: () => { if (stage === 'scroll') change(); } });
    f.display.start(true); f.screen.loops[0](); f.screen.loops[0]();
    assert.equal(f.screen.scrolls.length, stage === 'icon' ? 0 : 1);
    assert.deepEqual(f.screen.pixels, [...Array(24).fill(0), 1]);
    f.display.setMode('waiting'); f.screen.loops[0]();
    assert.equal(f.screen.scrolls.length, stage === 'icon' ? 1 : 2);
  }
});

test('streaming display does not sleep during updates and stop clears it', () => {
  const { screen, display } = fixture(); display.start(true); display.setMode('streaming');
  for (const time of [0, 425, 1100]) {
    screen.setTime(time); display.update();
    assert.ok(screen.pixels.some(Boolean));
  }
  assert.deepEqual(screen.pauses, []);
  display.setMode('connected'); display.update();
  assert.ok(screen.pixels.every(x => x === 0));
});

test('light sensing leaves the enabled LED matrix blank until disconnect', () => {
  const { screen, display } = fixture(); display.start(false);
  display.setMode('connected'); display.setMode('streaming');
  for (const time of [0, 300, 900, 2000]) { screen.setTime(time); display.update(); }
  assert.ok(screen.pixels.every(x => x === 0)); assert.equal(screen.scrolls.length, 0);
  display.setMode('waiting'); display.update(); assert.equal(screen.scrolls.length, 1);
});
