import {createMeasurementView} from '../../src/ui/measurement-view.js';
import {createRepository} from '../../src/data/repository.js';
import {openRunStore} from '../../src/data/run-store.js';
import {getExperiment} from '../../src/catalog/index.js';

const check=(value,message)=>{if(!value)throw new Error(message);};
export async function runMeasurementTests(report=()=>{}) {
  const parsed=new DOMParser().parseFromString(await (await fetch(new URL('../../lab.html',import.meta.url))).text(),'text/html');
  const host=document.importNode(parsed.querySelector('[data-screen="measure"]'),true);host.hidden=false;document.body.append(host);
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
    x.click();strength.click();x.click();
    check(x.checked&&chart().data.datasets[0].label.includes('X'),'마지막 표시 채널까지 숨기거나 선택이 적용되지 않았습니다.');
    check(JSON.stringify(original)===JSON.stringify(store.getSamples().slice(0,1000)),'표시 전환이 원자료를 바꿨습니다.');
    check(host.querySelector('#measurement-reception').dataset.fresh==='false','보관된 값을 실시간 수신처럼 표시했습니다.');
    report('실제 측정 그래프 · 최근/전체 1,010개·UTC 시각·짧은 기록 공백·채널 선택과 원자료 보존');
  }finally{view?.dispose();await store.close();repository.close();host.remove();await globalThis.idb.deleteDB(databaseName);}
}
