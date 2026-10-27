import { readFile } from 'node:fs/promises';
import ts from 'typescript';

export const sensorDisplaySource = ts.transpile(await readFile(new URL('../../firmware/common/sensor-display.ts', import.meta.url), 'utf8'), { target: ts.ScriptTarget.ES2020 });

export function displayMock({ duringPause = () => {}, duringScroll = () => {} } = {}) {
  const pixels = Array(25).fill(0), scrolls = [], pauses = [], loops = [];
  let time = 0;
  const clear = () => pixels.fill(0);
  return {
    pixels, scrolls, pauses, loops, setTime: value => { time = value; },
    input: { runningTime: () => time }, control: { deviceName: () => 'zuvag' },
    led: { plot: (x, y) => { pixels[y * 5 + x] = 1; }, unplot: (x, y) => { pixels[y * 5 + x] = 0; },
      stopAnimation: clear },
    basic: { clearScreen: clear, forever: cb => loops.push(cb),
      pause(ms) { pauses.push(ms); duringPause(ms); },
      showString(name, interval) { scrolls.push({ name, interval }); duringScroll(); } },
  };
}
