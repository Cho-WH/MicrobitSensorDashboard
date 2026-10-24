import { runStorageTests } from './storage.js';
import { runFileTests } from './files.js';
import { runUiTests } from './ui.js';
import { runGuideTests } from './guide.js';
import { runAppTests } from './app.js';
import { runMeasurementTests } from './measurement.js';
import { runLayoutTests } from './layout.js';
import { runCopyTests } from './copy.js';
import { runNavigationTests } from './navigation.js';
import { runDeviceTests } from './devices.js';
const button = document.getElementById('run'), status = document.getElementById('status'), list = document.getElementById('results');
button.addEventListener('click', async () => {
  button.disabled = true; list.replaceChildren(); status.textContent = '검사 중';
  let count = 0;
  const report = message => { count++; const li = document.createElement('li'); li.textContent = '통과 · ' + message; list.append(li); };
  try {
    const suites = {copy:runCopyTests,storage:runStorageTests,files:runFileTests,ui:runUiTests,guide:runGuideTests,measurement:runMeasurementTests,app:runAppTests,navigation:runNavigationTests,layout:runLayoutTests,devices:runDeviceTests};
    const selected = new URL(location.href).searchParams.get('suite');
    for (const run of selected && suites[selected] ? [suites[selected]] : Object.values(suites)) await run(report);
    status.textContent = `${count}개 브라우저 검사 통과`; status.dataset.result = 'passed';
  } catch(error) { status.textContent = '실패: ' + error.message; status.dataset.result = 'failed'; console.error(error); }
  finally { button.disabled = false; }
});
