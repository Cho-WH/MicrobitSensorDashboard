import { valueWithUnit } from './scientific-notation.js';
import { element, findElement } from './dom.js';
import { createPointPopover, clearablePointInput } from './point-input-popover.js';
import { tableRowHeight, visibleTableRows, tableSpacer, bindTableScrollKeys } from './table-viewport.js';
import { getLabCopy, formatCopy, applyLabCopy } from './lab-copy.js';
import { readCell } from '../domain/columns.js';
import { validateManualColumns } from '../domain/point-records.js';
import { readVisualTheme, channelColor, channelTextColor } from './visual-theme.js';
import { setText } from './text.js';
import { STANDARD_GRAVITY, isSIAcceleration } from '../domain/acceleration-units.js';

import { parseCondition } from './condition-input.js';
import { getMeasurementReadout, getMeasurementOptions } from '../catalog/index.js';
export { parseCondition } from './condition-input.js';

// DOM nodes survive reception ticks. Drafts belong to the view and confirmed
// edits go through RunStore; neither ever changes the sensor samples.
export function createPointRecordingView(root, { onCapture, onChange, onError }) {
  const host = findElement(root, 'div', '#point-recording');
  const panel = findElement(root, 'details', '#point-panel');
  /** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} selector */
  const find = (tag, selector) => findElement(root, tag, selector);
  const abort = new AbortController(), { signal } = abort;
  let context = null, store = null, copy = getLabCopy(null).point, columns = [], revision = -1;
  let readout = getMeasurementReadout(null), tableChannels = [];
  let unseen = 0, previousCount = 0, rows = new Map(), drafts = new Map(), cards = [];
  let feedback = '', countText = '', feedbackTimer = null;
  function clearFeedback() { clearTimeout(feedbackTimer); feedbackTimer = null; feedback = ''; }
  function renderSummary() {
    if (panel.open) clearFeedback();
    setText(countValue, feedback || countText);
    setText(countReserve, countText);
    count.dataset.feedback = String(!!feedback);
  }
  let cachedPoints = [], cachedRevision = -1, rowFrame = null;
  let composing = new Set(), runId = null, inG = false, mode = null, continuousOpen = false;
  const text = (tag, key, cls = '') => { const node = element(tag, cls, copy[key]); node.dataset.copy = 'point.' + key; return node; };
  const action = (key, fn) => { const node = text('button', key); node.type = 'button'; node.dataset.pointAction = key; node.addEventListener('click', () => { try { fn(); } catch (error) { onError(error); } }, { signal }); return node; };
  const labelInput = (key, parent, maxLength = 100) => {
    const label = element('label'), caption = text('span', key), field = element('input'); field.type = 'text'; field.maxLength = maxLength; field.dataset.pointField = key;
    label.append(caption, field); parent.append(label); trackComposition(field); return { field, caption };
  };
  function trackComposition(field) {
    field.addEventListener('compositionstart', () => composing.add(field), { signal });
    field.addEventListener('compositionend', () => { composing.delete(field); onChange(); }, { signal });
  }
  const bind = (selector, fn) => {
    const button = find('button', selector);
    button.addEventListener('click', () => { try { fn(); } catch (error) { onError(error); } }, { signal });
    return button;
  };
  const live = find('section', '.point-live'), liveCards = find('div', '.point-live-cards'), liveStatus = find('p', '#point-live-status');
  const unitToggle = bind('[data-point-action="unitToggle"]', () => { inG = !inG; unitToggle.setAttribute('aria-pressed', String(inG)); onChange(); });
  const componentDetails = find('details', '#point-components'), componentCards = find('div', '#point-component-cards');
  const config = find('div', '#point-column-config');
  const name = find('input', '[data-point-field="conditionName"]'), unit = find('input', '[data-point-field="conditionUnit"]');
  const columnError = find('p', '#point-column-error');
  const variableButton = bind('#point-variable-edit', () => {
    if (!notePopover.close() || !optionsPopover.close()) return;
    variablePopover.open(variableButton);
  });
  const variablePopover = createPointPopover(config, {save:saveColumn, signal});
  const notePanel = find('div', '#point-note-editor'), noteInput = findElement(notePanel,'textarea','textarea');
  const noteError = findElement(notePanel,'p','.point-error');
  let noteId = null;
  const notePopover = createPointPopover(notePanel, {signal, save() {
    try {
      const point = store?.getPointRecords().find(p => p.pointRecordId === noteId);
      if (point && point.note !== noteInput.value) store.updatePointRecord(noteId, {note:noteInput.value});
      noteError.textContent = ''; onChange(); return true;
    } catch (error) { noteError.textContent = error.message; return false; }
  }});
  const optionsPanel = find('div','#point-options');
  const optionsPopover = createPointPopover(optionsPanel, {signal, save:()=>true});
  clearablePointInput(noteInput, '메모 비우기', signal);
  const nameClear = clearablePointInput(name, '변인 이름 비우기', signal), unitClear = clearablePointInput(unit, '단위 비우기', signal);
  // Keep the capture draft and validation separate from the recorded-row edits.
  // Its control is temporarily hidden pending placement beside the capture action.
  const current = find('input', '[data-point-field="condition"]'), currentCaption = find('span', '#point-condition-label');
  const currentError = find('p', '#point-condition-error');
  for (const field of [name, unit, current]) trackComposition(field);
  const captureButton = bind('#capture-point', () => { if (!composing.has(current)) onCapture(); });
  const continuousCapture = bind('#capture-continuous-point', () => { if (!composing.has(current)) onCapture(); });
  panel.addEventListener('toggle', () => { if (mode === 'continuous') continuousOpen = panel.open; renderSummary(); scheduleRows(); }, { signal });
  const currentClear = clearablePointInput(current, '이번 변인값 비우기', signal);
  current.addEventListener('input', () => { validateCurrent(); onChange(); }, { signal });
  const count = find('span', '#point-table-count'), empty = find('p', '#point-table-empty');
  const countValue = element('span'), countReserve = element('span', 'point-count-reserve');
  countReserve.setAttribute('aria-hidden', 'true');
  count.append(countValue, countReserve);
  const viewport = find('div', '.point-table-scroll'), body = find('tbody', '.point-table tbody');
  const table = find('table', '.point-table');
  let rowHeight = tableRowHeight(table);
  const newRecords = bind('[data-point-action="newRecords"]', () => { if (!flush()) return; unseen = 0; paintRows({end:true}); });
  function scheduleRows() { rowFrame ??= requestAnimationFrame(() => { rowFrame = null; paintRows(); }); }
  viewport.addEventListener('scroll', scheduleRows, {signal, passive:true});
  host.addEventListener('focusout', scheduleRows, {signal});
  bindTableScrollKeys(viewport, scheduleRows, signal);
  const resize = new ResizeObserver(scheduleRows); resize.observe(viewport); resize.observe(table);
  signal.addEventListener('abort', () => { resize.disconnect(); if (rowFrame !== null) cancelAnimationFrame(rowFrame); }, {once:true});
  function pointRecords() {
    const next = store?.getState().pointDataRevision ?? -1;
    if (next !== cachedRevision) { cachedPoints = store?.getPointRecords() ?? []; cachedRevision = next; }
    return cachedPoints;
  }

  function setError(field, target, message = '') { setText(target, message); field.setAttribute('aria-invalid', String(!!message)); }
  function validateCurrent() {
    try { if (columns.length) parseCondition(current.value); setError(current, currentError); return true; }
    catch { setError(current, currentError, copy.numberInvalid); return false; }
  }
  function saveColumn() {
    if (composing.size) return false;
    if (!name.value.trim() && !unit.value.trim() && !columns.length) { columnError.textContent = ''; return true; }
    if (name.value.trim() === (columns[0]?.name ?? '') && unit.value.trim() === (columns[0]?.unit ?? '')) return true;
    try {
      const column = { id: columns[0]?.id ?? 'manual-condition', name: name.value.trim(), unit: unit.value.trim(), type: 'number' };
      validateManualColumns([column], context);
      if (store) store.setManualColumn(column);
      columns = [column]; columnError.textContent = ''; revision = -1;
      updateColumn(); onChange(); return true;
    } catch (error) { columnError.textContent = error.message; return false; }
  }
  function updateColumn() {
    current.closest('label').hidden = !columns.length;
    const label = columns[0] ? columns[0].name + (columns[0].unit ? ' (' + columns[0].unit + ')' : '') : '';
    setText(find('span','#point-variable-name'), label);
    variableButton.setAttribute('aria-label', columns.length ? copy.editCondition : copy.addCondition);
    variableButton.title = columns.length ? copy.editCondition : copy.addCondition;
    if (variableButton.dataset.configured !== String(!!columns.length)) {
      variableButton.dataset.configured = String(!!columns.length);
      if (columns.length) { const icon = element('span','edit-icon'); icon.setAttribute('aria-hidden','true'); variableButton.replaceChildren(icon); }
      else variableButton.textContent = '+ ' + copy.addCondition;
    }
    setText(find('th','#point-value-heading'), tableChannels[0]?.name ?? '');
    setText(currentCaption, columns.length ? '이번 ' + columns[0].name : '이번 변인값');
  }
  const primary = () => context?.channels.find(channel => channel.id === readout.primaryChannelId);
  const scale = channel => inG && channel.quantity === 'acceleration' ? STANDARD_GRAVITY : 1;
  const displayUnit = channel => inG && channel.quantity === 'acceleration' ? 'g' : channel.unit ?? '';
  const format = (sample, channel, liveUnits = true) => {
    const cell = readCell(sample, channel.id);
    const value = cell.value === null ? '—' : valueWithUnit((cell.value / (liveUnits ? scale(channel) : 1)).toLocaleString('ko-KR', { maximumFractionDigits: liveUnits && inG ? 3 : channel.digits ?? 2 }),liveUnits ? displayUnit(channel) : channel.unit ?? '');
    return cell.reason ? `${value} · ${cell.reason}` : value;
  };
  function configure(nextContext) {
    context = nextContext; copy = getLabCopy(context).point;
    readout = getMeasurementReadout(context);
    const channelIds = getMeasurementOptions(context).pointTableChannelIds ?? [readout.primaryChannelId];
    tableChannels = channelIds.map(id => context.channels.find(channel => channel.id === id)).filter(Boolean);
    if (!tableChannels.length && primary()) tableChannels = [primary()];
    const heading = find('th', '#point-value-heading');
    table.querySelectorAll('[data-point-extra-heading]').forEach(node => node.remove());
    heading.textContent = tableChannels[0]?.name ?? '';
    heading.scope = 'col';
    let preceding = heading;
    for (const channel of tableChannels.slice(1)) {
      const cell = element('th', '', channel.name); cell.scope = 'col'; cell.dataset.pointExtraHeading = '';
      preceding.after(cell); preceding = cell;
    }
    table.classList.toggle('point-table-multiple', tableChannels.length > 1);
    rows.clear(); body.replaceChildren();
    applyLabCopy(host, getLabCopy(context));
    inG = false; unitToggle.hidden = !context.channels.every(isSIAcceleration); unitToggle.setAttribute('aria-pressed', 'false');
    const theme = readVisualTheme(host, context.channels);
    liveCards.replaceChildren(); componentCards.replaceChildren(); cards = [];
    const main = primary();
    for (const channel of context.channels) {
      const card = element('div', 'point-readout'), value = element('strong', '', '—');
      card.style.setProperty('--channel-color', channelColor(theme, channel, context.channels.indexOf(channel)));
      card.style.setProperty('--channel-text-color', channelTextColor(theme, channel, context.channels.indexOf(channel)));
      const gauge = element('meter'); gauge.setAttribute('aria-label', channel.name); gauge.hidden = true;
      const gaugeTrack = element('div', 'point-gauge'), zero = element('span', 'point-gauge-zero', '0'); zero.setAttribute('aria-hidden', 'true'); zero.hidden = true;
      gaugeTrack.append(gauge, zero);
      const rangeMessage = text('p', 'noRange', 'lab-note');
      const rangeDetails = element('details'), rangeFields = element('div', 'point-fields');
      const lowField = labelInput('minimum', rangeFields), highField = labelInput('maximum', rangeFields);
      const min = lowField.field, max = highField.field;
      lowField.caption.textContent = `${copy.minimum} (${channel.unit})`; highField.caption.textContent = `${copy.maximum} (${channel.unit})`;
      min.inputMode = max.inputMode = 'decimal';
      const rangeError = element('p', 'point-error'); rangeError.setAttribute('role', 'status');
      const entry = { channel, value, gauge, zero, rangeMessage, range: Number.isFinite(channel.min) && Number.isFinite(channel.max) ? [channel.min, channel.max] : null };
      const applyRange = () => {
        if (composing.size) return;
        try {
          const low = parseCondition(min.value), high = parseCondition(max.value);
          if (low === null || high === null || low >= high) throw new Error();
          entry.range = [low, high]; rangeError.textContent = ''; onChange();
        } catch { rangeError.textContent = copy.rangeInvalid; }
      };
      rangeFields.addEventListener('focusout', () => queueMicrotask(() => { if (!rangeFields.contains(document.activeElement)) applyRange(); }), {signal});
      clearablePointInput(min, copy.minimum + ' 비우기', signal); clearablePointInput(max, copy.maximum + ' 비우기', signal);
      for (const field of [min,max]) field.addEventListener('keydown', event => { if(event.key==='Enter'&&!event.isComposing&&!composing.has(field)) { event.preventDefault(); applyRange(); } }, {signal});
      if (entry.range) { min.value = String(entry.range[0]); max.value = String(entry.range[1]); }
      rangeDetails.append(text('summary', 'range'), rangeFields, text('p', 'rangeNote', 'lab-note'), rangeError);
      card.append(element('span', '', channel.name), value, gaugeTrack, rangeMessage);
      // Component values remain numerical until a shared symmetric range is set
      // through the primary readout's explicit display settings.
      if (channel === main) card.append(rangeDetails);
      (channel === main ? liveCards : componentCards).append(card); cards.push(entry);
    }
    componentDetails.hidden = cards.length < 2;
    updateColumn();
  }
  function draftFor(point) {
    if (!drafts.has(point.pointRecordId)) drafts.set(point.pointRecordId, { condition: point.manualValues[columns[0]?.id] == null ? '' : String(point.manualValues[columns[0].id]), dirty: false });
    return drafts.get(point.pointRecordId);
  }
  function commit(id, focusError = true) {
    const draft = drafts.get(id), row = rows.get(id);
    if (!draft?.dirty) return true;
    if (row && [...composing].some(field => row.tr.contains(field))) return false;
    try {
      const manualValues = columns.length ? { [columns[0].id]: parseCondition(draft.condition) } : {};
      store.updatePointRecord(id, { manualValues });
      draft.dirty = false; draft.error = ''; if (row) { setError(row.condition, row.error); }
      onChange(); return true;
    } catch (error) {
      draft.error = error.message === 'numberInvalid' ? copy.numberInvalid : error.message;
      if (focusError && !row) { panel.open = true; paintRows({index:pointRecords().findIndex(point => point.pointRecordId === id)}); }
      const target = rows.get(id);
      if (target) { setError(target.condition, target.error, draft.error); if (focusError) target.condition.focus({preventScroll:true}); }
      scheduleRows(); return false;
    }
  }
  function cancel(id) {
    drafts.delete(id);
    const point = store.getPointRecords().find(point => point.pointRecordId === id);
    const row = rows.get(id); setError(row.condition, row.error); updateRow(row, point); onChange();
  }
  function iconButton(kind, label) {
    const button = element('button','table-cell-action table-icon-action point-icon-button'); button.type='button'; button.dataset.uiAction='quiet';
    button.dataset.pointAction=kind; button.setAttribute('aria-label',label); button.title=label; button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-expanded','false');
    if(kind==='note') button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path class="note-paper" d="M5 3h14v14l-4 4H5z"/><path d="M15 21v-4h4M8 8h8M8 12h8"/></svg>';
    else button.textContent='⋯';
    return button;
  }
  function showOptions(id, button) {
    if (!variablePopover.close() || !notePopover.close()) return;
    if(optionsPopover.isOpen()) { optionsPopover.close(); return; }
    const point=store.getPointRecords().find(p=>p.pointRecordId===id);
    const sample=store.readSamples({afterId:point.capturedSampleId-1,throughId:point.capturedSampleId})[0];
    const times=element('dl');
    for(const [key,time] of [['received',sample.receivedAt],['captured',point.capturedAt]]) times.append(text('dt',key),element('dd','',new Date(time).toLocaleString('ko-KR',{hour12:false})+'.'+String(time%1000).padStart(3,'0')));
    for(const channel of context.channels.filter(c=>c!==primary())) times.append(element('dt','',channel.name),element('dd','',format(sample,channel,false)));
    const withdrawal=action('withdraw',()=>{ if(commit(id)) { store.setPointWithdrawn(id,!point.withdrawn); optionsPopover.close(); onChange(); } });
    withdrawal.textContent=point.withdrawn?copy.restore:copy.withdraw; withdrawal.disabled=!store.getState().writable;
    optionsPanel.replaceChildren(element('strong','',id+'번 기록'),times,withdrawal); optionsPopover.open(button);
  }
  function makeRow(point, sample) {
    const id=point.pointRecordId, tr=element('tr','data-row'); tr.dataset.pointId=String(id);
    const number=element('th','point-number',String(id)); number.scope='row';
    const conditionCell=element('td','point-variable'), field=element('input','table-cell-input'); field.type='text';field.inputMode='decimal';field.maxLength=100;
    field.setAttribute('aria-label',formatCopy(copy.editValue,{number:id})); trackComposition(field);
    const error=element('p','point-error');error.id='point-error-'+id;error.setAttribute('role','status');field.setAttribute('aria-describedby',error.id);
    conditionCell.append(field,error); const clear=clearablePointInput(field,id+'번 변인값 비우기',signal);
    field.parentElement.classList.add('table-input-wrap');
    clear.classList.add('table-cell-action','table-icon-action');
    const values=tableChannels.map(channel=>element('td','point-value',format(sample,channel,false)));
    const noteCell=element('td','point-icon-column'), note=iconButton('note',formatCopy(copy.editNote,{number:id}));
    note.setAttribute('aria-controls','point-note-editor'); noteCell.append(note);
    note.addEventListener('click',()=>{
      if (!variablePopover.close() || !optionsPopover.close()) return;
      if (notePopover.isOpen() && noteId===id) { notePopover.close({focus:true}); return; }
      if (!notePopover.close()) return;
      noteId=id; noteInput.value=store.getPointRecords().find(p=>p.pointRecordId===id).note;noteError.textContent='';
      setText(find('span','#point-note-label'),formatCopy(copy.editNote,{number:id}));notePopover.open(note);
    },{signal});
    const optionsCell=element('td','point-icon-column'), options=iconButton('options',id+'번 기록 옵션');options.setAttribute('aria-controls','point-options');optionsCell.append(options);
    options.addEventListener('click',()=>showOptions(id,options),{signal});
    tr.append(number,conditionCell,...values,noteCell,optionsCell);
    field.addEventListener('input',()=>{const draft=draftFor(point);draft.condition=field.value;draft.dirty=true;},{signal});
    conditionCell.addEventListener('focusout',()=>queueMicrotask(()=>{if(!conditionCell.contains(document.activeElement))commit(id,false);}),{signal});
    field.addEventListener('compositionend',()=>{if(!conditionCell.contains(document.activeElement))commit(id,false);},{signal});
    field.addEventListener('keydown',event=>{
      if(event.isComposing||event.keyCode===229||composing.has(field))return;
      if(event.key==='Enter'){event.preventDefault();commit(id);}
      if(event.key==='Escape'){event.preventDefault();cancel(id);}
    },{signal});
    return {tr,number,condition:field,error,note,options,clear};
  }
  function updateRow(row, point) {
    const draft=draftFor(point);
    if(!draft.dirty)draft.condition=point.manualValues[columns[0]?.id]==null?'':String(point.manualValues[columns[0].id]);
    if(row.condition.value!==draft.condition&&!composing.has(row.condition))row.condition.value=draft.condition;
    setError(row.condition, row.error, draft.error ?? '');
    row.condition.closest('.point-input-wrap').hidden=!columns.length;row.condition.placeholder=copy.enterValue;
    row.condition.disabled=row.note.disabled=row.clear.disabled=!store?.getState().writable;
    row.tr.dataset.withdrawn=String(point.withdrawn);row.tr.setAttribute('aria-label',point.pointRecordId+'번'+(point.withdrawn?' · '+copy.withdrawn:''));
    setText(row.number,String(point.pointRecordId));
    row.note.dataset.filled=String(!!point.note.trim());row.note.setAttribute('aria-label',formatCopy(copy.editNote,{number:point.pointRecordId})+(point.note.trim()?' · 메모 있음':''));
    row.note.title = row.note.getAttribute('aria-label');
    row.options.title = point.pointRecordId+'번 기록 옵션'+(point.withdrawn?' · '+copy.withdrawn:'');
    row.options.setAttribute('aria-label',row.options.title);
  }
  function paintRows({index = null, end = false} = {}) {
    const points = pointRecords(), first = viewport.scrollTop / rowHeight;
    const minimum = tableRowHeight(table);
    table.style.setProperty('--table-row-height', minimum + 'px');
    // Inline errors can need more space. Keep one measured row height so the
    // shared virtual geometry stays correct, including enlarged text.
    rowHeight = Math.max(minimum, ...[...rows.values()].map(row => row.tr.getBoundingClientRect().height));
    table.style.setProperty('--table-row-height', rowHeight + 'px');
    const headerHeight = table.tHead.getBoundingClientRect().height || rowHeight;
    const totalHeight = points.length * rowHeight + headerHeight + 1;
    viewport.style.setProperty('--table-content-height', totalHeight + 'px');
    const top = Math.min(Math.max(0, totalHeight - viewport.clientHeight), end ? totalHeight : index !== null ? index * rowHeight : first * rowHeight);
    const window = visibleTableRows(points.length, top, viewport.clientHeight, rowHeight, headerHeight);
    const indexes = new Set(Array.from({length:window.end-window.start}, (_, offset) => window.start + offset));
    // Keep only the actively edited/anchored rows mounted outside the viewport.
    // Existing input nodes are never moved or replaced by reception/scrolling.
    for (const [id, row] of rows) if (row.tr.contains(document.activeElement) || row.tr.querySelector('[aria-expanded="true"]')) {
      const pinned = points.findIndex(point => point.pointRecordId === id); if (pinned >= 0) indexes.add(pinned);
    }
    const ordered = [...indexes].sort((a,b) => a-b), visible = ordered.map(index => points[index]);
    const ids = new Set(visible.map(point => point.pointRecordId));
    for (const [id, row] of rows) if (!ids.has(id)) { row.tr.remove(); rows.delete(id); }
    for (const spacer of body.querySelectorAll('.table-spacer')) spacer.remove();
    const nodes = []; let after = 0;
    for (const index of ordered) {
      if (index > after) nodes.push(tableSpacer(index-after, rowHeight, 4 + tableChannels.length));
      const point = points[index];
      let row = rows.get(point.pointRecordId);
      if (!row) { const sample = store.readSamples({ afterId: point.capturedSampleId - 1, throughId: point.capturedSampleId })[0]; row = makeRow(point, sample); rows.set(point.pointRecordId, row); }
      updateRow(row, point); row.tr.setAttribute('aria-rowindex', String(index + 2)); nodes.push(row.tr); after = index + 1;
    }
    if (after < points.length) nodes.push(tableSpacer(points.length-after, rowHeight, 5));
    let cursor = body.firstChild;
    for (const node of nodes) {
      if (node === cursor) cursor = cursor.nextSibling;
      else body.insertBefore(node, cursor);
    }
    table.setAttribute('aria-rowcount', String(points.length + 1));
    viewport.scrollTop = top;
    empty.hidden = !!points.length;
    setText(newRecords, formatCopy(copy.newRecords, { count: unseen })); newRecords.hidden = !unseen;
  }
  function flush() {
    if (composing.size || !notePopover.close() || !optionsPopover.close() || !variablePopover.close()) return false;
    if ((name.value !== (columns[0]?.name ?? '') || unit.value !== (columns[0]?.unit ?? '')) && !saveColumn()) return false;
    for (const [id, draft] of drafts) if (draft.dirty && !commit(id)) return false;
    return true;
  }
  function reset() {
    context = null; store = null; columns = []; revision = -1; unseen = 0; previousCount = 0; runId = null;
    cachedPoints = []; cachedRevision = -1; viewport.scrollTop = 0;
    rows.clear(); drafts.clear(); composing.clear(); body.replaceChildren(); current.value = name.value = unit.value = ''; clearFeedback(); countText = ''; renderSummary(); columnError.textContent = ''; variablePopover.close({discard:true}); notePopover.close({discard:true}); optionsPopover.close({discard:true});
    mode = null; continuousOpen = false;
  }
  return {
    flush, reset,
    captureValues() {
      if ((name.value !== (columns[0]?.name ?? '') || unit.value !== (columns[0]?.unit ?? '')) && !saveColumn()) throw new Error(columnError.textContent);
      if (!validateCurrent() || composing.has(current)) { current.focus(); throw new Error(copy.numberInvalid); }
      return columns.length ? { [columns[0].id]: parseCondition(current.value) } : {};
    },
    manualColumns: () => structuredClone(columns),
    recorded(number) {
      clearFeedback();
      if (!panel.open) {
        feedback = formatCopy(copy.recorded, { number });
        feedbackTimer = setTimeout(() => { clearFeedback(); renderSummary(); }, 4000);
      }
      renderSummary();
    },
    reveal(number) {
      const index = store?.getPointRecords().findIndex(point => point.pointRecordId === number) ?? -1;
      if (index < 0) return false;
      panel.open = true; continuousOpen = true;
      if (!flush()) {
        requestAnimationFrame(() => { const invalid = host.querySelector('[aria-invalid="true"]'); if (invalid instanceof HTMLElement) invalid.focus(); });
        return false;
      }
      paintRows({index});
      const row = rows.get(number);
      showOptions(number, row.options);
      requestAnimationFrame(() => row.options.focus());
      return true;
    },
    render({ context: nextContext, store: nextStore, latest, device, captureState, busy: nextBusy, recordingMode = 'point', paused = false, captureVisible = true }) {
      if (context !== nextContext) configure(nextContext);
      store = nextStore; const busy = nextBusy;
      const saved = store?.getState();
      if (saved?.id && runId && runId !== saved.id) { reset(); configure(nextContext); store = nextStore; }
      runId = saved?.id ?? null;
      if (mode !== recordingMode) {
        if (mode === 'continuous') continuousOpen = panel.open;
        mode = recordingMode; panel.open = mode === 'point' || continuousOpen;
        live.hidden = mode !== 'point';
      }
      if (saved && revision !== saved.pointDataRevision) {
        const points = saved.pointCount + saved.withdrawnPointCount, added = Math.max(0, points - previousCount);
        const atEnd = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 8;
        const editing = notePopover.isOpen() || variablePopover.isOpen() || optionsPopover.isOpen() || viewport.contains(document.activeElement) || [...drafts.values()].some(draft => draft.dirty);
        columns = store.getRun().manualColumns; updateColumn();
        if (!variablePopover.isOpen()) { name.value = columns[0]?.name ?? ''; unit.value = columns[0]?.unit ?? ''; }
        const follow = !!added && atEnd && !editing;
        if (follow) unseen = 0; else unseen += added;
        paintRows({end:follow});
        previousCount = points; revision = saved.pointDataRevision;
      } else if (!saved) paintRows();
      captureButton.hidden = mode !== 'point' || !captureVisible;
      continuousCapture.hidden = mode === 'point' || !captureVisible;
      const valid = validateCurrent(); captureButton.disabled = continuousCapture.disabled = busy || !captureState.ready || !valid || composing.has(current);
      countText = formatCopy(saved?.withdrawnPointCount ? copy.count : copy.activeCount, { count: saved?.pointCount ?? 0, withdrawn: saved?.withdrawnPointCount ?? 0 });
      renderSummary();
      variableButton.disabled = name.disabled = unit.disabled = nameClear.disabled = unitClear.disabled = !!saved && !saved.writable;
      current.disabled = currentClear.disabled = busy || (!!saved && !saved.writable);
      const fresh = device.status === 'connected' && device.confirmed;
      setText(liveStatus, paused ? getLabCopy(context).common.paused : fresh ? getLabCopy(context).common.fresh : latest ? copy.lastValue : getLabCopy(context).measurement.waiting);
      const primaryRange = cards.find(card => card.channel === primary())?.range;
      for (const card of cards) {
        const cell = latest ? readCell(latest, card.channel.id) : { value: null, reason: copy.missing };
        setText(card.value, latest ? format(latest, card.channel) : '—');
        const component = readout.componentChannelIds.includes(card.channel.id);
        const range = component && primaryRange ? [-Math.max(...primaryRange.map(Math.abs)), Math.max(...primaryRange.map(Math.abs))] : card.range;
        card.gauge.hidden = !range || !!cell.reason;
        card.zero.hidden = card.gauge.hidden || !(range[0] < 0 && range[1] > 0);
        if (!card.zero.hidden) card.zero.style.left = (-range[0] / (range[1] - range[0]) * 100) + '%';
        if (range) { card.gauge.min = range[0] / scale(card.channel); card.gauge.max = range[1] / scale(card.channel); card.gauge.value = (cell.value ?? range[0]) / scale(card.channel); card.gauge.setAttribute('aria-valuetext', latest ? format(latest, card.channel) : copy.missing); }
        const bound = value => (value / scale(card.channel)).toLocaleString('ko-KR', { maximumFractionDigits: inG ? 3 : card.channel.digits ?? 2 });
        setText(card.rangeMessage, cell.reason ?? (!range ? copy.noRange : cell.value < range[0] || cell.value > range[1] ? copy.outside : `${bound(range[0])} — ${bound(range[1])} ${displayUnit(card.channel)}`));
      }
    },
    dispose() { clearFeedback(); abort.abort(); body.replaceChildren(); liveCards.replaceChildren(); componentCards.replaceChildren(); },
  };
}
