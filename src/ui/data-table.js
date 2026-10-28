// Adapted from Cho-WH/bme280 gay-lussac/ui/data-table.js at 59c5c149450f970bace2deaa183857c275595853.
import { hasInvalidValue } from '../analysis/table-data.js';
import { clockTime, formatClockTime } from '../analysis/clock-time.js';
import { formatCalculated } from '../analysis/calculations.js';
import { createTableHeader } from './table-header.js';
import { tableColumns } from './table-columns.js';
import { statusLabels } from '../analysis/scope.js';

import { readCell } from '../domain/columns.js';

const time = value => formatClockTime(clockTime(value)) || '—';
const number = value => Number.isFinite(value) ? value.toFixed(2) : '—';

// Reuses the M2 virtual table: full scroll range, only nearby rows in the DOM.
export function createDataTable({ body, scroller, status, onToggle, onSort, onInspect = (_sampleId) => {}, onEditCondition = (_pointId) => {} }) {
  let rowHeight = 32;
  const overscan = 8, table = body.closest('table');
  table.style.setProperty('--raw-row-height', `${rowHeight}px`);
  const events = new AbortController(), { signal } = events;
  let rows = [], selected = new Set(), exclusions = new Map(), writable = false, columns = [], compact = false;
  let frame = null, renderedStart = -1, renderedEnd = -1, viewKey = null;
  let applied = null, focusedId = null, context = null, pendingConditions = new Map();
  const header = createTableHeader({ table, onSort, signal });
  function spacer(fragment, count) {
    if (!count) return;
    const row = document.createElement('tr'); row.className = 'table-spacer'; row.setAttribute('aria-hidden', 'true');
    const cell = row.insertCell(); cell.colSpan = header.columnCount; cell.style.height = `${count * rowHeight}px`;
    fragment.append(row);
  }
  function paint() {
    frame = null;
    // Match virtual spacers to enlarged text, preserving the current row when
    // the user changes font size. Samples and table selection are untouched.
    const nextHeight = Math.max(32, Math.ceil(parseFloat(getComputedStyle(table).fontSize) * (pendingConditions.size ? 4.4 : context?.analysisSource === 'points' ? 3.2 : 2.4)));
    if (nextHeight !== rowHeight) {
      const first = scroller.scrollTop / rowHeight;
      rowHeight = nextHeight; table.style.setProperty('--raw-row-height', `${rowHeight}px`);
      scroller.scrollTop = first * rowHeight; renderedStart = renderedEnd = -1;
    }
    // Recompute after the row metric changes (pending values or text zoom), so
    // short tables do not clip their last row using the previous height.
    scroller.style.setProperty('--table-content-height', `${Math.max(112, (rows.length + 1) * rowHeight + 16)}px`);
    const first = Math.min(Math.floor(scroller.scrollTop / rowHeight), Math.max(0, rows.length - 1));
    const visibleCount = Math.max(1, Math.ceil(((scroller.clientHeight || 520) - rowHeight) / rowHeight));
    const start = Math.max(0, first - overscan), end = Math.min(rows.length, first + visibleCount + overscan + 1);
    status.textContent = rows.length ? `표시 ${rows.length.toLocaleString()}개 · ${first + 1}–${Math.min(rows.length, first + visibleCount)}번째 행` : '조건에 해당하는 자료가 없어요.';
    if (start === renderedStart && end === renderedEnd) return;
    renderedStart = start; renderedEnd = end;
    const active = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? document.activeElement : null;
    const focused = active?.dataset.select;
    const focusedRow = active?.dataset.sampleId;
    const focusedCondition = active?.dataset.editCondition;
    const fragment = document.createDocumentFragment();
    spacer(fragment, start);
    for (let index = start; index < end; index++) {
      const sample = rows[index], id = sample.sampleId, excluded = exclusions.has(id);
      const row = document.createElement('tr'); row.className = 'sample-row'; row.dataset.sampleId = id;
      row.dataset.selected = String(selected.has(id));
      const usageState = sample.withdrawn ? 'withdrawn' : applied && !applied.has(id) ? 'outside' : excluded ? 'excluded' : 'included';
      row.dataset.usage = usageState; row.dataset.focused = String(id === focusedId);
      row.setAttribute('aria-rowindex', String(index + 2));
      const recordName = sample.pointRecordId ? `${sample.pointRecordId}번 기록` : `자료 ${id}`;
      row.tabIndex = 0; row.setAttribute('aria-label', `${recordName}, ${statusLabels[usageState]}. Enter로 정보 보기`);
      const cell = row.insertCell(), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = selected.has(id); checkbox.disabled = !writable;
      checkbox.dataset.select = id; checkbox.setAttribute('aria-label', `${recordName} 선택`); cell.append(checkbox);
      const reason = exclusions.get(id);
      const usage = statusLabels[usageState];
      const note = `${hasInvalidValue(sample, context) ? '값 확인 필요' : '정상 범위'}${excluded ? ' · 제외 기록' : ''}${reason ? ` · ${reason}` : ''}`;
      function cellText(value) { const td = row.insertCell(); td.textContent = String(value); td.title = String(value); return td; }
      for (const c of columns) {
        if (c.editable || c.imported) {
          const result = c.imported ? sample.importedValues[c.id] : sample.calculations[c.id], td = cellText(formatCalculated(result.value));
          td.dataset.calculated = c.id;
          if (result.reason) {
            const detail = document.createElement('button'); detail.type = 'button'; detail.className = 'calculation-error';
            detail.textContent = '—'; detail.dataset.reason = result.reason;
            detail.setAttribute('aria-label', c.name + (c.imported ? ': 값 없음 이유' : ': 계산 불가 이유')); detail.title = result.reason; td.replaceChildren(detail);
            td.title = result.reason;
          } else td.title = String(result.value);
        } else if (c.id === 'usage') cellText(usage).className = 'sample-usage';
        else if (c.id === 'note') cellText(note);
        else if (c.id === 'receivedAt') cellText(time(sample.receivedAt));
        else if (c.manual && sample.pointRecordId) {
          const td = row.insertCell(), button = document.createElement('button');
          const pending = pendingConditions.get(sample.pointRecordId), appliedValue = readCell(sample, c.id).value;
          const value = pending ? pending.value : appliedValue;
          button.type = 'button'; button.dataset.editCondition = sample.pointRecordId;
          button.textContent = value === null ? '입력하기' : formatCalculated(value);
          button.setAttribute('aria-label', `${sample.pointRecordId}번 ${c.name} 편집`); button.disabled = !writable; td.append(button);
          if (pending) {
            if (pending.unit !== c.unit) button.textContent += pending.unit ? ` ${pending.unit}` : '';
            button.title = `${pending.name}: ${value ?? '미입력'} ${pending.unit ?? ''} · 입력 완료, 분석 반영 대기`;
            const note = document.createElement('small'); note.className = 'condition-pending';
            note.id = `condition-pending-${sample.pointRecordId}`;
            note.textContent = `분석: ${appliedValue === null ? '미입력' : formatCalculated(appliedValue)}${pending.unit !== c.unit && c.unit ? ' ' + c.unit : ''}`;
            note.title = note.textContent + ' · 변경 반영 대기';
            button.setAttribute('aria-describedby', note.id + ' point-input-notice'); td.append(note);
          }
        } else cellText(['sampleId', 'pointRecordId'].includes(c.id) ? readCell(sample, c.id).value : number(readCell(sample, c.id).value));
      }
      if (!compact) row.insertCell(); // Header-only action column.
      const filler = row.insertCell(); filler.className = 'table-fill'; filler.setAttribute('aria-hidden', 'true');
      const compactStatus = document.createElement('span'); compactStatus.className = 'sample-id-status';
      compactStatus.textContent = usage;
      compactStatus.setAttribute('aria-hidden', 'true');
      if (compact && sample.pointRecordId && usageState !== 'included') compactStatus.classList.add('is-visible');
      row.cells[1].append(compactStatus);
      fragment.append(row);
    }
    spacer(fragment, rows.length - end);
    if (!rows.length) {
      const row = document.createElement('tr'), cell = row.insertCell(); cell.colSpan = header.columnCount;
      cell.className = 'empty-cell'; cell.textContent = '표에 표시할 자료가 없어요.'; fragment.append(row);
    }
    body.replaceChildren(fragment);
    if (focusedRow) body.querySelector(`[data-sample-id="${focusedRow}"]`)?.focus({ preventScroll: true });
    if (focused) body.querySelector(`[data-select="${focused}"]`)?.focus({ preventScroll: true });
    if (focusedCondition) body.querySelector(`[data-edit-condition="${focusedCondition}"]`)?.focus({ preventScroll: true });
  }
  function schedule() { frame ??= requestAnimationFrame(paint); }
  scroller.addEventListener('scroll', schedule, { passive: true, signal });
  scroller.addEventListener('keydown', event => {
    // Keep Home/End inside the focused virtual table, rather than scrolling the whole page.
    if (event.target !== scroller || event.altKey || event.metaKey || !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    scroller.scrollTop = event.key === 'Home' ? 0 : scroller.scrollHeight;
    schedule();
  }, { signal });
  body.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-condition]');
    if (edit) { onEditCondition(Number(edit.dataset.editCondition)); return; }
    const checkbox = event.target.closest('[data-select]');
    if (checkbox) onToggle(Number(checkbox.dataset.select), { checked: checkbox.checked, extend: event.shiftKey });
    else if (!event.target.closest('button, input')) { const row = event.target.closest('[data-sample-id]'); if (row) onInspect(Number(row.dataset.sampleId)); }
  }, { signal });
  body.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('[data-sample-id]')) { event.preventDefault(); onInspect(Number(event.target.dataset.sampleId)); }
  }, { signal });
  const observer = new ResizeObserver(schedule); observer.observe(scroller); observer.observe(table.tHead);
  return {
    render({ samples, selectedIds, excluded, appliedIds = null, focusedSampleId = null, sort, filter = {}, calculatedColumns = [], importedColumns = [], axisIds = null, canEdit, resetScroll = false, context: nextContext, pendingConditions: nextPending = new Map() }) {
      context = nextContext;
      pendingConditions = nextPending;
      applied = appliedIds ? new Set(appliedIds) : null; focusedId = focusedSampleId;
      compact = axisIds !== null; columns = tableColumns(calculatedColumns, axisIds, importedColumns, context);
      header.render({ columns, compact, sort, filter, canEdit });
      const nextViewKey = JSON.stringify({ sort, filter });
      if (resetScroll || viewKey !== nextViewKey) scroller.scrollTop = 0;
      viewKey = nextViewKey;
      rows = samples; selected = new Set(selectedIds);
      exclusions = new Map(excluded.map(e => [e.sampleId, e.reason])); writable = canEdit;
      renderedStart = renderedEnd = -1; cancelAnimationFrame(frame);
      table.setAttribute('aria-rowcount', String(rows.length + 1));
      paint();
    },
    reveal(sampleId) {
      const index = rows.findIndex(s => s.sampleId === sampleId);
      if (index < 0) return;
      const top = index * rowHeight;
      if (top < scroller.scrollTop || top + rowHeight * 2 > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top;
      schedule();
    },
    dispose() { observer.disconnect(); events.abort(); cancelAnimationFrame(frame); },
  };
}
