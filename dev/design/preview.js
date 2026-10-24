// Repeatable review of the real app. Only this development page freezes time;
// it uses the existing BLE simulator, decoder, controller, session and IndexedDB.
import { createController } from '../../src/app/controller.js';
import { createTransport } from '../../src/device/transport.js';
import { createMockBleClient } from '../../src/device/mock-client.js';
import { createRepository } from '../../src/data/repository.js';
import { getExperiment } from '../../src/catalog/index.js';
import { prepareLuminousPreview } from '../../src/ui/luminous-preview.js';
import { loadLabDocument } from './load-lab.js';

const params = new URL(location.href).searchParams;
const sensor = params.get('sensor') ?? 'bmp280', state = params.get('state') ?? 'recording';
const context = getExperiment(sensor), legacy = params.get('theme') === 'legacy';
const realNow = performance.now.bind(performance);
const epoch = Date.parse('2026-10-25T10:00:00+09:00');
let time = 0, sequence = 0;
const jobs = new Map();
const schedule = (fn, delay, repeat) => { const id = ++sequence; jobs.set(id,{fn,at:time+delay,repeat}); return id; };
const timers = {
  setTimeout:(fn,ms)=>schedule(fn,ms,0), clearTimeout:id=>jobs.delete(id),
  setInterval:(fn,ms)=>schedule(fn,ms,ms), clearInterval:id=>jobs.delete(id),
};
async function advance(ms) {
  const end = time + ms;
  for (;;) {
    const next = [...jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
    if (!next) break;
    const [id, job] = next; time = job.at;
    if (job.repeat) job.at += job.repeat; else jobs.delete(id);
    await job.fn();
  }
  time = end;
  await new Promise(resolve=>setTimeout(resolve,250));
}
async function until(predicate) {
  const deadline = realNow()+10000;
  while (!predicate()) { if (realNow()>deadline) throw new Error('검토 화면 준비 시간 초과'); await new Promise(resolve=>setTimeout(resolve,50)); }
}
await loadLabDocument();
if (!legacy) await prepareLuminousPreview(document);
Date.now = () => epoch+time;
Object.defineProperty(performance,'now',{value:()=>time,configurable:true});
const databaseName = 'microbit.sensor-lab.design-review.'+crypto.randomUUID();
const repository = createRepository({databaseName});
let failSave = false;
const commit = repository.commitBatch;
repository.commitBatch = batch => failSave ? Promise.reject(new Error('디자인 검토용 저장 실패')) : commit(batch);
const transport = createTransport({ble:createMockBleClient(()=>context,{timers,now:()=>time}),timers,clock:{utc:()=>epoch+time,mono:()=>time}});
const app = createController(document,{repository,deviceTransport:transport,historyEnabled:false,
  initialUrl:new URL(`sensors/${sensor}/?view=measure&mock=1${legacy?'':'&visual=luminous'}`,document.baseURI).href});
const $ = selector=>document.querySelector(selector);
async function click(selector) { await until(()=>!app.getState().busy&&!$(selector).disabled); $(selector).click(); await new Promise(resolve=>setTimeout(resolve,250)); }
await until(()=>!app.getState().busy);
$('#run-name').value = '작은 변화 관찰하기';
if (state !== 'idle') {
  await click('#connect');
  if (sensor === 'magnetometer') { await advance(1000); await click('[data-device-action="skip"]'); }
  await advance(2000);
  if (sensor === 'magnetometer') await click('[data-view="measure"]');
  if (state !== 'preview') {
    await click('#start-recording');
    await advance(24000);
    $('#event-note').value = '주변 조건을 그대로 유지하며 변화를 관찰함'; await click('#add-note');
    await advance(36000);
    if (state === 'paused' || state === 'disconnected') await click('#pause-recording');
    if (state === 'disconnected') await click('#disconnect');
    if (state === 'error') { failSave = true; await advance(1000); await until(()=>app.getState().storage?.status==='error'); }
  }
}
// Entry points for reviewing V4 on the same real controller and isolated run.
// Navigation and evidence capture go through the existing controls.
const view = params.get('view');
if (['overview','relationship','interpretation','saved','home'].includes(view)) {
  if (!['idle','preview'].includes(state)) await click('#finish-recording');
  if (view === 'saved' || view === 'home') await click(`[data-view="${view}"]`);
  else {
    await click('[data-view="analysis"]');
    if (view !== 'overview') await click('#tab-relationship');
    if (view === 'interpretation') await click('#use-graph-for-reflection');
  }
}
const review = document.createElement('footer');
review.style.cssText='margin:36px 0 0;padding:16px;border-top:1px solid #b9c6d8;font:13px system-ui;display:flex;gap:10px;flex-wrap:wrap;align-items:center';
review.append(document.createTextNode(`개발 검토 · ${sensor} 모의 자료 · 고정 시각 · ${legacy?'기존':'Luminous'} 화면`));
for(const [label,action] of [
  ['10초 수신',()=>advance(10000)],['수신 끊기',()=>click('#disconnect')],
  ['저장 실패 시험',async()=>{failSave=true;await advance(1000);}],
  ['저장 정상화',async()=>{failSave=false;if(!$('#retry-save').hidden)await click('#retry-save');}],
  ['검토 자료 정리',async()=>{failSave=false;await app.dispose();await globalThis.idb.deleteDB(databaseName);review.textContent='검토용 자료를 정리했습니다.';}],
]) { const button=document.createElement('button');button.textContent=label;button.onclick=()=>Promise.resolve(action()).catch(error=>review.append(error.message));review.append(button); }
document.body.append(review);
await document.fonts.ready;
await until(()=>!app.getState().busy);
document.documentElement.dataset.reviewReady = state;
