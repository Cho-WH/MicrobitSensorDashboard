import { mountLabFixture, clickVisible } from './lab-fixture.js';
import { getLabCopy, applyLabCopy, labDefaults } from '../../src/ui/lab-copy.js';
import { getExperiment } from '../../src/catalog/index.js';
import temperature from '../../src/catalog/sensors/temperature/index.js';
import { createMeasurementView } from '../../src/ui/measurement-view.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
export async function runCopyTests(report) {
  const fixture=await mountLabFixture({component:true}), {host}=fixture;
  fixture.showScreen('measure');
  const original = temperature.uiCopy;
  temperature.uiCopy = { measurement:{start:'검사용 기록', waiting:'검사용 수신 대기', namePlaceholder:'검사용 이름'}, accessibility:{liveChart:'검사용 그래프'} };
  let measurement;
  try {
    const context = getExperiment('temperature'), other = getExperiment('light-level');
    const runName = host.querySelector('#run-name'); runName.value = '학생이 작성한 이름';
    let clicks = 0; const start = host.querySelector('#start-recording'); start.addEventListener('click',()=>clicks++);
    applyLabCopy(host, getLabCopy(context));
    check(start.textContent==='검사용 기록' && runName.placeholder==='검사용 이름', '개별 문구가 템플릿에 반영되지 않았습니다.');
    check(runName.value==='학생이 작성한 이름' && host.querySelector('#finish-for-analysis svg'), '문구 적용이 입력값이나 아이콘을 지웠습니다.');
    clickVisible(start); check(clicks===1, '문구 적용이 기존 버튼의 동작을 지웠습니다.');
    check(host.querySelector('#live-chart').getAttribute('aria-label')==='검사용 그래프', '접근성 문구가 반영되지 않았습니다.');

    measurement = createMeasurementView(host,()=>{});
    const facts = {store:null,latest:null,previewPoints:[],device:{status:'disconnected'},recording:false};
    measurement.render({...facts,context}); measurement.render({...facts,context});
    check(host.querySelector('#measurement-reception').textContent.includes('검사용 수신 대기'), '상태 갱신이 지정 문구를 덮어썼습니다.');
    measurement.render({...facts,context:other});
    check(start.textContent===labDefaults.measurement.start && runName.value==='학생이 작성한 이름', '실험실 전환 시 기본값 또는 입력값이 유지되지 않았습니다.');

    report('공통 문구 상속·화면 전환·동적 상태와 입력값·아이콘·버튼 동작 보존');
  } finally {
    measurement?.dispose(); fixture.dispose();
    if (original === undefined) delete temperature.uiCopy; else temperature.uiCopy=original;
  }
}
