import { runStorageTests } from './storage.js';
import { runRecordTests } from './records.js';
import { runFileTests } from './files.js';
import { runUiTests } from './ui.js';
import { runGuideTests, runPreparationTests } from './guide.js';
import { runAppTests, appFlows } from './app.js';
import { runMeasurementTests } from './measurement.js';
import { runLayoutTests } from './layout.js';
import { runCopyTests } from './copy.js';
import { runNavigationTests } from './navigation.js';
import { runStartupTests } from './startup.js';
import { runDeviceTests } from './devices.js';
import { runLuminousTests, runLuminousWorkspaceTests } from './luminous.js';
import { runPresentationPerformance, runPresentationAccessibility } from './presentation.js';
import { runLargeRecordingTests, runLargeImportTests } from './large-recording.js';
const button = document.getElementById('run'), status = document.getElementById('status'), list = document.getElementById('results');
button.addEventListener('click', async () => {
  button.disabled = true; list.replaceChildren(); status.textContent = '검사 중'; delete status.dataset.result;
  let count = 0;
  const report = message => { count++; const li = document.createElement('li'); li.textContent = '통과 · ' + message; list.append(li); };
  try {
    const suites = {copy:runCopyTests,storage:runStorageTests,files:runFileTests,ui:runUiTests,guide:runGuideTests,preparation:runPreparationTests,measurement:runMeasurementTests,navigation:runNavigationTests,layout:runLayoutTests,devices:runDeviceTests,luminous:runLuminousTests,workspace:runLuminousWorkspaceTests};
    for(const flow of appFlows) suites['app-'+flow] = report => runAppTests(report, flow);
    const selected = new URL(location.href).searchParams.get('suite');
    suites.records = runRecordTests;
    suites.startup = runStartupTests;
    suites.accessibility = runPresentationAccessibility;
    if(selected?.includes('large-recording')) suites['large-recording'] = runLargeRecordingTests;
    if(selected?.includes('large-import')) suites['large-import'] = runLargeImportTests;
    const names=selected ? selected.split(',').flatMap(name=>name==='app'?appFlows.map(flow=>'app-'+flow):[name]) : Object.keys(suites);
    if(names.includes('performance')) suites.performance=runPresentationPerformance;
    for(const name of names) if(!suites[name]) throw new Error('알 수 없는 검사 묶음: '+name);
    const failures = [];
    for (const name of names) {
      const run=suites[name];
      try { await run(report); }
      catch (error) {
        failures.push(`${name}: ${error.message}`);
        const li = document.createElement('li'); li.textContent = `실패 · ${name}: ${error.message}`; list.append(li);
        console.error(error);
      }
    }
    if (failures.length) throw new Error(failures.join(' / '));
    status.textContent = `${count}개 브라우저 검사 통과`; status.dataset.result = 'passed';
  } catch(error) { status.textContent = '실패: ' + error.message; status.dataset.result = 'failed'; console.error(error); }
  finally { button.disabled = false; }
});
