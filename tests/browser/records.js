import { startApp } from '../../src/app/startup.js';
import { createRepository } from '../../src/data/repository.js';
import { openRunStore } from '../../src/data/run-store.js';
import { parseExperimentJson } from '../../src/data/files/json.js';
import { mountLabFixture, clickLabControl, clickVisible } from './lab-fixture.js';
import { createRecordDialogs } from '../../src/ui/record-dialogs.js';
import { buildCsv, buildAnalysisCsv, parseExperimentCsv } from '../../src/data/files/csv.js';

const check=(value,message)=>{if(!value)throw new Error(message);};
const equal=(a,b,message)=>check(JSON.stringify(a)===JSON.stringify(b),message);
async function until(predicate,message) {
  const end=performance.now()+12000;
  while(!predicate()&&performance.now()<end)await new Promise(resolve=>setTimeout(resolve,40));
  check(predicate(),message);
}
// Durable UI integration: isolated IndexedDB, simulated device, real dialogs and storage failures.
export async function runRecordTests(report=()=>{}) {
  const databaseName='microbit.sensor-lab.records-tests.'+crypto.randomUUID(),repo=createRepository({databaseName});
  const fixture=await mountLabFixture(),{host}=fixture;
  const $=selector=>host.querySelector(selector);
  let failSave=false,failDelete=false,app,reader;
  const commit=repo.commitBatch,remove=repo.deleteRun;
  repo.commitBatch=batch=>failSave?Promise.reject(new Error('검사용 저장 실패')):commit(batch);
  repo.deleteRun=id=>failDelete?Promise.reject(new Error('검사용 삭제 실패')):remove(id);
  const idle=()=>until(()=>!app.getState().busy,'조작 완료 대기');
  const click=async selector=>{await idle();clickLabControl(host,selector);};
  const submit=selector=>clickVisible($(selector+' [type=submit]'));
  try {
    app=await startApp(host,{repository:repo,historyEnabled:false,initialUrl:new URL('../../lab.html?mock=1',import.meta.url).href});await idle();
    const text=await(await fetch(new URL('../fixtures/gay-lussac-v2.json',import.meta.url))).text(),original=parseExperimentJson(text);
    const files=new DataTransfer();files.items.add(new File([text],'legacy.json',{type:'application/json'}));
    $('#file-input').files=files.files;$('#file-input').dispatchEvent(new Event('change'));
    await until(()=>app.getState().storage?.source==='import','가져오기 실패');await idle();
    const id=app.getState().storage.id, before=await repo.readSnapshot(id);
    check(!app.getState().session.recording,'가져오기가 기록을 시작함');
    equal(before.samples.map(s=>s.values),original.samples.map(s=>s.values),'원본 값 변경');

    const event=before.events.find(e=>e.source==='user');
    await click(`#analysis-events [data-event-id="${event.eventId}"]`);
    await until(()=>$('#memo-editor').matches(':popover-open'),'메모 편집 없음');
    $('#event-note').value='원본 조작을 다시 확인함';failSave=true;
    $('#event-note').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await until(()=>app.getState().storage.status==='error','저장 실패가 표시되지 않음');
    await click(`#analysis-events [data-event-id="${event.eventId}"]`);
    check($('#event-note').value==='원본 조작을 다시 확인함','실패 시 메모 손실');
    $('#event-note').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    failSave=false;await click('#retry-save');await idle();
    const noted=await repo.readSnapshot(id);
    equal(noted.samples,before.samples,'메모 수정이 원자료 변경');
    equal(noted.workspace,before.workspace,'메모 수정이 분석 변경');
    check(noted.events[event.eventId-1].receivedAt===event.receivedAt&&noted.events[event.eventId-1].payload.note==='원본 조작을 다시 확인함','메모/시각 저장 실패');
    report('조작 메모 · 저장 실패 후 초안·시각·원자료·분석 보존 및 재시도');

    await click('[data-view="measure"]');await idle();
    await click('#connect');await until(()=>!$('#resume-recording').disabled,'호환 파일의 장치 준비 실패');
    const count=app.getState().storage.sampleCount;
    check(count===before.samples.length,'미리보기가 원본 뒤에 기록됨');
    await click('#resume-recording');await until(()=>app.getState().storage.sampleCount>count,'이어 측정 실패');
    await click('#pause-recording');await idle();
    await click('[data-memo-preset="water-added"]');$('#event-note').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await idle();
    await click('[data-memo-preset="lid-opened"]');
    $('#event-note').value+=' · 센서 위치 확인';$('#event-note').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await idle();
    await click('#finish-recording');await idle();
    const completed=await repo.readSnapshot(id);equal(completed.samples.slice(0,count),before.samples,'이어 측정이 원본 값 변경');
    const prior=before.workspace.bySource.recorded, current=completed.workspace.bySource.recorded;
    for(const key of ['appliedScope','exclusions','calculatedColumns','graph','reflection'])
      equal(current[key],prior[key],'기록 마치기 자동 반영이 기존 분석 설정/근거 변경: '+key);
    equal(current.appliedIds,prior.appliedScope==='all'?completed.samples.map(sample=>sample.sampleId):prior.appliedIds,'자동 반영 범위가 전체/지정 선택을 따르지 않음');
    check(current.appliedThroughSampleId===completed.samples.at(-1).sampleId,'기록 마치기의 최신 분석 입력이 저장되지 않음');
    check(completed.events.some(e=>e.type==='note'&&e.payload.note.includes('센서 위치 확인')),'일시정지 중 장치 변화 누락');
    report('원본 JSON 이어 측정 · 수신 미리보기 분리·기존 분석 보존·일시정지 중 물/장치 변화');

    await click('#additional-recording');await until(()=>$('#additional-dialog')?.open,'추가 조건 폼 없음');
    $('#additional-dialog [name=sameContext]').checked=true;
    for(const [name,value] of [['container','same'],['seal','changed'],['sensor','unsure']])$('#additional-dialog [name='+name+']').value=value;
    submit('#additional-dialog');await until(()=>$('#additional-dialog .record-dialog-error').textContent.includes('메모'),'변경 조건 메모가 필수가 아님');
    $('#additional-dialog textarea').value='뚜껑을 다시 닫음';submit('#additional-dialog');await idle();
    await click('#finish-recording');await idle();
    const added=await repo.readSnapshot(id), additional=added.events.findLast(e=>e.type==='additional-measurement');
    check(additional.payload.conditions.seal==='changed'&&additional.payload.conditions.sensor==='unsure','조건의 변경/불확실 구분 손실');
    // Luminous marker/list details must use edited notes even when the event count is unchanged.
    const noteButton=$('#lab-events [data-memo-action="edit"]'), noteId=Number(noteButton.closest('[data-memo-id]').dataset.memoId);
    clickVisible(noteButton);await until(()=>$('#memo-editor').matches(':popover-open'),'측정 메모 편집 연결 실패');
    $('#event-note').value='';$('#event-note').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await until(()=>app.getState().storage.status==='clean','메모 저장 미완료');
    check((await repo.readSnapshot(id)).events.find(e=>e.eventId===noteId).payload.note==='','메모 비우기 실패');
    report('추가 조건별 변경·불확실/필수 메모 보존, 측정 완료 후 메모 비우기');

    await click('[data-view="saved"]');await until(()=>$('[data-rename-run]'),'저장된 목록 없음');
    await click(`[data-rename-run="${id}"]`);await until(()=>$('#rename-run-dialog')?.open,'이름 변경 없음');
    $('#rename-run-dialog input').value='통합 후 다시 측정한 실험';submit('#rename-run-dialog');await idle();
    check((await repo.readSnapshot(id)).run.name==='통합 후 다시 측정한 실험','이름 저장 실패');
    reader=await openRunStore({repository:repo,id});check(!reader.getState().writable,'다른 탭의 작성 잠금 손실');reader.dispose();reader=null;
    await click(`[data-delete-run="${id}"]`);await until(()=>$('#delete-run-dialog')?.open,'삭제 확인 없음');
    clickVisible($('#delete-run-dialog button[type=button]'));await idle();check(await repo.readSnapshot(id),'삭제 취소로 원자료 손실');
    failDelete=true;await click(`[data-delete-run="${id}"]`);await until(()=>$('#delete-run-dialog')?.open,'삭제 확인 없음');submit('#delete-run-dialog');
    await until(()=>$('#delete-run-dialog .record-dialog-error').textContent.includes('삭제 실패'),'삭제 실패 알림 없음');check(await repo.readSnapshot(id),'삭제 실패로 자료 손실');
    failDelete=false;submit('#delete-run-dialog');
    // Removing the active run also leaves its tool; acknowledge the existing exit confirmation.
    await until(()=>$('#leave-dialog').open,'현재 실험 삭제 후 도구 종료 확인 없음');
    clickVisible($('#leave-save'));await idle();check(!await repo.readSnapshot(id),'삭제 재시도 실패');
    report('실험 관리 · 이름 저장·단일 작성자 잠금·삭제 확인/취소·삭제 실패/재시도');

    const dialogs=createRecordDialogs(host), snapshot=structuredClone(added);let exported;
    const task=dialogs.exportCsv(snapshot,ids=>{exported=parseExperimentCsv(buildAnalysisCsv(snapshot,ids));});
    const inputs=[...$('#analysis-export-dialog').querySelectorAll('input[type=checkbox]')];check(inputs.length>1,'계산 열 선택 없음');
    inputs.forEach(input=>{input.checked=false;});inputs[0].checked=true;inputs[0].dispatchEvent(new Event('change',{bubbles:true}));submit('#analysis-export-dialog');await task;
    check(exported.run.importedColumns.length===1,'선택하지 않은 계산 열까지 CSV에 포함');
    equal(snapshot,added,'CSV 선택이 분석을 변경');dialogs.dispose();
    report('분석 CSV · 선택한 계산 열만 실제 CSV로 왕복, 분석 상태 보존');
    exported.run.timeOrigin = exported.samples[0].receivedAt - 60125;
    const csvFiles = new DataTransfer();
    csvFiles.items.add(new File([buildCsv(exported)], '경과 시간.csv', {type:'text/csv'}));
    $('#file-input').files = csvFiles.files; $('#file-input').dispatchEvent(new Event('change'));
    await until(() => app.getState().storage?.source === 'import' && app.getState().storage.id !== id, '경과 시간 CSV 가져오기 실패'); await idle();
    const restoredId = app.getState().storage.id, restored = await repo.readSnapshot(restoredId);
    check(restored.run.timeOrigin === exported.run.timeOrigin, 'CSV 기준 시각이 DB에 보관되지 않았습니다.');
    reader = await openRunStore({repository:repo,id:restoredId});
    check(reader.getSnapshot().run.timeOrigin === exported.run.timeOrigin && reader.getState().timeOrigin === exported.run.timeOrigin,
      '다시 연 실험에서 경과 시간 기준이 사라졌습니다.');
    reader.dispose(); reader = null;
    report('실제 CSV 업로드 · 경과 시간 기준의 DB 저장·재열기 보존');
    const conflicted = globalThis.Papa.parse(buildCsv(exported).replace(/^\uFEFF/, '')).data;
    const elapsedColumn = conflicted[0].indexOf('elapsed_seconds');
    conflicted[2][elapsedColumn] = String(Number(conflicted[2][elapsedColumn]) + 1);
    const conflictingCsv = globalThis.Papa.unparse(conflicted), beforeRecovery = await repo.readSnapshot(restoredId);
    const runCount = (await repo.listRuns()).length;
    const uploadConflict = () => {
      const files = new DataTransfer(); files.items.add(new File([conflictingCsv], '시간 확인.csv', {type:'text/csv'}));
      $('#file-input').files = files.files; $('#file-input').dispatchEvent(new Event('change'));
    };
    uploadConflict(); await until(() => $('#csv-time-dialog')?.open, '시간 복원 선택이 표시되지 않았습니다.');
    check($('#csv-time-dialog').querySelectorAll('button').length === 2, '시간 복원에 불필요한 선택지가 있습니다.');
    clickVisible($('#csv-time-dialog button[type=button]')); await idle();
    check(app.getState().storage.id === restoredId && (await repo.listRuns()).length === runCount, '복원 취소가 현재 실험을 바꾸거나 새 실험을 만들었습니다.');
    equal(await repo.readSnapshot(restoredId), beforeRecovery, '복원 취소가 기존 자료를 변경했습니다.');
    uploadConflict(); await until(() => $('#csv-time-dialog')?.open, '취소 후 다시 복원할 수 없습니다.');
    submit('#csv-time-dialog');
    await until(() => $('#leave-dialog').open || !app.getState().busy, '복원 후 가져오기 전환 대기');
    if ($('#leave-dialog').open) clickVisible($('#leave-save'));
    await idle();
    const recovered = await repo.readSnapshot(app.getState().storage.id);
    check(recovered.run.timeOrigin === exported.samples[0].receivedAt && recovered.run.csvImport.timeRestoredFromTimestamp,
      '원본 시각 복원이 파일 첫 수신을 0초로 삼지 않았습니다.');
    equal(recovered.samples.map(sample=>[sample.receivedAt,sample.values]), exported.samples.map(sample=>[sample.receivedAt,sample.values]),
      '시간 복원이 원본 수신 시각이나 측정값을 변경했습니다.');
    report('시간 불일치 · 두 선택지·취소 시 원자료/DB 유지·원본 시각 기준 복원');
  } finally {
    failSave=failDelete=false;reader?.dispose();
    host.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
    await app?.dispose();fixture.dispose();repo.close();await globalThis.idb.deleteDB(databaseName);
  }
}
