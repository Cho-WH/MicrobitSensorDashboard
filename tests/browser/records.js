import { startApp } from '../../src/app/startup.js';
import { createRepository } from '../../src/data/repository.js';
import { openRunStore } from '../../src/data/run-store.js';
import { parseExperimentJson } from '../../src/data/files/json.js';
import { mountLabFixture, clickLabControl, clickVisible } from './lab-fixture.js';
import { createRecordDialogs } from '../../src/ui/record-dialogs.js';
import { buildAnalysisCsv, parseExperimentCsv } from '../../src/data/files/csv.js';

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
    const text=await(await fetch('../fixtures/gay-lussac-v2.json')).text(),original=parseExperimentJson(text);
    const files=new DataTransfer();files.items.add(new File([text],'legacy.json',{type:'application/json'}));
    $('#file-input').files=files.files;$('#file-input').dispatchEvent(new Event('change'));
    await until(()=>app.getState().storage?.source==='import','가져오기 실패');await idle();
    const id=app.getState().storage.id, before=await repo.readSnapshot(id);
    check(!app.getState().session.recording,'가져오기가 기록을 시작함');
    equal(before.samples.map(s=>s.values),original.samples.map(s=>s.values),'원본 값 변경');

    const event=before.events.find(e=>e.source==='user');
    await click(`#analysis-events [data-event-id="${event.eventId}"]`);
    await until(()=>$('#event-note-dialog')?.open,'메모 편집 없음');
    $('#event-note-dialog textarea').value='원본 조작을 다시 확인함';failSave=true;submit('#event-note-dialog');
    await until(()=>$('#event-note-dialog .record-dialog-error').textContent.includes('저장 실패'),'저장 실패가 표시되지 않음');
    check($('#event-note-dialog textarea').value==='원본 조작을 다시 확인함','실패 시 초안 손실');
    failSave=false;submit('#event-note-dialog');await idle();
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
    await click('[data-activity-event="water-added"]');await idle();
    await click('[data-activity-event="device-change"]');await until(()=>$('#activity-event-dialog')?.open,'장치 변화 폼 없음');
    $('#activity-event-dialog [name=kind]').value='opened';$('#activity-event-dialog textarea').value='센서 위치 확인';submit('#activity-event-dialog');await idle();
    await click('#finish-recording');await idle();
    const completed=await repo.readSnapshot(id);equal(completed.samples.slice(0,count),before.samples,'이어 측정이 원본 값 변경');
    equal(completed.workspace,before.workspace,'이어 측정이 기존 분석/근거 변경');
    check(completed.events.some(e=>e.type==='device-change'&&e.payload.kind==='opened'),'일시정지 중 장치 변화 누락');
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
    const noteButton=$('#lab-events button');clickVisible(noteButton);await until(()=>$('.measurement-event-dialog')?.open,'사건 상세 없음');
    const edit=$('.measurement-event-dialog [data-event-id]');check(edit,'측정 종료 뒤 메모 편집 없음');clickVisible(edit);
    await until(()=>$('#event-note-dialog')?.open,'측정 메모 편집 연결 실패');$('#event-note-dialog textarea').value='';submit('#event-note-dialog');await idle();
    check((await repo.readSnapshot(id)).events.find(e=>e.eventId===Number(edit.dataset.eventId)).payload.note==='','메모 비우기 실패');
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
    failDelete=false;submit('#delete-run-dialog');await idle();check(!await repo.readSnapshot(id),'삭제 재시도 실패');
    report('실험 관리 · 이름 저장·단일 작성자 잠금·삭제 확인/취소·삭제 실패/재시도');

    const dialogs=createRecordDialogs(host), snapshot=structuredClone(added);let exported;
    const task=dialogs.exportCsv(snapshot,ids=>{exported=parseExperimentCsv(buildAnalysisCsv(snapshot,ids));});
    const inputs=[...$('#analysis-export-dialog').querySelectorAll('input[type=checkbox]')];check(inputs.length>1,'계산 열 선택 없음');
    inputs.forEach(input=>{input.checked=false;});inputs[0].checked=true;inputs[0].dispatchEvent(new Event('change',{bubbles:true}));submit('#analysis-export-dialog');await task;
    check(exported.run.importedColumns.length===1,'선택하지 않은 계산 열까지 CSV에 포함');
    equal(snapshot,added,'CSV 선택이 분석을 변경');dialogs.dispose();
    report('분석 CSV · 선택한 계산 열만 실제 CSV로 왕복, 분석 상태 보존');
  } finally {
    failSave=failDelete=false;reader?.dispose();
    host.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
    await app?.dispose();fixture.dispose();repo.close();await globalThis.idb.deleteDB(databaseName);
  }
}
