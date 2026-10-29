import { element } from './dom.js';
import { analysisExportInfo } from '../data/files/csv.js';
import { LIMITS } from '../domain/limits.js';
import { eventTitle, eventDetail } from './event-content.js';
import { parseCondition } from './condition-input.js';
import { createPointPopover, clearablePointInput } from './point-input-popover.js';

// Native dialogs share focus, draft and failed-save handling. They never own stored records.
export function createRecordDialogs(host) {
  const dialogs = new Set();
  function formDialog({ id, title, description = '', submit = '저장', build, save }) {
    const anchor = document.activeElement;
    const dialog = element('dialog', 'ui-dialog record-dialog'), form = element('form', 'ui-dialog-form'); dialog.id = id;
    const heading = element('h2', 'ui-dialog-title', title); heading.id = id + '-title'; dialog.setAttribute('aria-labelledby', heading.id);
    const header = element('header', 'ui-dialog-header'), content = element('div', 'ui-dialog-body'), footer = element('footer', 'ui-dialog-footer');
    const body = element('div', 'record-dialog-fields'), error = element('p', 'record-dialog-error'); error.setAttribute('role', 'alert');
    const actions = element('div', 'ui-dialog-actions'), cancel = element('button', '', '취소'), confirm = element('button', 'primary', submit);
    cancel.type = 'button'; confirm.type = 'submit'; confirm.dataset.confirm = '';
    actions.append(cancel, confirm); header.append(heading); footer.append(actions);
    if (description) content.append(element('p', 'ui-dialog-description', description));
    content.append(body, error); form.append(header, content, footer); dialog.append(form); host.append(dialog); dialogs.add(dialog);
    const read = build(body, confirm); let pending = false, composing = false;
    form.addEventListener('compositionstart', () => { composing = true; });
    form.addEventListener('compositionend', () => { composing = false; });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (pending || composing) return;
      try {
        const value = read(); pending = true; error.textContent = '';
        confirm.disabled = cancel.disabled = true;
        await save(value); dialog.close('saved');
      } catch (failure) { error.textContent = failure.message; }
      finally { pending = false; confirm.disabled = cancel.disabled = false; }
    });
    return new Promise(resolve => {
      dialog.addEventListener('close', () => {
        const saved = dialog.returnValue === 'saved'; dialogs.delete(dialog); dialog.remove();
        if (anchor instanceof HTMLElement && anchor.isConnected) anchor.focus({preventScroll:true});
        else if (id==='rename-run-dialog' || id==='delete-run-dialog') {
          const list=host.querySelector('#saved-runs');
          const next=list?.querySelector('button') ?? host.querySelector('[data-view="saved"]');
          next?.focus({preventScroll:true});
        }
        resolve(saved);
      }, {once:true});
      dialog.showModal();
    });
  }
  function field(body, name, label, { value = '', options = null, multiline = false, required = false, maxLength = 500 } = {}) {
    const row = element('label'), input = element(options ? 'select' : multiline ? 'textarea' : 'input');
    input.name = name; input.required = required;
    if (options) for (const [value, text] of options) { const option = element('option', '', text); option.value = value; input.append(option); }
    else if ('maxLength' in input) input.maxLength = maxLength;
    input.value = value; row.append(element('span', '', label), input); body.append(row); return input;
  }
  return {
    condition(point, column, save) {
      const anchor = document.activeElement, panel = element('div','point-input-popover');
      panel.id='point-condition-dialog'; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label',`${point.pointRecordId}번 변인값`); host.append(panel);
      const input=field(panel,'condition',column.name+(column.unit?` (${column.unit})`:''),{value:String(point.manualValues[column.id]??'')}); input.inputMode='decimal';
      panel.append(element('p','lab-note','입력창을 떠나면 저장됩니다. 변경 반영을 누르면 그래프와 계산에 적용됩니다.'));
      const error=element('p','point-error');error.setAttribute('role','alert');panel.append(error);
      const abort=new AbortController();clearablePointInput(input,'변인값 비우기',abort.signal);
      return new Promise(resolve=>{
        const handle={close:()=>popover.close({discard:true})}; dialogs.add(handle);
        const popover=createPointPopover(panel,{signal:abort.signal,save(){
          try { save(parseCondition(input.value)); return true; }
          catch(failure) { error.textContent=failure.message==='numberInvalid'?'숫자 또는 빈칸을 입력하세요.':failure.message;return false; }
        },onClose(){abort.abort();dialogs.delete(handle);panel.remove();resolve(true);}});
        popover.open(anchor);
      });
    },
    restoreCsvTime(save) { return formDialog({id:'csv-time-dialog',title:'시간 정보가 서로 맞지 않아요',
      submit:'원본 시각 기준으로 복원',
      description:'원본 수신 시각을 기준으로 경과 시간을 다시 계산합니다. 파일의 첫 수신이 0초가 됩니다.',
      save, build() { return () => undefined; } }); },
    rename(run, save) { return formDialog({id:'rename-run-dialog', title:'실험 이름 변경', save,
      build(body) { const input = field(body,'runName','실험 이름',{value:run.name,required:true,maxLength:120}); return () => input.value.trim(); } }); },
    remove(run, save) { return formDialog({id:'delete-run-dialog', title:'저장된 실험 삭제', submit:'실험 삭제',
      description:'이 브라우저에 저장된 원자료·조작 기록·분석·해석을 삭제합니다. 내려받은 파일은 유지됩니다.', save,
      build(body) { body.append(element('strong','',run.name)); return () => undefined; } }); },
    note(event, context, save) { return formDialog({id:'event-note-dialog', title:'조작 메모 편집',
      description:eventTitle(event,context) + ' · ' + new Date(event.receivedAt).toLocaleString('ko-KR'), save,
      build(body) {
        const detail = eventDetail(event,context); if (detail) body.append(element('p','',detail));
        const note = field(body,'note','메모 (500자 이내)',{value:event.payload.note ?? '',multiline:true});
        body.append(element('small','','비우고 저장하면 메모만 지웁니다. 조작 종류와 시각은 유지됩니다.'));
        return () => note.value;
      } }); },
    activity(definition, save) { return formDialog({id:'activity-event-dialog', title:definition.label, submit:'조작 기록', save,
      build(body) {
        const kind = field(body,'kind','변화 종류',{required:true,options:[['','선택하세요'],...definition.kinds.map(item=>[item.id,item.label])]});
        const note = field(body,'note','메모 (선택)',{multiline:true});
        return () => ({kind:kind.value,note:note.value.trim()});
      } }); },
    additional(policy, save) { return formDialog({id:'additional-dialog',title:'추가 측정 조건 확인',submit:'조건을 기록하고 추가 측정',
      description:'같은 센서·프로그램·활동으로 기존 기록 뒤에 이어 측정합니다. 달라진 조건은 구분해 남기세요.', save,
      build(body) {
        const checkbox = element('input'); checkbox.type='checkbox'; checkbox.name='sameContext'; checkbox.required=true;
        const row = element('label','record-check'); row.append(checkbox,document.createTextNode('같은 센서·프로그램·활동을 사용합니다.')); body.append(row);
        const conditions = (policy?.additionalConditions ?? []).map(item => [item.id,field(body,item.id,item.label,{required:true,
          options:[['','변경 여부 선택'],['same','변경 없음'],['changed','변경됨'],['unsure','확실하지 않음'] ]})]);
        const note = field(body,'note','변경 사항·확인할 점 (500자 이내)',{multiline:true});
        const warning = element('p','record-condition-warning','변경되었거나 확실하지 않은 조건을 메모해 주세요.'); warning.hidden=true; body.append(warning);
        body.addEventListener('change',()=>{note.required=conditions.some(([,input])=>['changed','unsure'].includes(input.value));warning.hidden=!note.required;});
        return () => { const value={sameContext:checkbox.checked,conditions:Object.fromEntries(conditions.map(([id,input])=>[id,input.value])),note:note.value.trim()};
          return policy?.validateAdditional?.(value) ?? value; };
      } }); },
    exportCsv(snapshot, save, sourceId = 'recorded') { return formDialog({id:'analysis-export-dialog',title:'분석 자료 CSV 저장',submit:'CSV 저장',save,
      build(body, confirm) {
        const info = analysisExportInfo(snapshot, sourceId), capacity = LIMITS.maxChannels - snapshot.run.context.channels.length - (snapshot.run.importedColumns?.length ?? 0) - (sourceId === 'points' ? snapshot.workspace.bySource.points.inputSnapshot.manualColumns.length : 0);
        body.append(element('p','',sourceId === 'points' ? '한 점 기록 · 반영한 조건값' : '연속 기록'));
        body.append(element('p','',`분석 범위 ${info.candidateCount}개 − 제외 ${info.excludedCount}개 = 출력 ${info.rows.length}행`));
        const count = element('p','record-export-count'), fields = element('div','record-export-columns'); body.append(count,fields);
        const inputs = info.columns.map((column,index) => {
          const label=element('label','record-check'), input=element('input'); input.type='checkbox';input.value=column.id;input.checked=index<capacity;
          label.append(input,document.createTextNode(column.name+(column.unit?' ('+column.unit+')':'')));fields.append(label);return input;
        });
        const read=()=>inputs.filter(input=>input.checked).map(input=>input.value);
        const update=()=>{count.textContent=`계산 열 ${read().length}개 선택 · 최대 ${capacity}개. 원자료 열은 함께 저장합니다.`;confirm.disabled=read().length>capacity;};
        fields.addEventListener('change',update);update();
        if (!inputs.length) fields.append(element('p','','추가한 계산 열이 없습니다. 분석에 사용한 원자료를 저장합니다.'));
        return read;
      } }); },
    dispose() { for (const dialog of dialogs) dialog.close(); },
  };
}
