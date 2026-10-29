import { mountLabFixture, clickVisible } from './lab-fixture.js';
import { getLabCopy, applyLabCopy, labDefaults } from '../../src/ui/lab-copy.js';
import { getExperiment } from '../../src/catalog/index.js';
import temperature from '../../src/catalog/sensors/temperature/index.js';
import { createMeasurementView } from '../../src/ui/measurement-view.js';
import { createAnalysisView } from '../../src/ui/analysis-view.js';
import { createRangeSelector } from '../../src/ui/range-selector.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
export async function runCopyTests(report) {
  const fixture=await mountLabFixture({component:true}), {host}=fixture;
  fixture.showScreen('measure');
  const original = temperature.uiCopy;
  temperature.uiCopy = { measurement:{start:'검사용 기록', waiting:'검사용 수신 대기', namePlaceholder:'검사용 이름'}, accessibility:{liveChart:'검사용 그래프'},
    analysis:{y:'검사용 세로축',line:'검사용 선 그래프',trendEmpty:'검사용 추세선 안내',rangeHint:'검사용 구간 안내'} };
  let measurement, analysis;
  const abort = new AbortController();
  try {
    const context = getExperiment('temperature'), other = getExperiment('light-level');
    const runName = host.querySelector('#run-name'); runName.value = '학생이 작성한 이름';
    let clicks = 0; const start = host.querySelector('#start-recording'); start.addEventListener('click',()=>clicks++);
    applyLabCopy(host, getLabCopy(context));
    check(start.textContent==='검사용 기록' && runName.placeholder==='검사용 이름', '개별 문구가 템플릿에 반영되지 않았습니다.');
    check(runName.value==='학생이 작성한 이름', '문구 적용이 입력값을 지웠습니다.');
    clickVisible(start); check(clicks===1, '문구 적용이 기존 버튼의 동작을 지웠습니다.');
    check(host.querySelector('#live-chart').getAttribute('aria-label')==='검사용 그래프', '접근성 문구가 반영되지 않았습니다.');

    measurement = createMeasurementView(host,()=>{});
    const facts = {store:null,latest:null,previewPoints:[],device:{status:'disconnected'},recording:false};
    measurement.render({...facts,context}); measurement.render({...facts,context});
    check(host.querySelector('#measurement-reception').textContent.includes('검사용 수신 대기'), '상태 갱신이 지정 문구를 덮어썼습니다.');
    measurement.render({...facts,context:other});
    check(start.textContent===labDefaults.measurement.start && runName.value==='학생이 작성한 이름', '실험실 전환 시 기본값 또는 입력값이 유지되지 않았습니다.');

    fixture.showScreen('analysis');
    const analysisRoot=host.querySelector('[data-screen="analysis"]'), $=id=>host.querySelector('#'+id);
    analysis=createAnalysisView(analysisRoot,{onError:message=>{throw new Error(message);}});
    analysis.open(null,context); analysis.open(null,context);
    check($('left-axis-label').textContent==='검사용 세로축'&&$('graph-type-label').textContent==='검사용 선 그래프','분석 갱신이 개별 축·그래프 문구를 덮어썼습니다.');
    check($('trend-empty').textContent==='검사용 추세선 안내'&&$('right-trend-empty').textContent==='검사용 추세선 안내','추세선 갱신이 개별 안내를 덮어썼습니다.');
    analysis.open(null,other);
    check($('left-axis-label').textContent===labDefaults.analysis.y&&$('trend-empty').textContent===labDefaults.analysis.trendEmpty,'다른 실험에 이전 분석 문구가 남았습니다.');
    analysis.dispose(); analysis=null;
    let rangeCopy=getLabCopy(context);
    const range=createRangeSelector(analysisRoot,{getChart:()=>null,getCopy:()=>rangeCopy,onApply:()=>{},onClose:()=>{},signal:abort.signal});
    const samples=[{sampleId:1,receivedAt:1000},{sampleId:2,receivedAt:2000}], state={exclusions:[],appliedScope:'all',analysisRange:null};
    range.update(samples,state,1000); range.open(state);
    check($('range-hint').textContent==='검사용 구간 안내','구간 편집이 개별 안내를 덮어썼습니다.');
    rangeCopy=getLabCopy(other);range.update(samples,state,1000);
    check($('range-hint').textContent===labDefaults.analysis.rangeHint,'구간 편집에 이전 실험의 문구가 남았습니다.');
    report('공통 문구 상속·화면 전환·분석 동적 문구와 입력값·버튼 동작 보존');
  } finally {
    abort.abort(); analysis?.dispose(); measurement?.dispose(); fixture.dispose();
    if (original === undefined) delete temperature.uiCopy; else temperature.uiCopy=original;
  }
}
