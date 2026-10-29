import { rendered, until } from './render.js';
import { composeGuideSteps } from '../../src/guide/steps.js';
import { mountLabFixture, clickLabControl, clickVisible } from './lab-fixture.js';
import { startApp } from '../../src/app/startup.js';
import { createRepository } from '../../src/data/repository.js';
import { buildExperimentJson, parseExperimentJson } from '../../src/data/files/json.js';
import { buildCsv, parseExperimentCsv } from '../../src/data/files/csv.js';

const check=(value,message)=>{if(!value)throw new Error(message);};


// Runs the actual controller, DOM, charts and isolated IndexedDB with explicitly simulated readings.
export const appFlows = ['activity', 'magnetic', 'temperature', 'light-level', 'accelerometer', 'start-race'];

export async function runAppTests(report=()=>{}, flow='activity') {
  const databaseName='microbit.sensor-lab.app-tests.'+crypto.randomUUID(), repo=createRepository({databaseName});
  let delayCreate=false, releaseCreate, failSave=false, delaySave=false, releaseSave;
  const commit=repo.commitBatch;
  repo.commitBatch=async batch=>{
    if(failSave)throw new Error('검사용 저장 실패');
    if(delaySave){delaySave=false;await new Promise(resolve=>{releaseSave=resolve;});}
    if(delayCreate&&batch.insertOnly){delayCreate=false;await new Promise(resolve=>{releaseCreate=resolve;});}
    return commit(batch);
  };
  const fixture=await mountLabFixture(),{host}=fixture;
  const $=selector=>host.querySelector(selector);
  const click=async selector=>{await until(()=>!app.getState().busy&&$(selector)&&!$(selector).disabled,'조작 비활성: '+selector);clickLabControl(host,selector);await until(()=>!app.getState().busy,'조작 완료 시간 초과: '+selector);await rendered();check($('#lab-error').hidden,$('#lab-error').textContent);};
  // Advance only explicit reception waits. DOM/IDB waits remain observable-state waits.
  const receiveUntil=async(predicate,message)=>{
    if(!globalThis.advanceReceptionClock)return until(predicate,message);
    for(let elapsed=0;elapsed<12000&&!predicate();elapsed+=100)await globalThis.advanceReceptionClock(100);
    check(predicate(),message);
  };
  let app;
  const confirmExit=async()=>{await until(()=>$('#leave-dialog').open,'도구 종료 확인 누락');clickVisible($('#leave-save'));};
  const select=async path=>{
    await click(`[href*="/${path}/"]`);await until(()=>app.getState().screen==='preview','실험 미리보기 누락');
    check(!app.getState().context&&!app.getState().storage,'미리보기에 활성 실험 권한이 남았습니다.');
    check($('#experiment-title').textContent===$('#preview-title').textContent,'미리보기와 상단 실험 이름이 다릅니다.');
    check($('[data-view="measure"]').disabled&&$('#connect').disabled&&$('#start-recording').disabled,'미리보기에서 장치·기록 권한을 얻었습니다.');
    await click('#activate-experiment');
    await until(()=>app.getState().screen==='prepare'||$('#leave-dialog').open,'준비 화면 전환 응답 누락');
    if($('#leave-dialog').open){check(!app.getState().session?.recording,'검사의 자동 이동이 진행 중 기록을 마치려고 합니다.');clickVisible($('#leave-save'));}
    await until(()=>app.getState().screen==='prepare','준비 화면 전환 실패');
  };
  const step=async id=>{const item=composeGuideSteps(app.getState().context).find(item=>item.id===id);await click(`[data-guide-group="${item.group}"]`);const node=$(`[data-guide-step="${id}"]`);if(node.getClientRects().length)await click(`[data-guide-step="${id}"]`);};
  const confirm=async id=>{await step(id);await click(`[data-guide-action="${id==='program'?'program-confirm':'confirm'}"]`);};
  try {
    app=await startApp(host,{repository:repo,historyEnabled:false,initialUrl:new URL('../../lab.html?mock=1',import.meta.url).href});
    await until(()=>!app.getState().busy,'초기 화면 준비 실패');
    check(app.getState().screen==='home'&&!app.getState().storage&&!app.getState().context,'홈에서 활성 실험 또는 Run을 만들었습니다.');
    check(!$('#experiment-title').textContent&&$('.lab-status').hidden,'홈에 이전 실험 이름 또는 장치 상태가 남았습니다.');
    check((await repo.listRuns()).length===0,'기록 시작 전 DB에 Run이 있습니다.');
    if(flow==='activity') {
      await select('sensors/bmp280');
      check(!app.getState().storage,'센서 선택에서 Run을 만들었습니다.');
      for(const id of ['equipment','vcc','gnd','scl','sda','program']) await confirm(id);
      await step('connection');await click('[data-guide-action="connect"]');
      await receiveUntil(()=>$('.guide-status').textContent.includes('준비 완료'),'BMP 준비 수신 확인 실패');
      await click('#to-measure');await click('#start-recording');
      await receiveUntil(()=>app.getState().storage?.sampleCount>=3,'모의 BMP 기록 실패');
      const firstId=app.getState().storage.id;
      await click('[data-view="analysis"]');await click('#tab-interpretation');
      $('#reflection-observation').value='첫 실험의 관찰 기록';
      // Deliberately leave the edit as a DOM draft; exiting must flush it.
      failSave=true; clickVisible($('[data-view="home"]'));
      await confirmExit();
      await until(()=>!app.getState().busy&&!$('#lab-error').hidden,'저장 실패 시 이탈 차단 누락');
      check(app.getState().screen==='analysis'&&app.getState().storage.id===firstId,'저장 실패에도 실험을 나갔습니다.');
      check($('#connection-status').textContent==='모의 연결','저장 실패 때 연결을 해제했습니다.');
      check($('#reflection-observation').value==='첫 실험의 관찰 기록','저장 실패 때 작성 내용을 잃었습니다.');
      failSave=false;delaySave=true;clickVisible($('[data-view="home"]'));
      await confirmExit();
      await until(()=>typeof releaseSave==='function','저장 완료 대기 경계 누락');
      const stoppingCount=app.getState().storage.sampleCount;
      // Fault injection: an out-of-screen request must still be rejected while saving.
      $('[href*="/sensors/magnetometer/"]').click();
      check(app.getState().screen==='analysis'&&!app.getState().targetContext,'저장 중 새 실험으로 진입했습니다.');
      await new Promise(resolve=>setTimeout(resolve,350));
      check(app.getState().storage.sampleCount===stoppingCount,'마감 저장 중 원자료가 추가되었습니다.');
      releaseSave();await until(()=>app.getState().screen==='home'&&!app.getState().busy,'저장 완료 뒤 실험 선택 이동 실패');
      check(!app.getState().context&&!app.getState().storage&&!app.getState().session,'홈에서 실험 소유권을 해제하지 않았습니다.');
      check(!$('#experiment-title').textContent&&$('.lab-status').hidden&&$('#connection-status').textContent==='연결 안 됨','홈에 실험 이름·연결이 남았습니다.');
      check(!(await navigator.locks.query()).held.some(lock=>lock.name.endsWith(':run:'+firstId)),'실험 종료 후 작성 잠금이 남았습니다.');
      const savedBmp=await repo.readSnapshot(firstId);
      check(savedBmp.run.status==='complete'&&savedBmp.events.filter(event=>event.type==='measurement-end').length===1,'저장 재시도에서 기록 마감이 누락되거나 중복됐습니다.');
      check(savedBmp.workspace.bySource.recorded.reflection.answers.observation==='첫 실험의 관찰 기록','실험실 종료 시 분석 초안을 저장하지 않았습니다.');
      report('실험실 종료 · 저장 실패 시 머무르기, 재시도·마감·초안 보존 후 연결과 작성 잠금 해제');

      await select('activities/gay-lussac');
      check(app.getState().context.activity?.id==='gay-lussac','선택한 활동으로 전환되지 않았습니다.');
      check($('[data-guide-step="vcc"]')?.dataset.complete==='false'&&$('[data-guide-step="program"]')?.dataset.complete==='false','종료한 실험의 준비 권한을 재사용했습니다.');
      check($('[data-guide-step="connection"]').dataset.complete==='false','새 실험이 이전 연결을 이어받았습니다.');
      check($('[data-guide-step="battery"]').dataset.complete==='false','활동의 배터리 검사가 자동완료되었습니다.');
      for(const id of ['equipment','vcc','gnd','scl','sda','program']) await confirm(id);
      await step('connection');await click('[data-guide-action="connect"]');
      await receiveUntil(()=>$('[data-guide-step="reception"]').dataset.complete==='true','새 실험의 수신 확인 실패');
      await step('battery');await click('[data-guide-action="battery"]');await confirm('placement');
      await receiveUntil(()=>$('.guide-status').textContent.includes('준비 완료'),'분리 뒤 새 수신을 기다리는 배터리 검사 실패');
      check(savedBmp.samples.length>0&&savedBmp.events.some(event=>event.type==='measurement-end'),'전환 전 자료/기록 마감이 저장되지 않았습니다.');
      check(savedBmp.run.context.setup.simulated===true,'모의 준비가 실제 장치 근거로 저장되었습니다.');
      report('실험실 경계 · 미리보기 제목·장치 권한 분리, 같은 센서의 새 실험도 독립적으로 준비');

      await click('#to-measure');
      if(!$('.experiment-guide').open)await click('#show-experiment-guide');
      check(!app.getState().storage&&$('[data-guide-recording]').hidden,'안내를 열어 기록을 시작하거나 기록 중으로 표시했습니다.');
      await click('.experiment-guide-close');
      check(document.activeElement===$('#show-experiment-guide'),'실험 안내를 닫은 뒤 초점을 돌려주지 않았습니다.');
      await click('#start-recording');await receiveUntil(()=>app.getState().session?.reception==='receiving','활동 기록의 안정적인 수신 확인 실패');
      const activityId=app.getState().storage.id;
      for(let i=0;i<2;i++){await click('[data-memo-preset="water-added"]');$('#event-note').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}
      const beforeGuide=app.getState().storage.sampleCount;
      await click('#show-experiment-guide');
      check(!$('[data-guide-recording]').hidden,'기록 중 안내 문구가 빠졌습니다.');
      const pages=$('.experiment-guide-pages').querySelectorAll('button');
      pages[0].focus();pages[0].dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
      check(pages[3].getAttribute('aria-current')==='step'&&document.activeElement===pages[3],'실험 안내 키보드 이동 실패');
      await receiveUntil(()=>app.getState().storage.sampleCount>beforeGuide+2,'안내를 보는 동안 기록이 멈췄습니다.');
      await click('.experiment-guide-close');await click('#finish-recording');
      const activityData=await repo.readSnapshot(activityId);
      check(activityData.events.filter(event=>event.type==='note').length===2&&activityData.events.some(event=>event.type==='measurement-end'),'반복한 물 추가 또는 마감 기록이 보관되지 않았습니다.');
      report('M2 통합 · 활동 안내·키보드·초점 복귀, 기록 유지와 반복 물 추가 저장');

    }

    if(flow==='magnetic') {
      await select('sensors/magnetometer');
      await step('connection');await click('[data-guide-action="connect"]');
      await until(()=>!$('[data-device-action="skip"]').disabled&&$('.magnetic-preparation').dataset.phase==='choice','자기장 보정 선택 누락');
      check(!app.getState().storage&&$('.guide-reception').hidden,'보정 선택 중 Run 또는 빈 수치 칸이 나타납니다.');
      await click('[data-device-action="skip"]');
      await receiveUntil(()=>$('[data-guide-step="reception"]').dataset.complete==='true','자기장 수신 확인 실패');
      check(!$('.guide-status').textContent.includes('준비 완료'),'숫자 수신을 보정 완료로 추정했습니다.');
      await click('[data-guide-action="measure"]');await click('.experiment-guide [data-guide-next]');await click('#start-recording');
      await receiveUntil(()=>app.getState().storage?.sampleCount>=3,'자기장 기록 실패');
      const magnetId=app.getState().storage.id;
      check($('#live-cards').children.length===4,'자기장 네 채널 표시 누락');
      const visible=()=>[...$('#display-channels').querySelectorAll(':checked')].map(input=>input.value);
      check(visible().join(',')==='magneticStrength','자기장 기본 그래프가 크기가 아닙니다.');
      await click('#display-channels input[value="magneticX"]');await click('#display-channels input[value="magneticStrength"]');
      check(visible().join(',')==='magneticX','표시 채널 선택을 바꾸지 못했습니다.');
      await click('#disconnect');check($('#connect').disabled,'기록 중 재연결이 새 보정을 시작할 수 있습니다.');
      await receiveUntil(()=>!$('#measurement-reconnect').hidden&&!$('#measurement-reconnect').disabled,'연결 해제 후 측정 조작부에 재연결이 표시되지 않습니다.');
      check($('#reconnect').disabled&&!$('#measurement-reconnect').disabled,'측정 조작부에서 기록을 일시정지하고 재연결할 수 없습니다.');
      const pausedCount=app.getState().storage.sampleCount;
      await click('#measurement-reconnect');
      await receiveUntil(()=>!$('#resume-recording').disabled,'재연결 수신 실패');
      check(app.getState().session.state==='paused','재연결 후 사용자의 기록 재개를 기다리지 않습니다.');
      check(app.getState().screen==='measure','재연결이 측정 화면을 벗어났습니다.');
      check(app.getState().storage.sampleCount===pausedCount,'재연결만으로 기록이 재개됐습니다.');
      check($('[data-guide-step="calibration"]').dataset.complete==='false','재연결에서 예전 보정 근거를 복원했습니다.');
      await click('#resume-recording');
      await click('#finish-recording');
      await until(()=>app.getState().storage.status==='clean','자기장 기록 저장 실패');
      const magnetic=await repo.readSnapshot(magnetId), json=parseExperimentJson(buildExperimentJson(magnetic)), csv=parseExperimentCsv(buildCsv(magnetic));
      check(magnetic.run.context.setup.calibration==='skipped'&&json.run.context.setup.calibration==='skipped'&&Object.keys(magnetic.run.context.setup.confirmations).length===0,'체크를 생략한 기록에 준비 확인을 꾸며 넣었습니다.');
      check(JSON.stringify(json.samples)===JSON.stringify(magnetic.samples),'자기장 JSON 원자료 왕복 손실');
      check(magnetic.samples.every(sample=>Object.keys(sample.values).length===4),'그래프에서 숨긴 채널이 원자료에서 빠졌습니다.');
      check(csv.samples.length===magnetic.samples.length&&Object.keys(csv.samples[0].values).length===4,'자기장 CSV 왕복 채널 손실');
      await click('[data-view="analysis"]');check(!$('#analysis-message').textContent.includes('오류'),'자기장 분석 화면 오류');
      report('M2 통합 · 자기장 보정 생략 선택·저장·미확인 이력 보존, 재연결·재개, JSON/CSV·분석');

    }

    for(const [sensorId,channelIds,unit] of [
      ['temperature',['temperatureC'],'℃'],
      ['light-level',['lightLevel'],'상대값'],
      ['accelerometer',['accelerationX','accelerationY','accelerationZ','accelerationStrength'],'m/s²'],
    ].filter(([sensorId])=>sensorId===flow)) {
      if(sensorId==='temperature') {
        await select('sensors/bmp280');await confirm('program');
        clickVisible($('[data-view="home"]'));await confirmExit();
        await until(()=>!app.getState().busy,'도구 종료 미완료');await rendered();
      }
      await select('sensors/'+sensorId);
      check(composeGuideSteps(app.getState().context).map(item=>item.id).join(',')==='equipment,program,connection,reception',sensorId+': 불필요한 USB 확인·배선·보정 안내');
      check($('[data-guide-step="program"]').dataset.complete==='false',sensorId+': 다른 센서의 설치 확인을 재사용했습니다.');
      await step('connection');await click('[data-guide-action="connect"]');
      await receiveUntil(()=>!$('[data-guide-action="measure"]').hidden&&!$('[data-guide-action="measure"]').disabled,sensorId+': 체크를 생략한 새 수신 확인 실패');
      await click('[data-guide-action="measure"]');await click('.experiment-guide [data-guide-next]');await click('#start-recording');
      await receiveUntil(()=>app.getState().storage?.sampleCount>=3,sensorId+': 모의 기록 실패');
      const runId=app.getState().storage.id;
      check($('#live-cards').children.length===channelIds.length,sensorId+': 실시간 채널 누락');
      if(sensorId==='accelerometer')check([...$('#display-channels').querySelectorAll(':checked')].map(input=>input.value).join(',')==='accelerationStrength','가속도 기본 그래프가 크기가 아닙니다.');
      await click('#finish-recording');await until(()=>app.getState().storage.status==='clean',sensorId+': 저장 미완료');
      const snapshot=await repo.readSnapshot(runId), json=parseExperimentJson(buildExperimentJson(snapshot)), csv=parseExperimentCsv(buildCsv(snapshot));
      check(snapshot.run.context.setup.simulated===true,sensorId+': 모의 기록 표시 누락');
      check(JSON.stringify(json.samples)===JSON.stringify(snapshot.samples),sensorId+': JSON 원자료 손실');
      check(snapshot.samples.every(sample=>Object.keys(sample.values).join(',')===channelIds.join(',')),sensorId+': 숨긴 채널을 포함한 원자료 누락');
      check(csv.samples.length===snapshot.samples.length&&csv.samples.every((sample,index)=>JSON.stringify(sample.values)===JSON.stringify(snapshot.samples[index].values)),sensorId+': CSV 값 손실');
      check([json,csv].every(data=>data.run.context.channels.every(channel=>channel.unit===unit)),sensorId+': 파일 단위 변경');
      await click('[data-view="analysis"]');
      check($('#scope-count').textContent.includes(snapshot.samples.length+'개'),sensorId+': 저장 자료 분석 실패');
      report(`내장 센서 통합 · ${sensorId} 준비·기록·DB 저장, ${channelIds.length}채널 JSON/CSV·단위·분석`);
    }

    if(flow==='accelerometer') {
      const legacy=await (await fetch(new URL('../fixtures/gay-lussac-v2.json',import.meta.url))).text();
      const files=new DataTransfer();files.items.add(new File([legacy],'gay-lussac-v2.json',{type:'application/json'}));
      $('#file-input').files=files.files;$('#file-input').dispatchEvent(new Event('change'));
      await until(()=>$('#leave-dialog').open||app.getState().storage?.source==='import'||!$('#lab-error').hidden,'파일 열기 응답 누락');
      if($('#leave-dialog').open) clickVisible($('#leave-save'));
      await until(()=>app.getState().storage?.source==='import'&&app.getState().screen==='analysis','M2에서 기존 파일 열기 실패');
      await click('[data-view="measure"]');check(!$('#connect').disabled&&$('#start-recording').disabled&&!app.getState().session.recording,'호환 파일의 명시적 이어 측정과 새 기록 시작을 구분하지 않았습니다.');
      const imported=await repo.readSnapshot(app.getState().storage.id);
      check(imported.samples.length===parseExperimentJson(legacy).samples.length,'기존 파일 원자료 개수 손실');
      report('M2 통합 · 기존 게이뤼삭 파일 분석과 수신 자료 분리');

    }

    if(flow==='start-race') {
      await select('sensors/magnetometer');
      for(const id of ['equipment','program']) await confirm(id);
      await click('#to-measure');
      if($('.experiment-guide').open)await click('.experiment-guide [data-guide-next]');
      await click('#connect');
      check(app.getState().screen==='prepare','측정 화면에서 연결한 장치의 준비 선택으로 이동하지 않았습니다.');
      check(!$('#measurement-settings').open&&!host.querySelector('dialog:modal'),'준비 화면으로 이동한 뒤 숨은 설정창이 조작을 막습니다.');
      await step('connection');await click('[data-device-action="calibrate"]');
      await receiveUntil(()=>$('.guide-status').textContent.includes('준비 완료'),'시작 경합 검사 준비 실패');await click('#to-measure');
      const beforeCreate=(await repo.listRuns()).length;delayCreate=true;
      await receiveUntil(()=>!$('#start-recording').disabled,'기록 시작 경합 검사 준비 실패');clickVisible($('#start-recording'));
      await until(()=>typeof releaseCreate==='function','DB 생성 지연 경계 누락');
      clickLabControl(host,'#disconnect');releaseCreate();
      await until(()=>!app.getState().busy,'생성 중 단절 처리 미완료');
      check(!app.getState().storage&&(await repo.listRuns()).length===beforeCreate,'준비 무효화 후 빈 Run/기록을 남겼습니다.');
      check($('#lab-error').textContent.includes('기록을 시작하지'),'시작 취소 원인을 알리지 않았습니다.');
      report('M2 통합 · DB 생성 대기 중 단절은 기록 시작·빈 Run 생성 취소');
    }
  } finally {
    failSave=false;delaySave=false;delayCreate=false;releaseSave?.();releaseCreate?.();
    await app?.dispose();fixture.dispose();repo.close();await globalThis.idb.deleteDB(databaseName);
  }
}
