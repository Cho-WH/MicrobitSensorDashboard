import { element, findElement } from './dom.js';
import { getLabCopy, formatCopy, applyLabCopy } from './lab-copy.js';
import { readCell } from '../domain/columns.js';
import { validateManualColumns } from '../domain/point-records.js';
import { readVisualTheme, channelColor, channelTextColor } from './visual-theme.js';
import { setText } from './text.js';
import { STANDARD_GRAVITY, isSIAcceleration } from '../domain/acceleration-units.js';

import { parseCondition } from './condition-input.js';
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
  let page = 0, unseen = 0, previousCount = 0, rows = new Map(), drafts = new Map(), cards = [];
  let composing = new Set(), runId = null, inG = false, mode = null, continuousOpen = false;
  const pageSize = 50;
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
  const config = find('details', '#point-column-config'), configTitle = config.querySelector('summary');
  const name = find('input', '[data-point-field="conditionName"]'), unit = find('input', '[data-point-field="conditionUnit"]');
  const columnError = find('p', '#point-column-error');
  const preset = bind('[data-point-action="distance"]', () => { name.value = copy.distanceName; unit.value = 'cm'; });
  const columnSave = bind('#point-column-config [data-point-action="apply"]', () => saveColumn());
  bind('#point-column-config [data-point-action="cancel"]', () => { name.value = columns[0]?.name ?? ''; unit.value = columns[0]?.unit ?? ''; columnError.textContent = ''; config.open = false; });
  const current = find('input', '[data-point-field="condition"]'), currentCaption = find('span', '#point-condition-label');
  const currentError = find('p', '#point-condition-error');
  for (const field of [name, unit, current]) trackComposition(field);
  const captureButton = bind('#capture-point', () => { if (!composing.has(current)) onCapture(); });
  const continuousCapture = bind('#capture-continuous-point', () => { if (!composing.has(current)) onCapture(); });
  const reason = find('p', '#point-capture-reason'), feedback = find('p', '#point-feedback');
  const continuousReason = find('p', '#continuous-point-reason'), continuousFeedback = find('p', '#continuous-point-feedback');
  const conditionNote = find('p', '#point-condition-note'), conditionSummary = find('p', '#point-condition-summary');
  panel.addEventListener('toggle', () => { if (mode === 'continuous') continuousOpen = panel.open; }, { signal });
  current.addEventListener('input', () => { validateCurrent(); onChange(); }, { signal });
  const count = find('p', '#point-table-count'), empty = find('p', '#point-table-empty');
  const viewport = find('div', '.point-table-scroll'), head = find('thead', '.point-table thead'), body = find('tbody', '.point-table tbody');
  const controls = find('div', '.point-pages'), pageLabel = find('span', '#point-page-label');
  const previous = bind('[data-point-action="previous"]', () => turnPage(page - 1)), next = bind('[data-point-action="next"]', () => turnPage(page + 1));
  const newRecords = bind('[data-point-action="newRecords"]', () => { if (!flush()) return; page = Math.max(0, Math.ceil(previousCount / pageSize) - 1); unseen = 0; paintRows(); viewport.scrollTop = viewport.scrollHeight; });

  function setError(field, target, message = '') { setText(target, message); field.setAttribute('aria-invalid', String(!!message)); }
  function validateCurrent() {
    try { if (columns.length) parseCondition(current.value); setError(current, currentError); return true; }
    catch { setError(current, currentError, copy.numberInvalid); return false; }
  }
  function saveColumn() {
    if (composing.size) return false;
    try {
      const column = { id: columns[0]?.id ?? 'manual-condition', name: name.value.trim(), unit: unit.value.trim(), type: 'number' };
      validateManualColumns([column], context);
      if (store) store.setManualColumn(column);
      columns = [column]; config.open = false; columnError.textContent = ''; revision = -1;
      updateColumn(); onChange(); return true;
    } catch (error) { columnError.textContent = error.message; return false; }
  }
  function updateColumn() {
    current.closest('label').hidden = !columns.length;
    conditionNote.hidden = !columns.length;
    setText(configTitle, columns.length ? copy.editCondition : copy.addCondition);
    setText(currentCaption, columns.length ? `${copy.condition} · ${columns[0].name}${columns[0].unit ? ' (' + columns[0].unit + ')' : ''}` : copy.condition);
    const tr = element('tr');
    for (const title of [copy.number, ...(columns[0] ? [columns[0].name + (columns[0].unit ? ' (' + columns[0].unit + ')' : '')] : []), primary()?.name ?? '', copy.details]) {
      const th = element('th', '', title); th.scope = 'col'; tr.append(th);
    }
    head.replaceChildren(tr);
  }
  const primary = () => context?.channels.find(channel => channel.id === context.defaultGraph?.yColumnId) ?? context?.channels[0];
  const scale = channel => inG && channel.quantity === 'acceleration' ? STANDARD_GRAVITY : 1;
  const displayUnit = channel => inG && channel.quantity === 'acceleration' ? 'g' : channel.unit ?? '';
  const format = (sample, channel, liveUnits = true) => {
    const cell = readCell(sample, channel.id);
    const value = cell.value === null ? '—' : (cell.value / (liveUnits ? scale(channel) : 1)).toLocaleString('ko-KR', { maximumFractionDigits: liveUnits && inG ? 3 : channel.digits ?? 2 }) + ' ' + (liveUnits ? displayUnit(channel) : channel.unit ?? '');
    return cell.reason ? `${value} · ${cell.reason}` : value;
  };
  function configure(nextContext) {
    context = nextContext; copy = getLabCopy(context).point;
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
      const apply = action('apply', () => {
        if (composing.size) return;
        try {
          const low = parseCondition(min.value), high = parseCondition(max.value);
          if (low === null || high === null || low >= high) throw new Error();
          entry.range = [low, high]; rangeError.textContent = ''; rangeDetails.open = false; onChange();
        } catch { rangeError.textContent = copy.rangeInvalid; }
      });
      if (entry.range) { min.value = String(entry.range[0]); max.value = String(entry.range[1]); }
      rangeDetails.append(text('summary', 'range'), rangeFields, text('p', 'rangeNote', 'lab-note'), rangeError, apply);
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
    if (!drafts.has(point.pointRecordId)) drafts.set(point.pointRecordId, { condition: point.manualValues[columns[0]?.id] == null ? '' : String(point.manualValues[columns[0].id]), note: point.note, dirty: false });
    return drafts.get(point.pointRecordId);
  }
  function commit(id) {
    const draft = drafts.get(id), row = rows.get(id);
    if (!draft?.dirty) return true;
    if (row && [...composing].some(field => row.tr.contains(field))) return false;
    try {
      const manualValues = columns.length ? { [columns[0].id]: parseCondition(draft.condition) } : {};
      store.updatePointRecord(id, { manualValues, note: draft.note });
      draft.dirty = false; if (row) { setError(row.condition, row.error); row.editing.hidden = true; }
      feedback.textContent = formatCopy(copy.updated, { number: id }); onChange(); return true;
    } catch (error) { if (row) { setError(row.condition, row.error, error.message === 'numberInvalid' ? copy.numberInvalid : error.message); row.condition.focus({ preventScroll: true }); } return false; }
  }
  function cancel(id) {
    drafts.delete(id);
    const point = store.getPointRecords().find(point => point.pointRecordId === id);
    const row = rows.get(id); setError(row.condition, row.error); updateRow(row, point); onChange();
  }
  function makeRow(point, sample) {
    const id = point.pointRecordId, tr = element('tr'); tr.dataset.pointId = String(id);
    const number = element('th', '', String(id)); number.scope = 'row';
    const conditionCell = element('td'), field = element('input'); field.type = 'text'; field.inputMode = 'decimal'; field.maxLength = 100;
    field.setAttribute('aria-label', formatCopy(copy.editValue, { number: id })); trackComposition(field);
    const error = element('p', 'point-error'); error.id = 'point-error-' + id; error.setAttribute('role', 'status'); field.setAttribute('aria-describedby', error.id);
    const apply = action('apply', () => commit(id)), revert = action('cancel', () => cancel(id));
    const editing = element('div', 'point-edit-actions'); editing.append(apply, revert);
    conditionCell.append(field, error, editing);
    const values = element('td', 'point-value', format(sample, primary(), false));
    const detailsCell = element('td'), details = element('details'), noteLabel = element('label'), note = element('textarea'); note.maxLength = 500; trackComposition(note);
    note.setAttribute('aria-label', formatCopy(copy.editNote, { number: id })); noteLabel.append(text('span', 'note'), note);
    const times = element('dl');
    for (const [key, time] of [['received', sample.receivedAt], ['captured', point.capturedAt]]) times.append(text('dt', key), element('dd', '', new Date(time).toLocaleString('ko-KR', { hour12: false }) + '.' + String(time % 1000).padStart(3, '0')));
    for (const channel of context.channels.filter(c => c !== primary())) times.append(element('dt', '', channel.name), element('dd', '', format(sample, channel, false)));
    const withdrawal = action('withdraw', () => { if (commit(id)) { const point = store.getPointRecords().find(point => point.pointRecordId === id); store.setPointWithdrawn(id, !point.withdrawn); onChange(); } });
    const detailActions = element('div', 'point-edit-actions'); detailActions.append(action('apply', () => commit(id)), action('cancel', () => cancel(id)), withdrawal);
    details.append(text('summary', 'details'), times, noteLabel, detailActions);
    detailsCell.append(details); tr.append(number, conditionCell, values, detailsCell);
    for (const [input, key] of /** @type {[HTMLInputElement|HTMLTextAreaElement,string][]} */ ([[field, 'condition'], [note, 'note']])) {
      input.addEventListener('input', () => { const draft = draftFor(point); draft[key] = input.value; draft.dirty = true; editing.hidden = false; }, { signal });
      input.addEventListener('keydown', event => {
        if (!(event instanceof KeyboardEvent)) return;
        if (event.isComposing || event.keyCode === 229 || composing.has(input)) return;
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commit(id); }
        if (event.key === 'Escape') { event.preventDefault(); cancel(id); }
      }, { signal });
    }
    return { tr, number, condition: field, note, error, editing, withdrawal };
  }
  function updateRow(row, point) {
    const draft = draftFor(point);
    if (!draft.dirty) { draft.condition = point.manualValues[columns[0]?.id] == null ? '' : String(point.manualValues[columns[0].id]); draft.note = point.note; }
    // Never assign the value of an active draft on a reception/recording tick.
    for (const [field, value] of [[row.condition, draft.condition], [row.note, draft.note]]) if (field.value !== value && !composing.has(field)) field.value = value;
    row.condition.closest('td').hidden = !columns.length; row.condition.placeholder = copy.enterValue;
    row.condition.disabled = row.note.disabled = row.withdrawal.disabled = !store?.getState().writable;
    row.editing.hidden = !draft.dirty; row.tr.dataset.withdrawn = String(point.withdrawn);
    setText(row.number, String(point.pointRecordId) + (point.withdrawn ? ' · ' + copy.withdrawn : ''));
    setText(row.withdrawal, point.withdrawn ? copy.restore : copy.withdraw);
  }
  function paintRows() {
    const points = store?.getPointRecords() ?? [], visible = points.slice(page * pageSize, (page + 1) * pageSize);
    const ids = new Set(visible.map(point => point.pointRecordId));
    for (const [id, row] of rows) if (!ids.has(id)) { row.tr.remove(); rows.delete(id); }
    for (const point of visible) {
      let row = rows.get(point.pointRecordId);
      if (!row) { const sample = store.readSamples({ afterId: point.capturedSampleId - 1, throughId: point.capturedSampleId })[0]; row = makeRow(point, sample); rows.set(point.pointRecordId, row); body.append(row.tr); }
      updateRow(row, point);
    }
    const pages = Math.max(1, Math.ceil(points.length / pageSize));
    setText(pageLabel, formatCopy(copy.page, { page: page + 1, pages })); previous.disabled = page === 0; next.disabled = page >= pages - 1;
    empty.hidden = !!points.length; viewport.hidden = !points.length; controls.hidden = !points.length;
    setText(newRecords, formatCopy(copy.newRecords, { count: unseen })); newRecords.hidden = !unseen;
  }
  function flush() {
    if (composing.size) return false;
    if ((name.value !== (columns[0]?.name ?? '') || unit.value !== (columns[0]?.unit ?? '')) && !saveColumn()) return false;
    for (const [id, draft] of drafts) if (draft.dirty && !commit(id)) return false;
    return true;
  }
  function turnPage(target) { if (!flush()) return; page = target; paintRows(); viewport.scrollTop = 0; }
  function reset() {
    context = null; store = null; columns = []; revision = -1; page = 0; unseen = 0; previousCount = 0; runId = null;
    rows.clear(); drafts.clear(); composing.clear(); body.replaceChildren(); current.value = name.value = unit.value = ''; feedback.textContent = continuousFeedback.textContent = ''; columnError.textContent = ''; config.open = false;
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
    recorded(number) { (mode === 'point' ? feedback : continuousFeedback).textContent = formatCopy(copy.recorded, { number }); },
    reveal(number) {
      const index = store?.getPointRecords().findIndex(point => point.pointRecordId === number) ?? -1;
      if (index < 0) return false;
      panel.open = true; continuousOpen = true;
      if (!flush()) {
        requestAnimationFrame(() => { const invalid = host.querySelector('[aria-invalid="true"]'); if (invalid instanceof HTMLElement) invalid.focus(); });
        return false;
      }
      page = Math.floor(index / pageSize); paintRows();
      const row = rows.get(number);
      row.tr.querySelector('details').open = true;
      // Focus after the standard disclosure transition has exposed its content.
      requestAnimationFrame(() => row.tr.querySelector('summary').focus());
      return true;
    },
    render({ context: nextContext, store: nextStore, latest, device, captureState, busy: nextBusy, recordingMode = 'point' }) {
      if (context !== nextContext) configure(nextContext);
      store = nextStore; const busy = nextBusy;
      const saved = store?.getState();
      if (saved?.id && runId && runId !== saved.id) { reset(); configure(nextContext); store = nextStore; }
      runId = saved?.id ?? null;
      if (mode !== recordingMode) {
        if (mode === 'continuous') continuousOpen = panel.open;
        mode = recordingMode; panel.open = mode === 'point' || continuousOpen;
        panel.querySelector('summary').hidden = mode === 'point'; live.hidden = mode !== 'point';
        find('div', '#manual-point-controls').hidden = mode !== 'point';
        find('div', '#continuous-point-controls').hidden = mode === 'point';
      }
      if (saved && revision !== saved.pointDataRevision) {
        const points = saved.pointCount + saved.withdrawnPointCount, added = Math.max(0, points - previousCount);
        const atEnd = page >= Math.max(0, Math.ceil(previousCount / pageSize) - 1) && viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 8;
        const editing = viewport.contains(document.activeElement) || [...drafts.values()].some(draft => draft.dirty);
        columns = store.getRun().manualColumns; updateColumn();
        if (!config.open) { name.value = columns[0]?.name ?? ''; unit.value = columns[0]?.unit ?? ''; }
        if (added && atEnd && !editing) { page = Math.max(0, Math.ceil(points / pageSize) - 1); unseen = 0; } else unseen += added;
        paintRows(); if (added && atEnd && !editing) viewport.scrollTop = viewport.scrollHeight;
        previousCount = points; revision = saved.pointDataRevision;
      } else if (!saved) paintRows();
      const valid = validateCurrent(); captureButton.disabled = continuousCapture.disabled = busy || !captureState.ready || !valid || composing.has(current);
      const message = busy ? copy['capture-pending'] : !valid ? copy.numberInvalid : captureState.reason ? copy[captureState.reason] ?? captureState.reason : mode === 'point' ? copy.preview : copy.continuousReady;
      setText(reason, message); setText(continuousReason, message);
      const countText = formatCopy(saved?.withdrawnPointCount ? copy.count : copy.activeCount, { count: saved?.pointCount ?? 0, withdrawn: saved?.withdrawnPointCount ?? 0 });
      for (const target of [count, find('p', '#continuous-point-count'), find('span', '#point-panel-count')]) setText(target, countText);
      setText(conditionSummary, !columns.length ? copy.noCondition : !valid ? copy.numberInvalid : `${columns[0].name} · ${current.value.trim() || copy.conditionMissing}${current.value.trim() && columns[0].unit ? ' ' + columns[0].unit : ''}`);
      columnSave.disabled = preset.disabled = name.disabled = unit.disabled = !!saved && !saved.writable; current.disabled = busy || (!!saved && !saved.writable);
      const fresh = device.status === 'connected' && device.confirmed;
      setText(liveStatus, fresh ? getLabCopy(context).common.fresh : latest ? copy.lastValue : getLabCopy(context).measurement.waiting);
      const primaryRange = cards.find(card => card.channel === primary())?.range;
      for (const card of cards) {
        const cell = latest ? readCell(latest, card.channel.id) : { value: null, reason: copy.missing };
        setText(card.value, latest ? format(latest, card.channel) : '—');
        const sameQuantity = card.channel.quantity === primary()?.quantity;
        const range = card.channel !== primary() && sameQuantity && primaryRange ? [-Math.max(...primaryRange.map(Math.abs)), Math.max(...primaryRange.map(Math.abs))] : card.range;
        card.gauge.hidden = !range || !!cell.reason;
        card.zero.hidden = card.gauge.hidden || !(range[0] < 0 && range[1] > 0);
        if (!card.zero.hidden) card.zero.style.left = (-range[0] / (range[1] - range[0]) * 100) + '%';
        if (range) { card.gauge.min = range[0] / scale(card.channel); card.gauge.max = range[1] / scale(card.channel); card.gauge.value = (cell.value ?? range[0]) / scale(card.channel); card.gauge.setAttribute('aria-valuetext', latest ? format(latest, card.channel) : copy.missing); }
        const bound = value => (value / scale(card.channel)).toLocaleString('ko-KR', { maximumFractionDigits: inG ? 3 : card.channel.digits ?? 2 });
        setText(card.rangeMessage, cell.reason ?? (!range ? copy.noRange : cell.value < range[0] || cell.value > range[1] ? copy.outside : `${bound(range[0])} — ${bound(range[1])} ${displayUnit(card.channel)}`));
      }
    },
    dispose() { abort.abort(); body.replaceChildren(); liveCards.replaceChildren(); componentCards.replaceChildren(); },
  };
}
