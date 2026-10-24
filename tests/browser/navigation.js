import { createController } from '../../src/app/controller.js';
import { mountLabFixture, clickLabControl, clickVisible } from './lab-fixture.js';
import { createRepository } from '../../src/data/repository.js';

const check=(value,message)=>{if(!value)throw new Error(message);};
const wait=async(predicate,message)=>{
  const end=performance.now()+10000;
  while(!predicate()&&performance.now()<end)await new Promise(resolve=>setTimeout(resolve,40));
  check(predicate(),message);
};

export async function runNavigationTests(report=()=>{}) {
  const originalUrl=location.href, databaseName='microbit.sensor-lab.navigation-tests.'+crypto.randomUUID();
  const repo=createRepository({databaseName}), commit=repo.commitBatch;
  let failSave=false, temporaryImport=false, app;
  repo.commitBatch=batch=>temporaryImport&&batch.insertOnly
    ?Promise.reject(Object.assign(new Error('검사용 저장소 사용 불가'),{code:'storage-unavailable'}))
    :failSave?Promise.reject(new Error('뒤로 가기 저장 실패')):commit(batch);
  const fixture=await mountLabFixture(),{host}=fixture;
  const $=selector=>host.querySelector(selector);
  const url=(path)=>new URL('../../'+path,import.meta.url).href;
  const click=async selector=>{await wait(()=>!app.getState().busy&&!$(selector).disabled,selector+' 비활성');clickLabControl(host,selector);await wait(()=>!app.getState().busy,selector+' 미완료');};
  try {
    history.replaceState(null,'',url('sensors/temperature/?mock=1&view=preview'));
    app=createController(host,{repository:repo,initialUrl:location.href});
    await wait(()=>!app.getState().busy,'미리보기 직접 진입 실패');
    check(app.getState().screen==='preview'&&!app.getState().context&&$('#experiment-title').textContent==='내장 온도 센서','직접 진입 시 미리보기 소속 오류');
    await click('#activate-experiment');
    await click('[data-guide-group="connection"]');await click('[data-guide-action="connect"]');
    await wait(()=>$('[data-guide-step="reception"]').dataset.complete==='true','모의 수신 확인 실패');
    await click('#to-measure');await click('#start-recording');
    await wait(()=>app.getState().storage.sampleCount>=3,'모의 기록 누락');
    const id=app.getState().storage.id;
    failSave=true;history.go(-2);
    await wait(()=>!app.getState().busy&&!$('#lab-error').hidden,'뒤로 가기 저장 실패 차단 누락');
    check(app.getState().screen==='measure'&&app.getState().storage.id===id,'뒤로 가기 실패가 현재 실험을 바꿨습니다.');
    check(new URL(location.href).searchParams.get('view')==='measure'&&$('#connection-status').textContent==='모의 연결','저장 실패 후 주소·연결을 보존하지 않았습니다.');
    failSave=false;
    history.pushState(null,'',url('lab.html?mock=1'));window.dispatchEvent(new PopStateEvent('popstate'));
    await wait(()=>!app.getState().busy&&app.getState().screen==='home','이력 이동으로 종료하지 못했습니다.');
    check(!app.getState().context&&!app.getState().storage&&$('#connection-status').textContent==='연결 안 됨','이력 이동이 종료 경계를 우회했습니다.');
    const snapshot=await repo.readSnapshot(id);
    check(snapshot.run.status==='complete'&&snapshot.samples.length>=3,'이력 이동이 기록을 보존하지 않았습니다.');
    report('이력 이동 · 저장 실패 시 기존 주소·연결 보존, 재시도 뒤 마감·연결 종료');

    history.pushState(null,'',url('sensors/magnetometer/?mock=1&view=preview'));window.dispatchEvent(new PopStateEvent('popstate'));
    await wait(()=>!app.getState().busy&&app.getState().screen==='preview','이력 미리보기 진입 실패');
    history.back();await wait(()=>!app.getState().busy&&app.getState().screen==='home','미리보기 뒤로 가기 실패');
    history.forward();await wait(()=>!app.getState().busy&&app.getState().screen==='preview','미리보기 앞으로 가기 실패');
    check(!app.getState().context&&!app.getState().storage&&$('#experiment-title').textContent===$('#preview-title').textContent,'미리보기가 이전 실험의 권한·이름을 복원했습니다.');
    report('미리보기 · 직접 주소·뒤로 가기·앞으로 가기에서 소속과 권한 유지');

    // Recreate the controller at the same URL, as on a reload, using the same isolated database.
    await app.dispose();await fixture.reset();
    app=createController(host,{repository:repo,initialUrl:location.href});
    await wait(()=>!app.getState().busy,'미리보기 재진입 실패');
    check(app.getState().screen==='preview'&&!app.getState().storage&&!app.getState().context&&$('#experiment-title').textContent===$('#preview-title').textContent,'새로 진입한 미리보기가 준비·기록으로 바뀌었습니다.');
    check((await repo.readSnapshot(id)).run.status==='complete','미리보기 재진입이 이전 기록을 바꿨습니다.');
    report('미리보기 재진입 · 기존 기록 자동 재개 없이 선택 대상 표시');

    temporaryImport=true;
    const legacy=await(await fetch(new URL('../fixtures/gay-lussac-v2.json',import.meta.url))).text();
    const files=new DataTransfer();files.items.add(new File([legacy],'temporary.json',{type:'application/json'}));
    $('#file-input').files=files.files;$('#file-input').dispatchEvent(new Event('change'));
    await wait(()=>!app.getState().busy&&app.getState().storage?.temporary,'임시 분석 열기 실패');
    const temporaryId=app.getState().storage.id, temporaryCount=app.getState().storage.sampleCount;
    clickVisible($('[data-view="home"]'));await wait(()=>$('#leave-dialog').open,'임시 분석 파일 보관 확인 누락');
    clickVisible($('#leave-dialog button[value=cancel]'));await wait(()=>!app.getState().busy,'임시 분석 종료 취소 실패');
    check(app.getState().screen==='analysis'&&app.getState().storage.id===temporaryId&&app.getState().storage.sampleCount===temporaryCount,'종료 취소가 임시 자료를 버렸습니다.');
    check(!$('[data-screen="analysis"]').inert,'종료 취소 뒤 분석 편집이 잠겼습니다.');
    report('임시 분석 · 파일 보관 전 종료 취소 시 원자료와 편집 권한 유지');
  } finally {
    failSave=false;await app?.dispose();fixture.dispose();repo.close();await globalThis.idb.deleteDB(databaseName);history.replaceState(null,'',originalUrl);
  }
}
