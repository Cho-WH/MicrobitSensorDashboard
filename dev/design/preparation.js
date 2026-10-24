import { loadLabDocument } from './load-lab.js';
import { prepareLuminousPreview } from '../../src/ui/luminous-preview.js';
import { createController } from '../../src/app/controller.js';
import { createRepository } from '../../src/data/repository.js';

await loadLabDocument();
await prepareLuminousPreview(document);
const archivedA = document.documentElement.dataset.preparationArchive === 'a';
const style = document.createElement('link');
style.rel = 'stylesheet'; style.href = new URL(archivedA ? './archive/preparation-a.css' : './preparation.css', import.meta.url).href;
const styled = new Promise((resolve, reject) => { style.onload = resolve; style.onerror = reject; });
document.head.append(style); await styled;
const params = new URL(location.href).searchParams;
const sensor = params.get('sensor') ?? 'bmp280';
const entry = params.get('activity') === 'gay-lussac' ? 'activities/gay-lussac/' : `sensors/${encodeURIComponent(sensor)}/`;
const databaseName = 'microbit.sensor-lab.preparation-review.' + crypto.randomUUID();
const app = createController(document, { repository:createRepository({databaseName}), historyEnabled:false,
  initialUrl:new URL(`${entry}?mock=1&visual=luminous`,document.baseURI).href });
const shell = document.querySelector('.guide');
shell.dataset.stageStyle = archivedA ? 'light' : 'dark';
if (archivedA) {
  const caption = document.createElement('p'); caption.className = 'preparation-archive-caption';
  caption.textContent = '보관된 A안 · 현재 적용안은 B안입니다.';
  document.querySelector('.preparation-heading').before(caption);
}
const cleanup = document.createElement('button'); cleanup.type='button'; cleanup.className='preparation-review-cleanup'; cleanup.textContent='검토용 자료 정리';
cleanup.addEventListener('click',async () => {
  cleanup.disabled=true;
  try { await app.dispose(); await globalThis.idb.deleteDB(databaseName); cleanup.textContent='검토용 자료를 정리했습니다.'; }
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
if (['equipment','wiring','program','connection','calibration','battery','placement'].includes(initialStep)) shell.querySelector(`[data-guide-group="${initialStep}"]`)?.click();
document.documentElement.dataset.preparationReviewReady='true';
