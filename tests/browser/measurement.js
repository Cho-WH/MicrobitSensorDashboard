import { mountLabFixture, clickVisible } from './lab-fixture.js';
import {createMeasurementView} from '../../src/ui/measurement-view.js';
import {createPointRecordingView} from '../../src/ui/point-recording-view.js';
import {createRepository} from '../../src/data/repository.js';
import {openRunStore} from '../../src/data/run-store.js';
import {getExperiment,getSensorRuntime,resolveExperiment} from '../../src/catalog/index.js';
import {createChartView} from '../../src/ui/chart-view.js';
import {buildExperimentJson,parseExperimentJson} from '../../src/data/files/json.js';
import {buildCsv,parseExperimentCsv} from '../../src/data/files/csv.js';
import {canResumeImportedRun} from '../../src/data/files/recording-source.js';
import {createWorkspace} from '../../src/analysis/workspace.js';
import {clockTime,formatClockTime} from '../../src/analysis/clock-time.js';

const check=(value,message)=>{if(!value)throw new Error(message);};
export async function runMeasurementTests(report=()=>{}) {
  await checkPointReadouts();
  await checkLiveRangeDefaults();
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
    store.appendEvent({type:'note',receivedAt:origin+100000,payload:{note:'한 점과 같은 시점'},source:'user'});
    store.appendPointRecord({capturedSampleId:500,capturedAt:origin+100150,manualValues:{}});
    store.appendPointRecord({capturedSampleId:501,capturedAt:origin+100350,manualValues:{}});
    const original=store.getSamples();
    view=createMeasurementView(host,()=>view.render(options));view.render(options);
    const range=host.querySelector('#live-range'), chart=()=>Chart.getChart(host.querySelector('canvas'));
    check(chart().data.datasets[0].data.filter(p=>p.sampleId).length===51&&chart().scales.x.min===-10,'최근 10초의 자료 또는 가로축 범위가 맞지 않습니다.');
    clickVisible(range.querySelector('summary'));clickVisible(range.querySelector('[data-live-range="recent"]'));
    check(chart().data.datasets[0].data.filter(p=>p.sampleId).length===301,'최근 60초가 저장 시각 기준과 다릅니다.');
    check(chart().scales.x.min===-60,'최근 60초로 바꿔도 가로축이 갱신되지 않았습니다.');
    check(chart().data.datasets[0].data.every(p=>Number.isFinite(p.x)),'보관된 원자료에 없는 monotonicAt을 사용했습니다.');
    check(!host.querySelector('[data-point-marker]'),'최근 구간 밖의 점을 표시했습니다.');
    clickVisible(range.querySelector('summary'));clickVisible(range.querySelector('[data-live-range="all"]'));
    check(host.querySelector('[data-point-marker="1"]')&&host.querySelector('.measurement-event-marker button'),'같은 수신 시점의 사건 또는 한 점 기록이 사라졌습니다.');
    clickVisible(host.querySelector('[data-point-marker="1"]'));
    check(host.querySelectorAll('dialog[open] [data-point-marker-id]').length===2,'묶인 점 표식에서 원래 기록이 누락됐습니다.');
    check(host.querySelector('[data-point-marker-id="1"] time').textContent===formatClockTime(clockTime(origin+100000)),'캡처 시각을 원자료 수신 시각 대신 표시했습니다.');
    clickVisible(host.querySelector('[data-point-marker-action="close"]'));
    store.setPointWithdrawn(1,true);store.setPointWithdrawn(2,true);view.render(options);
    check(!host.querySelector('[data-point-marker]')&&host.querySelector('.measurement-event-marker button'),'정지된 자료의 취소 표식 또는 사건 표시가 갱신되지 않았습니다.');
    store.setPointWithdrawn(1,false);view.render(options);
    check(host.querySelector('[data-point-marker="1"]'),'정지된 자료에서 원래 번호로 표식을 복원하지 못했습니다.');
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
  await checkAccelerationUnits(report);
}

async function checkLiveRangeDefaults() {
  const fixture=await mountLabFixture({component:true});fixture.showScreen('measure');
  const view=createMeasurementView(fixture.host,()=>{}), origin=1700000000000;
  try {
    for(const [sensor,activity,selected,min] of [['accelerometer',null,'recent10',-10],['ds18b20',null,'recent',-60],['bmp280','gay-lussac','all',0]]) {
      const context=getExperiment(sensor,activity), points=Array.from({length:61},(_,i)=>({receivedAt:origin+i*1000,
        values:Object.fromEntries(context.channels.map(c=>[c.id,20])),validity:Object.fromEntries(context.channels.map(c=>[c.id,'valid']))}));
      view.render({context,store:null,latest:points.at(-1),previewPoints:points,device:{status:'connected',confirmed:true},recording:false,displayNow:origin+60000});
      check(fixture.host.querySelector(`[data-live-range="${selected}"]`).getAttribute('aria-pressed')==='true',sensor+': 모듈의 초기 표시 구간이 반영되지 않았습니다.');
      const chart=Chart.getChart(fixture.host.querySelector('#live-chart'));
      check(chart.scales.x.min===min,sensor+': 기본 표시 구간과 시간축이 일치하지 않습니다.');
    }
  } finally {view.dispose();fixture.dispose();}
}

async function checkPointReadouts() {
  const fixture = await mountLabFixture({component:true}), {host} = fixture;
  fixture.showScreen('measure');
  let facts;
  const view = createPointRecordingView(host, {onCapture:()=>{},onChange:()=>view.render(facts),onError:error=>{throw error;}});
  const render = context => {
    facts = {context,store:null,latest:{values:Object.fromEntries(context.channels.map(channel=>[channel.id,20])),validity:Object.fromEntries(context.channels.map(channel=>[channel.id,'valid']))},
      device:{status:'connected',confirmed:true},captureState:{ready:true},busy:false,recordingMode:'point'};
    view.render(facts);
  };
  try {
    const magnetic = getExperiment('magnetometer'); magnetic.defaultGraph.yColumnId = 'magneticX';
    render(magnetic);
    const main = host.querySelector('.point-live-cards');
    check(main.querySelector('meter').getAttribute('aria-label')===magnetic.channels.find(channel=>channel.id==='magneticStrength').name,'분석 축이 대표 측정값을 바꿨습니다.');
    clickVisible(main.querySelector('summary'));
    main.querySelector('[data-point-field="minimum"]').value='0';
    const maximum=main.querySelector('[data-point-field="maximum"]');maximum.value='100';
    maximum.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    check([...host.querySelectorAll('#point-component-cards meter')].every(meter=>meter.min===-100&&meter.max===100),'명시된 성분의 대칭 눈금이 유지되지 않았습니다.');
    const unknown = {sensor:{id:'test-probes',version:1},activity:null,defaultGraph:{yColumnId:'second'},channels:[
      {id:'first',name:'검사용 첫 센서',quantity:'temperature',unit:'℃',min:0,max:100},
      {id:'second',name:'검사용 둘째 센서',quantity:'temperature',unit:'℃',min:10,max:50}]};
    render(unknown);
    const other = host.querySelector('#point-component-cards meter');
    check(other.min===10&&other.max===50,'동일한 물리량의 독립 채널을 방향 성분으로 처리했습니다.');
  } finally {view.dispose();fixture.dispose();}
}

async function checkAccelerationUnits(report) {
  const fixture=await mountLabFixture({component:true}),{host}=fixture;fixture.showScreen('measure');
  const context=getExperiment('accelerometer'),decode=getSensorRuntime(context).decode;
  const databaseName='microbit.sensor-lab.acceleration-tests.'+crypto.randomUUID();
  const repository=createRepository({databaseName});
  let store=await openRunStore({repository,context,source:'device',create:true}),view;
  const add=(id,line)=>{
    const reading=decode(line,{receivedAt:1700000000000+id*100});
    store.appendSample({sampleId:id,receivedAt:reading.receivedAt,values:reading.values,validity:reading.validity});
  };
  const options={context,store,latest:null,previewPoints:[],device:{status:'disconnected',confirmed:false},recording:false};
  const $=selector=>host.querySelector(selector),chart=()=>Chart.getChart($('#live-chart'));
  try {
    add(1,'-1000,0,1000,1414');
    view=createMeasurementView(host,()=>view.render(options));view.render(options);
    const before=JSON.stringify(store.getSamples());
    for(const input of host.querySelectorAll('#display-channels input:not(:checked)'))clickVisible(input);
    clickVisible($('#live-range summary'));clickVisible($('[data-live-range="all"]'));
    const toggle=$('#acceleration-unit-toggle');
    check(toggle.checkVisibility()&&toggle.getAttribute('aria-pressed')==='false','가속도 SI 기본 표시 또는 토글 누락');
    const axis=()=>chart().scales[chart().data.datasets[0].yAxisID];
    clickVisible($('[data-axis-zoom]'));
    const siBounds={min:axis().min,max:axis().max};
    clickVisible($('#display-channels input[value="accelerationY"]'));
    check($('[data-axis-zoom]').dataset.expanded==='true','표시 항목 변경이 같은 축의 확대 상태를 초기화했습니다.');
    clickVisible($('#display-channels input[value="accelerationY"]'));
    clickVisible(toggle);
    check($('[data-axis-zoom]').dataset.expanded==='true','단위 변경이 확대 상태를 초기화했습니다.');
    check(Math.abs(axis().min*9.80665-siBounds.min)<1e-10&&Math.abs(axis().max*9.80665-siBounds.max)<1e-10,'단위 변경이 같은 물리적 축 범위를 보존하지 않았습니다.');
    check($('[data-channel="accelerationX"] strong').textContent==='-1'&&$('[data-channel="accelerationX"] small').textContent==='g','실시간 숫자와 단위가 함께 바뀌지 않았습니다.');
    check(chart().data.datasets[0].data[0].y===-1,'g 그래프의 수치 환산 누락');
    const axes=Object.values(chart().scales).filter(axis=>axis.axis==='y');
    check(axes.length===1&&axes[0].options.title.text.includes('(g)'),'g 표시에서 공통 축·단위가 유지되지 않습니다.');
    check(JSON.stringify(store.getSamples())===before,'g 전환이 원자료를 바꿨습니다.');
    add(2,'-2000,0,2000,2828');view.render(options);
    check(chart().data.datasets[0].data[1].y===-2,'g 표시 중 새 기록을 표시하지 못했습니다.');
    check(store.getSamples()[1].values.accelerationX===-19.6133,'g 표시 중 기록 단위가 바뀌었습니다.');
    const snapshot=store.getSnapshot();
    for(const restored of [parseExperimentJson(buildExperimentJson(snapshot)),parseExperimentCsv(buildCsv(snapshot))]) {
      check(restored.run.context.channels.every(c=>c.unit==='m/s²'),'내보내기에 표시 단위가 저장되었습니다.');
      check(restored.samples[1].values.accelerationX===-19.6133,'내보내기·가져오기에서 SI 수치가 바뀌었습니다.');
    }
    const graph=createWorkspace({store}).getGraphData();
    check(graph.yUnit==='m/s²'&&graph.points[0].y>13,'분석에 g 표시가 섞였습니다.');
    clickVisible(toggle);
    check(chart().data.datasets[0].data[0].y===-9.80665&&$('[data-channel="accelerationX"] small').textContent==='m/s²','정지된 기록의 SI 복귀가 그려지지 않았습니다.');
    clickVisible($('[data-axis-zoom]'));
    check(axis().min<=-20&&axis().max>=store.getSamples()[1].values.accelerationStrength,'복원 범위가 기본 범위 또는 새로 받은 값을 누락했습니다.');
    clickVisible($('[data-axis-zoom]'));
    const replacement=await openRunStore({repository,context,source:'replay',create:true});
    try {
      const reading=decode('0,0,1000,1000',{receivedAt:1700000000000});
      replacement.appendSample({sampleId:1,receivedAt:reading.receivedAt,values:reading.values,validity:reading.validity});
      view.render({...options,store:replacement});
      check($('[data-axis-zoom]').dataset.expanded==='false'&&axis().max<30,'같은 센서의 새 실험에 이전 확대 또는 큰 범위가 남았습니다.');
    } finally {await replacement.close();}
    view.render(options);
    const id=store.getState().id;await store.close();store=await openRunStore({repository,id});
    check(store.getSamples()[1].values.accelerationX===-19.6133,'DB 재열기에서 SI 수치가 바뀌었습니다.');

    const old=structuredClone(snapshot);old.run.context=resolveExperiment({sensor:{id:'accelerometer',version:1}});
    old.samples=old.samples.map(row=>({...row,values:{accelerationX:-1000,accelerationY:0,accelerationZ:1000,accelerationStrength:1414}}));
    const restoredOld=parseExperimentJson(buildExperimentJson(old));
    check(restoredOld.samples[0].values.accelerationX===-1000&&restoredOld.run.context.channels.every(c=>c.unit==='mg'),'기존 mg 파일이 변환되거나 단위를 잃었습니다.');
    check(!canResumeImportedRun({...restoredOld.run,source:'import',importedFrom:{source:'device'}}),'기존 mg 기록에 SI 기록을 이어 붙일 수 있습니다.');
    view.render({...options,context:getExperiment('temperature'),store:null});
    check(toggle.hidden,'다른 물리량에 g 토글이 노출되었습니다.');
    view.render({...options,store});
    check(toggle.getAttribute('aria-pressed')==='false','실험 변경 후 g 표시 상태가 남았습니다.');
    report('가속도 SI 기록 · g 표시 토글·공통 축·새 수신·DB/JSON/CSV·분석 분리·이전 mg 파일 보존');
  } finally {view?.dispose();await store.close();repository.close();fixture.dispose();await globalThis.idb.deleteDB(databaseName);}
}
