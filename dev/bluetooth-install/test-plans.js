import { decodeTemperature } from '../../src/catalog/sensors/temperature/codec.js';
import { decodeLightLevel } from '../../src/catalog/sensors/light-level/codec.js';
import { decodeAccelerometer } from '../../src/catalog/sensors/accelerometer/codec.js';
import { decodeMagnetometer } from '../../src/catalog/sensors/magnetometer/codec.js';
import { decodeBmp280 } from '../../src/catalog/sensors/bmp280/codec.js';
import { decodeDecimalChannels } from '../../src/catalog/sensors/shared/decimal-codec.js';

export const testPlans = Object.freeze({
  'connect-3s': { name: '연결만 · 실제 해제 이벤트 후', connectionOnly: true,
    hint: '앱에서 즉시 끊지 않고 실제 해제 이벤트를 기다린 뒤 한 번 연결합니다. 이벤트 시간 초과·연결 실패 시 그대로 종료합니다.' },
  builtin: { name: '내장 센서 왕복', targets: ['temperature', 'accelerometer', 'magnetometer', 'light-level', 'temperature'],
    hint: '추가 배선 없이 실행 · 자기장 보정은 생략하고 수신만 확인합니다.' },
  quick: { name: '밝기 → 온도', targets: ['light-level', 'temperature'], hint: '기존 두 시험본의 교체·수신을 빠르게 확인합니다.' },
  bmp280: { name: 'BMP280 → 온도', targets: ['bmp280', 'temperature'], hint: 'BMP280 배선을 먼저 연결하세요. 계산 정확도는 기준 계측기와 별도로 비교합니다.' },
  analog: { name: '아날로그 → 온도', targets: ['analog-raw', 'temperature'], hint: '현재 후보는 P0·P1·P2입니다. 알려진 입력을 연결하세요. 자동 판정은 수신 형식·범위만 확인합니다.' },
});
const decoders = { temperature: decodeTemperature, 'light-level': decodeLightLevel, accelerometer: decodeAccelerometer,
  magnetometer: decodeMagnetometer, bmp280: decodeBmp280,
  'analog-raw': raw => decodeDecimalChannels(raw, ['p0', 'p1', 'p2'].map(id => ({ id, min: 0, max: 1023 }))) };
export function decodeTrialSample(id, raw) {
  const decoded = decoders[id]?.(raw);
  return { decoded, valid: decoded?.type === 'reading' && Object.values(decoded.validity).every(value => value === 'valid') };
}
export function validateCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('명령 형식 오류');
  if (command.action === 'run' && Object.hasOwn(testPlans, command.plan) && Object.keys(command).every(k => ['action', 'plan'].includes(k))) return command;
  if (command.action === 'unbonded' && ['temperature', 'light-level', 'quick', 'verify'].includes(command.target)
    && Object.keys(command).every(k => ['action', 'target'].includes(k))) return command;
  if (['diagnose', 'cancel'].includes(command.action) && Object.keys(command).length === 1) return command;
  throw new Error('지원 명령: diagnose, cancel, run + 등록된 plan, unbonded + temperature/light-level/quick/verify');
}
