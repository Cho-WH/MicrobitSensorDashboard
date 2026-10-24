import { getLabCopy, applyLabCopy, labDefaults } from '../../src/ui/lab-copy.js';
import { getExperiment } from '../../src/catalog/index.js';
import temperature from '../../src/catalog/sensors/temperature/index.js';
import { createGuideView } from '../../src/ui/guide-view.js';
import { createMeasurementView } from '../../src/ui/measurement-view.js';
import { createAnalysisView } from '../../src/ui/analysis-view.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
export async function runCopyTests(report) {
  const parsed = new DOMParser().parseFromString(await (await fetch(new URL('../../lab.html', import.meta.url))).text(), 'text/html');
  const host = document.createElement('div');
  host.append(...[...parsed.querySelectorAll('[data-screen="measure"], [data-screen="analysis"]')].map(node=>document.importNode(node,true)));
  const guideHost = document.createElement('div'); host.append(guideHost); document.body.append(host);
  const original = temperature.uiCopy;
  temperature.uiCopy = { measurement:{start:'검사용 기록', waiting:'검사용 수신 대기', namePlaceholder:'검사용 이름'}, analysis:{title:'검사용 분석'}, reflection:{progress:'검사용 질문'}, guide:{previous:'검사용 이전'}, guideSteps:{equipmentTitle:'검사용 준비물'}, accessibility:{liveChart:'검사용 그래프'} };
  let guide, measurement, analysis;
  try {
    const context = getExperiment('temperature'), other = getExperiment('light-level');
    const runName = host.querySelector('#run-name'); runName.value = '학생이 작성한 이름';
    let clicks = 0; const start = host.querySelector('#start-recording'); start.addEventListener('click',()=>clicks++);
    applyLabCopy(host, getLabCopy(context));
    check(start.textContent==='검사용 기록' && runName.placeholder==='검사용 이름', '개별 문구가 템플릿에 반영되지 않았습니다.');
    check(runName.value==='학생이 작성한 이름' && host.querySelector('#finish-for-analysis svg'), '문구 적용이 입력값이나 아이콘을 지웠습니다.');
    start.click(); check(clicks===1, '문구 적용이 기존 버튼의 동작을 지웠습니다.');
    check(host.querySelector('#live-chart').getAttribute('aria-label')==='검사용 그래프', '접근성 문구가 반영되지 않았습니다.');

    guide = createGuideView(guideHost); guide.open(context);
    check(guideHost.querySelector('.step-title').textContent==='검사용 준비물', '공통 준비 단계의 지정 문구가 누락되었습니다.');
    check(guideHost.querySelector('[data-guide-action="previous"]').textContent==='검사용 이전', '준비 버튼의 지정 문구가 누락되었습니다.');
    guide.open(other,{reset:true});
    check(guideHost.querySelector('.step-title').textContent===labDefaults.guideSteps.equipmentTitle, '다른 센서에 준비 문구가 남았습니다.');

    measurement = createMeasurementView(host,()=>{});
    const facts = {store:null,latest:null,previewPoints:[],device:{status:'disconnected'},recording:false};
    measurement.render({...facts,context}); measurement.render({...facts,context});
    check(host.querySelector('#measurement-reception').textContent.includes('검사용 수신 대기'), '상태 갱신이 지정 문구를 덮어썼습니다.');
    measurement.render({...facts,context:other});
    check(start.textContent===labDefaults.measurement.start && runName.value==='학생이 작성한 이름', '실험실 전환 시 기본값 또는 입력값이 유지되지 않았습니다.');

    const analysisRoot=host.querySelector('[data-screen="analysis"]');
    analysis=createAnalysisView(analysisRoot,{onError:message=>{throw new Error(message);}});
    analysis.open(null,context);
    check(analysisRoot.querySelector('.analysis-heading h1').textContent==='검사용 분석', '기록 전 분석 화면에 실험실 문구가 적용되지 않았습니다.');
    check(analysisRoot.querySelector('#reflection-progress').textContent==='검사용 질문', '기록 전 해석 안내에 실험실 문구가 적용되지 않았습니다.');
    analysis.open(null,other);
    check(analysisRoot.querySelector('.analysis-heading h1').textContent===labDefaults.analysis.title, '분석 화면 전환 후 이전 문구가 남았습니다.');
    check(analysisRoot.querySelector('#reflection-progress').textContent===labDefaults.reflection.progress, '해석 안내에 이전 실험실 문구가 남았습니다.');
    report('공통 문구 상속·화면 전환·동적 상태와 입력값·아이콘·버튼 동작 보존');
  } finally {
    guide?.dispose(); measurement?.dispose(); analysis?.dispose(); host.remove();
    if (original === undefined) delete temperature.uiCopy; else temperature.uiCopy=original;
  }
}
