// node dev/bluetooth-install/control.mjs status|log|diagnose|cancel|run <plan>
import { validateCommand } from './test-plans.js';
const [action = 'status', plan] = process.argv.slice(2);
const origin = new URL(process.env.LAB_TRIAL_URL ?? 'http://localhost:8080');
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || origin.protocol !== 'http:') throw new Error('로컬 개발 서버 주소만 허용합니다.');
const read = ['status', 'log'].includes(action);
const command = read ? null : validateCommand(action === 'run' ? { action, plan } : { action });
const response = await fetch(new URL('/__dev/bluetooth-trial/' + (read ? action : 'command'), origin), read ? {} : {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sensor-Lab-Trial': '1' }, body: JSON.stringify(command),
});
const data = await response.json(); console.log(JSON.stringify(data, null, 2));
if (!response.ok) process.exitCode = 1;
