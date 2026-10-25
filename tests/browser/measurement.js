import { mountLabFixture, clickVisible } from './lab-fixture.js';
import {createMeasurementView} from '../../src/ui/measurement-view.js';
import {createRepository} from '../../src/data/repository.js';
import {openRunStore} from '../../src/data/run-store.js';
import {getExperiment} from '../../src/catalog/index.js';
import {createChartView} from '../../src/ui/chart-view.js';

const check=(value,message)=>{if(!value)throw new Error(message);};
export async function runMeasurementTests(report=()=>{}) {
  for(const sensor of ['magnetometer','accelerometer']) {
    const context=getExperiment(sensor), box=document.createElement('div'),canvas=document.createElement('canvas');
    box.style.cssText='width:600px;height:300px';box.append(canvas);document.body.append(box);
    try {
      for(const inspect of [false,true]) {
        const view=createChartView(canvas,{context,inspect});
        try {
          const values=Object.fromEntries(context.channels.map((c,i)=>[c.id,[-120,25,25,300][i]]));
          const samples=[{sampleId:1,receivedAt:1000,values}], before=JSON.stringify(samples);
          view.render(samples,0,{range:'all',events:[{source:'user',receivedAt:1000,type:'note'}]});
          const chart=Chart.getChart(canvas), datasets=chart.data.datasets.slice(0,4);
          check(new Set(datasets.map(d=>d.yAxisID)).size===1,sensor+': 같은 물리량이 서로 다른 축을 사용합니다.');
          const axis=chart.scales[datasets[0].yAxisID];
          check(Object.values(chart.scales).filter(scale=>scale.axis==='y').length===1,sensor+': 중복 세로축');
          check(axis.min<=-120&&axis.max>=300,sensor+': 음수 성분 또는 크기가 축 범위에서 누락되었습니다.');
          check(chart.getDatasetMeta(1).data[0].y===chart.getDatasetMeta(2).data[0].y,sensor+': 동일 값의 화면 높이가 다릅니다.');
          check(chart.data.datasets[4].yAxisID===datasets[0].yAxisID,'사건 표시의 축 연결이 끊겼습니다.');
          check(JSON.stringify(samples)===before,'공통 축이 원자료를 변경했습니다.');
        } finally {view.dispose();}
      }
    } finally {box.remove();}
  }
  report('자기장·가속도 측정/원자료 그래프 · 공통 세로축·음수/크기 범위·동일 값 높이·사건·원자료 보존');
  const fixture=await mountLabFixture({component:true}), {host}=fixture;fixture.showScreen('measure');
  const context=getExperiment('magnetometer'), databaseName='microbit.sensor-lab.measurement-tests.'+crypto.randomUUID();
  const repository=createRepository({databaseName});
  const store=await openRunStore({repository,context,source:'replay',create:true});
  let view;
  const origin=1700000000000;
  const add=id=>store.appendSample({sampleId:id,receivedAt:origin+id*200,values:{magneticX:id,magneticY:2,magneticZ:3,magneticStrength:100},validity:{magneticX:'valid',magneticY:'valid',magneticZ:'valid',magneticStrength:'valid'}});
  const options={context,store,latest:null,previewPoints:[],device:{status:'disconnected',confirmed:false},recording:false};
  try{
    for(let id=1;id<=1000;id++)add(id);
    store.appendEvent({type:'recording-paused',receivedAt:origin+100050,payload:{},source:'user'});
    const original=store.getSamples();
    view=createMeasurementView(host,()=>view.render(options));view.render(options);
    const range=host.querySelector('#live-range'), chart=()=>Chart.getChart(host.querySelector('canvas'));
    check(chart().data.datasets[0].data.filter(p=>p.sampleId).length===301,'최근 60초가 저장 시각 기준과 다릅니다.');
    check(chart().data.datasets[0].data.every(p=>Number.isFinite(p.x)),'보관된 원자료에 없는 monotonicAt을 사용했습니다.');
    range.value='all';range.dispatchEvent(new Event('change'));
    check(chart().data.datasets[0].data.filter(p=>p.sampleId).length===1000,'전체 기록이 600개 미리보기 버퍼에 잘렸습니다.');
    check(chart().data.datasets[0].data.some(p=>p.y===null),'5초보다 짧은 일시정지를 선으로 연결했습니다.');
    for(let id=1001;id<=1010;id++)add(id);view.render(options);
    check(chart().data.datasets[0].data.filter(p=>p.sampleId).length===1010,'새로 기록된 자료가 전체 그래프에 추가되지 않았습니다.');
    const x=host.querySelector('input[value="magneticX"]'), strength=host.querySelector('input[value="magneticStrength"]');
    clickVisible(x);clickVisible(strength);clickVisible(x);
    check(x.checked&&chart().data.datasets[0].label.includes('X'),'마지막 표시 채널까지 숨기거나 선택이 적용되지 않았습니다.');
    check(JSON.stringify(original)===JSON.stringify(store.getSamples().slice(0,1000)),'표시 전환이 원자료를 바꿨습니다.');
    check(host.querySelector('#measurement-reception').dataset.fresh==='false','보관된 값을 실시간 수신처럼 표시했습니다.');
    report('실제 측정 그래프 · 최근/전체 1,010개·UTC 시각·짧은 기록 공백·채널 선택과 원자료 보존');
  }finally{view?.dispose();await store.close();repository.close();fixture.dispose();await globalThis.idb.deleteDB(databaseName);}
}
