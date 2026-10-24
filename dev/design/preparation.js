import { loadLabDocument } from './load-lab.js';
import { prepareLuminousPreview } from '../../src/ui/luminous-preview.js';
import { createController } from '../../src/app/controller.js';
import { createRepository } from '../../src/data/repository.js';

await loadLabDocument();
await prepareLuminousPreview(document);
const style = document.createElement('link');
style.rel = 'stylesheet'; style.href = new URL('./preparation.css', import.meta.url).href;
const styled = new Promise((resolve, reject) => { style.onload = resolve; style.onerror = reject; });
document.head.append(style); await styled;
const params = new URL(location.href).searchParams;
const sensor = params.get('sensor') ?? 'bmp280';
const databaseName = 'microbit.sensor-lab.preparation-review.' + crypto.randomUUID();
const app = createController(document, { repository:createRepository({databaseName}), historyEnabled:false,
  initialUrl:new URL(`sensors/${encodeURIComponent(sensor)}/?mock=1&visual=luminous`,document.baseURI).href });
const shell = document.querySelector('.guide');
const controls = document.createElement('div'); controls.className = 'preparation-comparison';
controls.setAttribute('role','group'); controls.setAttribute('aria-label','준비 화면 디자인 비교');
const caption = document.createElement('p'); caption.className = 'preparation-comparison-caption';
caption.textContent = '디자인 비교 · 모의 장치 · A/B를 바꿔도 현재 단계와 준비 상태는 유지됩니다.';
document.querySelector('.preparation-heading').before(caption);
document.querySelector('.preparation-heading').append(controls);
const buttons = new Map();
function select(variant) {
  shell.dataset.stageStyle = variant;
  for (const [value, button] of buttons) button.setAttribute('aria-pressed',String(value === variant));
  const url = new URL(location.href); url.searchParams.set('variant',variant); history.replaceState(null,'',url);
}
for (const [variant,label] of [['light','A · 밝은 공통형'],['dark','B · 몰입형 통일']]) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  button.addEventListener('click',() => select(variant)); buttons.set(variant,button); controls.append(button);
}
select(params.get('variant') === 'dark' ? 'dark' : 'light');
const cleanup = document.createElement('button'); cleanup.type='button'; cleanup.className='preparation-review-cleanup'; cleanup.textContent='비교용 자료 정리';
cleanup.addEventListener('click',async () => {
  cleanup.disabled=true;
  try { await app.dispose(); await globalThis.idb.deleteDB(databaseName); cleanup.textContent='비교용 자료를 정리했습니다.'; }
  catch(error) { cleanup.textContent=error.message; cleanup.disabled=false; }
});
document.body.append(cleanup);
await document.fonts.ready;
const deadline = performance.now()+10000;
while(app.getState().busy) {
  if(performance.now()>deadline) throw new Error('준비 화면을 열지 못했습니다.');
  await new Promise(resolve=>setTimeout(resolve,25));
}
const initialStep = params.get('step');
if (['equipment','wiring','program','connection'].includes(initialStep)) shell.querySelector(`[data-guide-group="${initialStep}"]`)?.click();
document.documentElement.dataset.preparationReviewReady='true';
