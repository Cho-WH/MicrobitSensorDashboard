import { normalizeSettings } from './settings.js';
import { mockMlx90393Line } from './codec.js';

export function createPreparationSession({ send, onChange, onError, timers = globalThis, settings: saved = null }) {
  let settings = normalizeSettings(saved), phase = 'handshake', token = 0, timer = null, disposed = false;
  const getState = () => ({ phase, calibration: 'not-required', allowReadings: phase === 'receiving', settings: structuredClone(settings) });
  const publish = () => onChange(getState());
  function deadline() {
    timers.clearTimeout(timer);
    timer = timers.setTimeout(() => { if (!disposed) onError('자기장 설정의 응답이 없어요. 프로그램과 배선을 확인하고 다시 연결하세요.'); }, 5000);
  }
  async function configure() {
    phase = 'applying'; token++; deadline(); publish();
    try { await send(`configure,${settings.preset},${token}`); }
    catch { if (!disposed) onError('측정 설정을 보내지 못했어요. 다시 연결하세요.'); }
  }
  return {
    getState,
    start() { deadline(); },
    accept(input) {
      if (disposed) return;
      if (input.status === 'ready' && phase === 'handshake') void configure();
      else if (input.token === token && input.status === 'error') onError('센서를 확인하지 못했어요. 전원과 SDA·SCL 배선을 확인하고 다시 연결하세요.');
      else if (phase === 'applying' && input.status === 'applied' && input.token === token && input.preset === settings.preset) {
        timers.clearTimeout(timer); phase = 'receiving'; publish();
      }
    },
    processReading(input) {
      if (!disposed && phase === 'receiving' && input.type === 'parse-error') return input;
      if (disposed || phase !== 'receiving' || input.type !== 'reading' || input.token !== token || input.preset !== settings.preset) return null;
      return input;
    },
    async act(action) {
      if (disposed || phase !== 'receiving') return false;
      if (['preset:normal', 'preset:wide'].includes(action)) {
        settings = { version: 1, preset: action.slice(7) }; await configure(); return true;
      }
      return false;
    },
    dispose() { disposed = true; timers.clearTimeout(timer); },
  };
}
export function createMockPreparation({ emit, timers = globalThis, startStreaming = null, stopStreaming = () => {} }) {
  let timer = null;
  const stop = () => { timers.clearInterval(timer); timer = null; stopStreaming(); };
  return {
    command(command) {
      if (command === 'prepare') { stop(); emit('@mlx,1,ready'); }
      else if (command === 'stop') stop();
      else {
        const match = /^configure,(normal|wide),(\d+)$/.exec(command);
        if (!match) return;
        stop(); const [, preset, token] = match;
        emit(`@mlx,1,applied,${preset},${token}`);
        if(startStreaming){startStreaming(ms=>mockMlx90393Line(ms).replace('normal,1,',`${preset},${token},`));return;}
        let tick = 0;
        timer = timers.setInterval(() => { tick++; emit(`mlx,1,${preset},${token},${100 + tick % 20},100,150`); }, 100);
      }
    }, dispose: stop,
  };
}
