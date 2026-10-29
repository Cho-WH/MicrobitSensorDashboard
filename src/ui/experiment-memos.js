import { element } from './dom.js';
import { createPointPopover, clearablePointInput } from './point-input-popover.js';
import { bindTableScrollKeys } from './table-viewport.js';
import { getActivityMemoPresets } from '../catalog/index.js';
import { isExperimentMemo } from '../domain/contracts.js';
import { eventTitle, eventDetail } from './event-content.js';
import { clockTime, formatClockTime } from '../analysis/clock-time.js';

const time = value => Number.isFinite(value) ? formatClockTime(clockTime(value)).slice(0,8) : '시각 없음';

// Drafts and selection belong to this view; RunStore owns confirmed edits.
export function createExperimentMemos(root, { onAdd, onChange }) {
  const abort = new AbortController(), {signal} = abort;
  const find = selector => root.querySelector(selector);
  const body = find('#lab-events'), section = find('.measurement-events'), add = find('#add-note');
  const scroller = find('.memo-scroll'), toolbar = find('#activity-actions');
  const history = find('.measurement-system-events'), historyList = find('#measurement-system-list');
  const rows = new Map();
  let store = null, context = null, runId = null, version = -1, selected = null;
  let cachedVersion = -1, cachedEvents = [], eventsById = new Map();
  let draft = null, optionsId = null, canAdd = false, busy = false;
  const panel = element('div','point-input-popover memo-editor'); panel.id='memo-editor';
  panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','메모 편집');
  const label = element('label'), caption = element('span','','메모'), input = element('textarea');
  input.id='event-note'; input.maxLength=500; input.rows=4; label.append(caption,input);
  const timestamp = element('p','lab-note'), error = element('p','point-error'); error.setAttribute('role','alert');
  // Editors are shared by measurement and analysis, so their host must stay
  // visible when either screen is hidden.
  panel.append(timestamp,label,error); (root.body ?? root).append(panel);
  const clear = clearablePointInput(input,'메모 비우기',signal);
  const editor = createPointPopover(panel,{signal,save:saveDraft});
  const optionsPanel = element('div','point-input-popover memo-options'); optionsPanel.id='memo-options';
  optionsPanel.setAttribute('role','dialog'); optionsPanel.setAttribute('aria-label','메모 옵션');
  const withdraw = element('button'); withdraw.type='button'; withdraw.dataset.memoAction='withdraw';
  const optionsError=element('p','point-error'); optionsError.setAttribute('role','alert');
  optionsPanel.append(withdraw,optionsError); section.append(optionsPanel);
  const options = createPointPopover(optionsPanel,{signal,save:()=>true});
  function records() {
    const revision = store?.getState().eventsVersion ?? 0;
    if (cachedVersion !== revision) {
      cachedEvents = store?.getEvents(Number.MAX_SAFE_INTEGER) ?? [];
      eventsById = new Map(cachedEvents.map(event => [event.eventId, event]));
      cachedVersion = revision;
    }
    return cachedEvents;
  }
  function currentEvent(id) { records(); return eventsById.get(id); }
  function select(id) {
    if (selected === id) return;
    selected=id;
    for(const [key,row] of rows) row.dataset.selected=String(key===id);
    onChange();
  }
  function saveDraft() {
    if(!draft || !store) return true;
    try {
      const note=input.value.trim();
      if(draft.id == null) {
        if(note) onAdd(note,draft.receivedAt);
      } else if(!input.readOnly && note!==draft.original) store.updateEventNote(draft.id,note);
      draft=null; error.textContent=''; onChange(); return true;
    } catch(failure) { error.textContent=failure.message; return false; }
  }
  function open(anchor,reference=null,text='') {
    if (reference && reference.runId !== runId) return;
    if(!editor.close() || !options.close()) return;
    // Closing can commit a draft. Resolve the record afterwards so reopening
    // the same row never presents the snapshot from before that commit.
    const event = reference ? currentEvent(reference.eventId) : null;
    if (reference && !event) return;
    if(!event && !canAdd) return;
    draft={id:event?.eventId??null,receivedAt:event?.receivedAt??Date.now(),original:event?.payload.note??''};
    input.value=event?.payload.note??text; input.readOnly=!!event && !store?.getState().writable;
    clear.disabled=input.readOnly; timestamp.textContent=time(draft.receivedAt); error.textContent='';
    if (event) select(event.eventId);
    editor.open(anchor);
  }
  add.addEventListener('click',()=>open(add),{signal});
  withdraw.addEventListener('click',()=>{
    try {
      const event=currentEvent(optionsId);
      if(event) store.setEventWithdrawn(event.eventId,!event.payload.withdrawn);
      options.close({focus:true}); onChange();
    } catch(failure) { optionsError.textContent=failure.message; }
  },{signal});
  // Stable containers own listeners; replacing rows or activities cannot retain
  // detached buttons and their old record snapshots for the app's lifetime.
  body.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-memo-action]') : null;
    if (!button || button.disabled || !body.contains(button)) return;
    const id = Number(button.closest('[data-memo-id]').dataset.memoId);
    if (button.dataset.memoAction === 'edit') edit(currentEvent(id), button);
    else if (button.dataset.memoAction === 'options') {
      if (!editor.close() || !options.close()) return;
      const current = currentEvent(id);
      if (!current) return;
      optionsId=id; select(id); optionsError.textContent='';
      withdraw.textContent=current.payload.withdrawn?'기록 복구':'기록 취소'; options.open(button);
    }
  }, {signal});
  toolbar.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-memo-preset]') : null;
    if (!button || button.disabled || !toolbar.contains(button)) return;
    const preset = getActivityMemoPresets(context).find(item => item.id === button.dataset.memoPreset);
    if (preset) open(button, null, preset.text);
  }, {signal});
  bindTableScrollKeys(scroller,()=>{},signal);
  function edit(event,anchor=null) {
    if(!event || event.runId !== runId) return;
    const row=rows.get(event.eventId);
    if(row && !anchor) { section.open=true; row.scrollIntoView({block:'nearest'}); }
    open(anchor??row?.querySelector('[data-memo-action="edit"]')??add,event);
  }
  function reset() {
    editor.close({discard:true}); options.close({discard:true}); draft=null; selected=null;
    rows.clear(); body.replaceChildren(); version=-1;
    cachedVersion=-1; cachedEvents=[]; eventsById.clear();
  }
  function paint(events) {
    const memos=events.filter(isExperimentMemo), ids=new Set(memos.map(event=>event.eventId));
    for(const [id,row] of rows) if(!ids.has(id)) { row.remove(); rows.delete(id); }
    for(const event of memos) {
      let row=rows.get(event.eventId);
      if(!row) {
        row=element('tr','data-row'); row.dataset.memoId=String(event.eventId);
        row.insertCell(); const content=row.insertCell(), controls=row.insertCell();
        const editButton=element('button','table-cell-action table-cell-input'); editButton.type='button'; editButton.dataset.memoAction='edit';
        content.append(editButton);
        const menu=element('button','table-cell-action table-icon-action','⋯'); menu.type='button'; menu.dataset.memoAction='options'; menu.setAttribute('aria-label','메모 옵션'); menu.setAttribute('aria-haspopup','dialog');
        controls.append(menu); rows.set(event.eventId,row); body.append(row);
      }
      row.cells[0].textContent=time(event.receivedAt);
      const content=row.querySelector('[data-memo-action="edit"]');
      content.textContent=event.payload.note||'내용 입력'; content.setAttribute('aria-label',time(event.receivedAt)+' 메모 편집');
      row.dataset.withdrawn=String(!!event.payload.withdrawn); row.dataset.selected=String(event.eventId===selected);
    }
    find('#memo-count').textContent=memos.length?String(memos.filter(event=>!event.payload.withdrawn).length):'';
    find('#memo-empty').hidden=!!memos.length;
    const system=events.filter(event=>!isExperimentMemo(event)); history.hidden=!system.length;
    historyList.replaceChildren(...system.slice(-100).reverse().map(event=>{
      const row=element('li','measurement-event-row');
      row.append(element('strong','',eventTitle(event)),element('time','',time(event.receivedAt)));
      const detail=eventDetail(event,context);if(detail)row.append(element('span','',detail));return row;
    }));
  }
  return {edit,flush:()=>editor.close() && options.close(),reset,getSelectedId:()=>selected,
    render({store:nextStore,context:nextContext,canAdd:allowed,busy:pending}) {
      if(runId!==(nextStore?.getState().id??null)) { reset();runId=nextStore?.getState().id??null; }
      store=nextStore;canAdd=allowed;busy=pending; add.disabled=!canAdd || busy;
      if(context!==nextContext) {
        context=nextContext; toolbar.replaceChildren();
        for(const preset of getActivityMemoPresets(context)) {
          const button=element('button','',preset.text);button.type='button';button.dataset.memoPreset=preset.id;
          button.dataset.uiAction='secondary';toolbar.append(button);
        }
        version=-1;
      }
      for(const button of toolbar.querySelectorAll('button'))button.disabled=!canAdd||busy;
      const revision=store?.getState().eventsVersion??0;
      if(version!==revision) {version=revision;paint(records());}
      for(const button of body.querySelectorAll('[data-memo-action="options"]')) button.disabled=!store?.getState().writable || busy;
    },
    dispose(){abort.abort();panel.remove();optionsPanel.remove();rows.clear();}
  };
}
