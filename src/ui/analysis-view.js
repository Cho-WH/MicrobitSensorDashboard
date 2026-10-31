// Adapted from Cho-WH/bme280 gay-lussac/ui/analysis-view.js at 59c5c149450f970bace2deaa183857c275595853.
import { readCell, getSourceColumns } from '../domain/columns.js';
import { positionPopover } from './anchored-popover.js';
import { createWorkspace } from '../analysis/workspace.js';
import { createColumnFilters } from './column-filters.js';
import { createDataTable } from './data-table.js';
import { createCalculationEditor } from './calculation-editor.js';
import { createAnalysisGraph } from './analysis-graph.js';
import { createRangeSelector } from './range-selector.js';
import { createReflectionView } from './reflection-view.js';
import { tableColumns } from './table-columns.js';
import { columnFilterActive } from '../analysis/table-data.js';
import { scopeMembership, statusLabels, timeBounds } from '../analysis/scope.js';
import { formatCalculated } from '../analysis/calculations.js';
import { formatElapsedTime } from '../analysis/clock-time.js';
import { exportAnalysisPng, createChartView } from './chart-view.js';
import { getLabCopy, applyLabCopy, formatCopy } from './lab-copy.js';
import { readVisualTheme } from './visual-theme.js';
import { createAnalysisLayout } from './analysis-layout.js';
import { createPanelTransition } from './panel-transition.js';
import { cssTimeMilliseconds } from './css-time.js';
import { createRecordDialogs } from './record-dialogs.js';
import { createCentripetalView } from './centripetal/view.js';
import { getTimeAxisPolicies, getMeasurementOptions } from '../catalog/index.js';

export function createAnalysisView(root, { onError, onExport = (_kind, _anchor) => {} }) {
  let copy = getLabCopy(null);
  let copyContext = null;
  let theme = null;
  applyLabCopy(root, copy);
  const $ = id => root.querySelector('#' + id), events = new AbortController(), { signal } = events;
  const fittedLayout = createAnalysisLayout(root, {signal});
  let store = null, workspace = null, task = 'overview', tableOpen = false, allColumns = false, focusedId = null;
  let relationshipMode = 'split', overviewTableOpen = false, revealedColumnId = null;
  let overview = null, overviewKey = null, range = null, toastRevision = null, toastTimer = null, currentModel = null;
  const sources = new Map(), dialogs = createRecordDialogs(root);
  const centripetal = createCentripetalView($('centripetal-workspace'), {refresh: () => render(), navigation: $('centripetal-navigation')});
  let sourceId = 'recorded', originLink = null, sourceOptionsKey = '', inspectedKey = null;
  const viewState = () => ({task, relationshipMode, overviewTableOpen, revealedColumnId, focusedId,
    scrollTop: $('raw-scroll').scrollTop, scrollLeft: $('raw-scroll').scrollLeft, pageScroll:window.scrollY});
  function switchSource(nextSource) {
    if (!store || !reflection.flush() || !centripetal.flush()) return false;
    if (!getMeasurementOptions(store.getRun().context).points) nextSource = 'recorded';
    if (workspace && !originLink) sources.set(sourceId, {workspace, view: viewState()});
    const saved = sources.get(nextSource);
    const nextWorkspace = saved?.workspace ?? createWorkspace({store, sourceId: nextSource});
    if (store.getState().writable) store.setActiveSource(nextSource);
    closeExclusion(); filters.close(); calculations.close(); reflection.reset(); graph.reset(); range.reset(); dismissToast();
    overview?.dispose(); overview = null; overviewKey = null;
    sourceId = nextSource; workspace = nextWorkspace; originLink = null;
    const view = saved?.view;
    task = view?.task ?? (sourceId === 'points' ? 'relationship' : 'overview');
    relationshipMode = view?.relationshipMode ?? 'split'; overviewTableOpen = view?.overviewTableOpen ?? false;
    revealedColumnId = view?.revealedColumnId ?? null; focusedId = view?.focusedId ?? null;
    copyContext = workspace.getState().context; copy = getLabCopy(copyContext); applyLabCopy(root, copy);
    theme = readVisualTheme(root, getSourceColumns(copyContext).filter(c => !['sampleId','pointRecordId','receivedAt'].includes(c.id)));
    render({resetScroll:true});
    $('raw-scroll').scrollTop = view?.scrollTop ?? 0; $('raw-scroll').scrollLeft = view?.scrollLeft ?? 0;
    if (view) window.scrollTo({top:view.pageScroll,behavior:'instant'});
    return true;
  }
  $('analysis-source').addEventListener('change', () => act(() => switchSource($('analysis-source').value)), {signal});
  async function editCondition(pointId) {
    const point = store.getPointRecords().find(p => p.pointRecordId === pointId), column = store.getRun().manualColumns[0];
    if (!point || !column) return;
    await dialogs.condition(point, column, value => { store.updatePointRecord(pointId, {manualValues:{[column.id]:value}}); });
    render();
  }
  function syncInputs() {
    let activeChanged = false;
    // Also update cached sources while measurement is visible. Each Workspace
    // retains its own scope, exclusions, undo history and frozen evidence.
    for (const target of new Set([workspace, ...[...sources.values()].map(source => source.workspace)])) {
      if (!target) continue;
      try {
        if (target.syncExplicitChanges() && target === workspace) activeChanged = true;
      } catch (error) { $('analysis-feedback').textContent = error.message; }
    }
    return activeChanged;
  }
  const number = value => value.toLocaleString('ko-KR');
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const transitions = new Map();
  function animate(element, move = true) {
    if (element.hidden) return;
    if (!transitions.has(element)) transitions.set(element, createPanelTransition(element));
    transitions.get(element).play([element], move ? {} : {frames:[{opacity:.45},{opacity:1}]});
  }
  function dismissToast() { clearTimeout(toastTimer); toastRevision = null; $('analysis-toast').hidden = true; }
  function notify(text) {
    dismissToast(); toastRevision = workspace.getState().workspaceRevision;
    $('analysis-toast').querySelector('span').textContent = text; $('analysis-toast').hidden = false; animate($('analysis-toast'), false);
    toastTimer = setTimeout(dismissToast, 6500);
  }
  function act(action) {
    try {
      $('analysis-feedback').textContent = ''; action();
      if (toastRevision !== null && toastRevision !== workspace?.getState().workspaceRevision) dismissToast();
      render(); return true;
    } catch (error) { render(); $('analysis-feedback').textContent = error.message; return false; }
  }
  function inspect(id) {
    closeExclusion(); focusedId = id === focusedId ? null : id; render();
  }
  const table = createDataTable({ body: $('raw-rows'), scroller: $('raw-scroll'), status: $('table-status'),
    onToggle(id, selected) { act(() => workspace.toggleSelection(id, selected)); },
    onSort(id) { act(() => workspace.setSort(id)); }, onInspect: inspect, onEditCondition: editCondition });
  const filters = createColumnFilters(root, { getWorkspace: () => workspace, act, signal });
  const calculations = createCalculationEditor(root, { getWorkspace: () => workspace,
    render({ revealColumnId = undefined } = {}) {
      if (revealColumnId) revealedColumnId = revealColumnId;
      if (task === 'relationship' && relationshipMode === 'graph') relationshipMode = 'split';
      if (task === 'overview') overviewTableOpen = true; render();
      if (revealColumnId) {
        const header = [...root.querySelectorAll('[data-column]')].find(el => el.dataset.column === revealColumnId);
        if (header) $('raw-scroll').scrollLeft = header.offsetLeft - 32;
      }
    }, signal });
  const graph = createAnalysisGraph(root, { getWorkspace: () => workspace, act, signal, onSelect: inspect, getTheme:() => theme, getCopy:() => copy });
  let layoutTimer = null;
  function finishLayoutTransition() {
    clearTimeout(layoutTimer); layoutTimer = null; graph.endLayoutTransition();
    fittedLayout.schedule();
  }
  $('analysis-layout').addEventListener('transitionend', event => {
    if (event.target === $('analysis-layout') && event.propertyName === 'grid-template-columns') finishLayoutTransition();
  }, { signal });
  const reflection = createReflectionView(root, { getWorkspace: () => workspace, getStoreState: () => store?.getState(), act,
    getContext: () => copyContext, getTheme:() => theme, onBack: () => changeTask('relationship'), signal });
  range = createRangeSelector(root, { getChart: () => overview, signal, getCopy:() => copy,
    onApply(draft) { if (act(() => workspace.applyTimeRange(draft))) { range.close(); changeTask('relationship'); } },
    onClose() { $('choose-range').focus({ preventScroll: true }); } });
  function click(id, action) { $(id).addEventListener('click', action, { signal }); }
  function changeTask(next) {
    if (!reflection.flush()) return;
    finishLayoutTransition();
    if (next === 'interpretation' && workspace?.isWritable() && !workspace.getState().reflection.evidence && (workspace.getGraphData().points.length||workspace.getGraphData().right?.points.length)) {
      if (!act(() => workspace.captureReflection())) return;
    }
    closeExclusion(); filters.close(); calculations.close(); focusedId = null; task = next;
    render();
    animate($(next === 'overview' ? 'overview-pane' : next === 'interpretation' ? 'reflection-pane' : 'analysis-graph-pane'));
  }
  for (const button of root.querySelectorAll('[data-analysis-task]'))
    button.addEventListener('click', () => changeTask(button.dataset.analysisTask), { signal });
  click('use-graph-for-reflection', () => {
    if (reflection.flush() && act(() => workspace.captureReflection())) {
      changeTask('interpretation');
      $('reflection-notice').textContent = Object.values(workspace.getState().reflection.answers).some(text => text.trim())
        ? copy.reflection.checkAnswers : '';
      root.querySelector('.analysis-tabs').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      $('reflection-title').focus({ preventScroll: true });
    }
  });
  function openRange() {
    if (!workspace?.isWritable()) return;
    if (sourceId === 'points') {
      relationshipMode = 'table';
      changeTask('relationship');
      $('analysis-table-pane').scrollIntoView({block:'nearest'});
      ($('raw-rows').querySelector('input[data-select]') ?? $('raw-scroll')).focus({preventScroll:true});
      return;
    }
    changeTask('overview'); range.open(workspace.getState()); animate($('range-form'));
  }
  click('choose-range', openRange); click('edit-analysis-range', openRange);
  click('use-all-data', () => { if (act(() => workspace.applyScope('all'))) { range.close(); changeTask('relationship'); } });
  click('use-all-points', () => { if (act(() => workspace.applyScope('all'))) { relationshipMode = 'split'; changeTask('relationship'); } });
  click('apply-new-data', () => act(() => { workspace.showNewData(); overviewKey = null; }));
  click('point-origin', () => { if (act(() => {
    const point = store.getPointRecords().find(p => p.capturedSampleId === focusedId);
    if (!point || !switchSource('recorded')) return;
    // Cache the ordinary recorded view before opening this temporary origin view.
    sources.set('recorded', {workspace, view:viewState()});
    workspace.revealSample(point.capturedSampleId);
    originLink = {pointId:point.pointRecordId, sampleId:point.capturedSampleId};
    task = 'overview'; focusedId = point.capturedSampleId; overviewTableOpen = true; overviewKey = null;
  })) { table.reveal(focusedId); $('overview-pane').scrollIntoView({block:'start',behavior:'instant'}); } });
  click('return-to-points', () => { if (act(() => switchSource('points'))) $('point-origin').focus({preventScroll:true}); });
  click('select-all', () => act(() => $('select-all').checked ? workspace.selectAll() : workspace.clearSelection()));
  click('clear-selection', () => { if (act(() => workspace.clearSelection())) $('raw-scroll').focus({ preventScroll: true }); });
  const exclusionPanel = $('selection-exclusion-panel');
  let exclusionIds = [], exclusionAnchor = null;
  function closeExclusion() { exclusionPanel.hidePopover(); exclusionAnchor?.setAttribute('aria-expanded', 'false'); }
  function positionExclusion() { positionPopover(exclusionPanel, exclusionAnchor); }
  function openExclusion(ids, anchor) {
    closeExclusion(); exclusionIds = [...ids]; exclusionAnchor = anchor;
    $('exclusion-reason').value = ''; exclusionPanel.showPopover(); positionExclusion(); $('exclusion-reason').focus({ preventScroll: true });
  }
  exclusionPanel.addEventListener('toggle', () => exclusionAnchor?.setAttribute('aria-expanded', String(exclusionPanel.matches(':popover-open'))), { signal });
  root.addEventListener('scroll', positionExclusion, { capture: true, signal });
  window.addEventListener('resize', positionExclusion, { signal });
  click('cancel-selection-exclusion', () => { closeExclusion(); exclusionAnchor?.focus({ preventScroll: true }); });
  click('exclude-selection', () => openExclusion(workspace.getState().selectedIds, $('exclude-selection')));
  click('apply-selection-exclusion', () => {
    const ids = exclusionIds, count = ids.filter(id => !workspace.getState().exclusions.some(e => e.sampleId === id)).length;
    if (act(() => workspace.exclude(ids, $('exclusion-reason').value))) {
      closeExclusion(); $('exclusion-reason').value = ''; (exclusionAnchor?.hidden ? $('raw-scroll') : exclusionAnchor)?.focus({ preventScroll: true }); if (count) notify(number(count) + '개를 제외했어요');
    }
  });
  click('restore-selection', () => act(() => workspace.restore(workspace.getState().selectedIds)));
  $('analyze-selection')?.addEventListener('click', () => {
    if (act(() => workspace.applyScope('selection'))) {
      if (sourceId === 'points') relationshipMode = 'split';
      range.close(); changeTask('relationship');
    }
  }, { signal });
  click('undo-analysis', () => act(() => workspace.undo())); click('redo-analysis', () => act(() => workspace.redo()));
  click('undo-toast', () => { if (workspace?.getState().workspaceRevision === toastRevision) act(() => workspace.undo()); dismissToast(); });
  click('dismiss-toast', dismissToast);
  click('overview-table-toggle', () => {
    closeExclusion(); filters.close(); overviewTableOpen = !overviewTableOpen; render();
    if (overviewTableOpen) animate($('analysis-table-pane'));
  });
  const modeButtons = [...root.querySelectorAll('[data-relationship-mode]')];
  function setRelationshipMode(mode) {
    if (relationshipMode === mode) return;
    clearTimeout(layoutTimer);
    if (!reduced() && window.matchMedia('(min-width: 1001px)').matches) {
      graph.beginLayoutTransition();
      // Also finish when a task change, hidden tab or breakpoint cancels CSS events.
      const duration = cssTimeMilliseconds(getComputedStyle(root).getPropertyValue('--analysis-duration'));
      layoutTimer = setTimeout(finishLayoutTransition, duration + 100);
    } else finishLayoutTransition();
    closeExclusion(); filters.close(); calculations.close(); relationshipMode = mode; render();
  }
  for (const [index, button] of modeButtons.entries()) {
    button.addEventListener('click', () => setRelationshipMode(button.dataset.relationshipMode), { signal });
    button.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3
        : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
      if (next === null) return;
      event.preventDefault(); modeButtons[next].focus({ preventScroll: true });
      setRelationshipMode(modeButtons[next].dataset.relationshipMode);
    }, { signal });
  }
  function closePoint() {
    const focusInside = $('point-inspector').contains(document.activeElement);
    closeExclusion(); focusedId = null; render();
    if (focusInside) $(tableOpen ? 'raw-scroll' : 'analysis-chart').focus({ preventScroll: true });
  }
  click('close-point', closePoint);
  click('point-exclude', () => openExclusion([focusedId], $('point-exclude')));
  click('point-restore', () => act(() => workspace.restore([focusedId])));
  root.addEventListener('keydown', event => { if (event.key === 'Escape' && focusedId !== null && !root.querySelector(':popover-open, dialog[open]')) closePoint(); }, { signal });
  for (const button of root.querySelectorAll('[data-export]')) button.addEventListener('click', () => { if (reflection.flush()) onExport(button.dataset.export, button); }, { signal });
  function renderPoint(state, rows) {
    const samples = workspace?.getSamples() ?? [], sample = samples.find(s => s.sampleId === focusedId);
    const inspector = $('point-inspector'), host = $(tableOpen ? 'table-point-slot' : 'graph-point-slot');
    $('graph-point-slot').hidden = tableOpen;
    for (const slot of [$('table-point-slot'), $('graph-point-slot')]) slot.dataset.active = String(slot === host && Boolean(sample));
    if (inspector.parentElement !== host) host.append(inspector);
    inspector.hidden = !sample || (task === 'overview' && !tableOpen);
    const nextKey = sample ? `${sourceId}:${sample.sampleId}` : null;
    if (inspectedKey !== nextKey) $('point-extra').open = false;
    inspectedKey = nextKey;
    if (!sample) return;
    const scope = scopeMembership(state), excluded = scope.excluded.has(focusedId);
    $('point-title').textContent = (task === 'overview' && Number.isFinite(sample.receivedAt)
      ? formatElapsedTime((sample.receivedAt - workspace.getTimeOrigin()) / 1000)
      : sample.pointRecordId ? sample.pointRecordId + '번 기록' : '자료 ' + sample.sampleId) + ' · ' + statusLabels[scope.status(focusedId)];
    $('point-time').textContent = Number.isFinite(sample.receivedAt) ? new Date(sample.receivedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }) : '시각 정보 없음';
    const sourceChannels = state.sourceColumns.filter(c => !['sampleId', 'pointRecordId', 'receivedAt'].includes(c.id));
    const primaryIds = new Set([state.context.defaultGraph?.yColumnId, currentModel?.xColumnId, currentModel?.yColumnId, currentModel?.right?.yColumnId]);
    const values = [], extra = [];
    const format = (value, unit) => value === null ? '미입력' : formatCalculated(value) + (unit ? ' ' + unit : '');
    for (const c of sourceChannels) {
      const cell = readCell(sample, c.id);
      const pair = {name:c.name, value:cell.reason ?? format(cell.value, c.unit)};
      (c.manual || primaryIds.has(c.id) ? values : extra).push(pair);
    }
    const shown = new Set(['receivedAt', ...sourceChannels.map(c => c.id)]);
    for (const model of [currentModel, currentModel?.right].filter(Boolean)) {
      const point = [...model.points, ...model.excludedPoints].find(p => p.sampleId === focusedId);
      if (point) for (const axis of ['x', 'y']) {
        const id = model[axis + 'ColumnId'];
        if (!shown.has(id)) { values.push({name:model[axis + 'Label'], value:formatCalculated(point[axis])}); shown.add(id); }
      }
    }
    const reason = state.exclusions.find(e => e.sampleId === focusedId)?.reason;
    if (reason) values.push({name:'제외 사유', value:reason});
    if (sample.pointRecordId && store.getRun().recordingMode === 'continuous') extra.push({name:'연결된 원자료', value:`${sample.sampleId}번`});
    const valuePair = ({name, value}) => {
      const pair = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = name; dd.textContent = value; pair.append(dt, dd);
      return pair;
    };
    $('point-values').replaceChildren(...values.map(valuePair));
    $('point-extra-values').replaceChildren(...extra.map(valuePair)); $('point-extra').hidden = !extra.length;
    $('point-filter-notice').hidden = !tableOpen || rows.some(s => s.sampleId === focusedId);
    $('point-filter-notice').textContent = '표 필터에 가려진 자료입니다. 필터를 해제하면 표에서도 볼 수 있어요.';
    $('point-exclude').hidden = excluded; $('point-restore').hidden = !excluded;
    $('point-origin').hidden = sourceId !== 'points' || store.getRun().recordingMode !== 'continuous';
    if (sample.withdrawn) { $('point-exclude').hidden = true; $('point-restore').hidden = true; }
  }
  function render({ resetScroll = false } = {}) {
    syncInputs();
    const activityActive = centripetal.render(workspace,store);
    root.querySelector('.analysis-source-control').hidden = !getMeasurementOptions(store?.getRun().context ?? copyContext).points;
    root.querySelector('.analysis-tabs').hidden = activityActive;
    root.querySelector(':scope > .analysis-workspace').hidden = activityActive;
    if (activityActive) { delete root.dataset.task; delete root.dataset.source; updateStatus(); return; }
    tableOpen = task === 'overview' ? overviewTableOpen : relationshipMode !== 'graph';
    allColumns = task === 'relationship' && relationshipMode === 'table';
    const writable = workspace?.isWritable() ?? false;
    root.querySelectorAll('[data-workspace-action]').forEach(el => { el.disabled = !writable; });
    const state = workspace?.getState(), summary = workspace?.getSummary(), rows = workspace?.getRows() ?? [], samples = workspace?.getSamples() ?? [];
    currentModel = workspace?.getGraphData() ?? null;
    const importedColumns = workspace?.getImportedColumns() ?? [], axisIds = task !== 'overview' && !allColumns && currentModel ? [currentModel.xColumnId, currentModel.yColumnId, ...(currentModel.right?[currentModel.right.yColumnId]:[]), ...(revealedColumnId ? [revealedColumnId] : [])] : null;
    root.dataset.task = task; root.dataset.source = sourceId; $('analysis-layout').dataset.tableOpen = String(tableOpen);
    $('analysis-layout').dataset.tableOnly = String(task === 'relationship' && allColumns);
    root.querySelector('.analysis-tabs').style.setProperty('--active-tab', ['overview', 'relationship', 'interpretation'].indexOf(task));
    for (const button of root.querySelectorAll('[data-analysis-task]')) {
      if (button.dataset.analysisTask === task) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    $('overview-pane').hidden = task !== 'overview'; $('analysis-graph-pane').hidden = task !== 'relationship';
    $('analysis-graph-pane').inert = allColumns;
    $('analysis-graph-pane').setAttribute('aria-hidden', String(allColumns));
    $('analysis-layout').hidden = task === 'interpretation'; root.querySelector('.analysis-scope-bar').hidden = task === 'interpretation';
    $('reflection-pane').hidden = task !== 'interpretation';
    $('analysis-table-pane').hidden = task !== 'relationship' && !tableOpen;
    $('analysis-table-pane').inert = !tableOpen;
    $('analysis-table-pane').setAttribute('aria-hidden', String(!tableOpen));
    $('relationship-layout-control').hidden = task !== 'relationship';
    $('relationship-layout-control').style.setProperty('--active-tab', ['table', 'split', 'graph'].indexOf(relationshipMode));
    for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.relationshipMode === relationshipMode));
    $('overview-table-toggle').setAttribute('aria-expanded', String(tableOpen));
    const shown = new Set(tableColumns(state?.calculatedColumns ?? [], axisIds, importedColumns, state?.context).map(c => c.id));
    const hiddenFilters = tableColumns(state?.calculatedColumns ?? [], null, importedColumns, state?.context).filter(c => (axisIds !== null || !shown.has(c.id)) && columnFilterActive(state?.table.filter ?? {}, c.id)).length;
    $('hidden-column-filters').hidden = !hiddenFilters; $('hidden-column-filters').textContent = formatCopy(copy.analysis.hiddenFilters,{count:hiddenFilters});
    $('scope-count').textContent = formatCopy(copy.analysis.includedCount,{count:number(summary?.includedCount ?? 0)});
    $('scope-detail').textContent = formatCopy(copy.analysis.excludedCount,{count:number(summary?.excludedCount ?? 0)});
    $('scope-detail').hidden = !summary?.excludedCount;
    const origin = workspace?.getTimeOrigin() ?? null;
    $('point-origin-banner').hidden = !originLink;
    $('point-origin-label').textContent = originLink ? `${originLink.pointId}번 기록의 원래 시점 · 원자료 ${originLink.sampleId}번` : '';
    const bounds = timeBounds(samples, origin), elapsed = at => formatCalculated((at - bounds.origin) / 1000);
    $('overview-title').textContent = samples.length && !bounds ? copy.analysis.orderTitle : copy.analysis.timeTitle;
    const chartChannels = state?.sourceColumns.filter(c => !['sampleId','pointRecordId','receivedAt'].includes(c.id) && !c.manual && c.supported !== false) ?? [];
    $('overview-chart').setAttribute('aria-label', [bounds ? copy.accessibility.timeChart : copy.accessibility.orderChart,
      ...chartChannels.map(c => c.name + (c.unit ? ' (' + c.unit + ')' : ''))].join(' · '));
    $('scope-time').textContent = state?.appliedScope === 'all' ? copy.analysis.allData : state?.analysisRange && bounds
      ? elapsed(state.analysisRange.startAt) + '–' + elapsed(state.analysisRange.endAt) + copy.analysis.seconds : copy.analysis.selectedData;
    $('edit-analysis-range').textContent = sourceId === 'points' ? '기록 선택' : copy.analysis.editRange;
    $('choose-range').textContent = sourceId === 'points' ? '표에서 기록 선택' : copy.analysis.chooseRange;
    $('edit-analysis-range').disabled = $('choose-range').disabled = !writable || (sourceId === 'points' ? !samples.length : !bounds);
    $('use-all-points').hidden = sourceId !== 'points';
    $('use-all-points').disabled = !writable || !samples.length || state.appliedScope === 'all';
    $('point-range-hint').hidden = sourceId !== 'points' || !allColumns;
    $('use-all-data').disabled = !writable || !samples.length;
    $('selection-toolbar').dataset.active = String(Boolean(summary?.selectedCount));
    $('selection-toolbar').inert = !summary?.selectedCount;
    if (!writable || (exclusionAnchor === $('exclude-selection') && !summary?.selectedCount)) closeExclusion();
    $('selection-count').textContent = formatCopy(copy.analysis.selectedCount,{count:number(summary?.selectedCount ?? 0)});
    for (const id of ['exclude-selection', 'restore-selection', 'clear-selection']) $(id).disabled = !writable || !summary?.selectedCount;
    if ($('analyze-selection')) $('analyze-selection').disabled = !writable || !summary?.selectedCount;
    for (const [id, label] of [['undo-analysis', summary?.undoLabel], ['redo-analysis', summary?.redoLabel]]) {
      $(id).disabled = !writable || !label; $(id).title = (id === 'undo-analysis' ? copy.common.undo : copy.common.redo) + (label ? ': ' + label : '');
    }
    const all = $('select-all'), count = summary?.visibleSelectedCount ?? 0;
    all.checked = rows.length > 0 && count === rows.length; all.indeterminate = count > 0 && count < rows.length; all.disabled = !writable || !rows.length;
    table.render({ samples: rows, selectedIds: state?.selectedIds ?? [], excluded: state?.exclusions ?? [], appliedIds: state?.appliedIds ?? [],
      focusedSampleId: focusedId, calculatedColumns: state?.calculatedColumns ?? [], importedColumns, axisIds,
      filter: state?.table.filter, sort: state?.table.sort ?? { columnId: 'sampleId', direction: 'asc' }, canEdit: writable, resetScroll, context: state?.context });
    graph.render(state, currentModel, task === 'relationship' && !allColumns, writable, focusedId);
    $('use-graph-for-reflection').disabled = !writable || !(currentModel?.points.length||currentModel?.right?.points.length);
    reflection.render(task === 'interpretation');
    if (task === 'overview' && workspace) {
      overview ??= createChartView($('overview-chart'), { inspect: true, legendToggle: false, eventMarkers: false, theme, context: state.context, axisPolicies:getTimeAxisPolicies(state.context), onLayout: () => range.layout(), onCursor(sample, elapsedSeconds) {
        $('overview-readout').textContent = sample ? (Number.isFinite(elapsedSeconds) ? formatElapsedTime(elapsedSeconds) : '자료 ' + sample.sampleId + ' · 시각 정보 없음')
          + workspace.getSourceColumns().filter(c => !['sampleId', 'pointRecordId', 'receivedAt'].includes(c.id)).map(c => { const cell = readCell(sample, c.id); return ' · ' + c.name + ' ' + (cell.reason ?? formatCalculated(cell.value) + (c.unit ? ' ' + c.unit : '')); }).join('')
          : copy.analysis.cursorHint;
      } });
      const key = sourceId + ':' + state.runId + ':' + state.tableLastSampleId + ':' + state.inputSnapshot?.sourceRevision + ':' + originLink?.sampleId;
      if (overviewKey !== key) {
        const untimed = samples.filter(sample => !Number.isFinite(sample.receivedAt)).length;
        $('overview-readout').textContent = !bounds && samples.length ? copy.analysis.untimed
          : untimed ? formatCopy(copy.analysis.untimedCount,{count:untimed})
          : copy.analysis.readout;
        overview.render(samples.filter(s => !s.withdrawn), 0, { range: 'all', origin, pointsOnly: sourceId === 'points', focusSampleId: originLink?.sampleId }); overviewKey = key;
      }
      overview.resize(); range.layout();
    }
    $('overview-empty').hidden = samples.length > 0;
    if (state) range.update(samples, state, origin);
    renderPoint(state, rows);
    for (const button of root.querySelectorAll('[data-export]'))
      button.disabled = !workspace || (button.dataset.export === 'analysis-csv' && !summary?.includedCount) || (button.dataset.export === 'png' && !currentModel);
    updateStatus();
    fittedLayout.schedule();
  }
  function updateStatus() {
    if (syncInputs()) { render(); return; }
    reflection.updateStatus();
    if (!workspace || !store) { $('analysis-message').textContent = copy.analysis.noRun; $('apply-new-data').hidden = true; return; }
    const saved = store.getState(), pending = workspace.pendingChanges(), added = pending.added;
    const options = [...(saved.recordingMode !== 'point' ? [['recorded', `${saved.recordingMode === null ? '가져온 자료' : '연속 기록'} ${saved.sampleCount}개`]] : []),
      ...(saved.pointCount + saved.withdrawnPointCount || saved.recordingMode === 'point' ? [['points', `한 점 기록 ${saved.pointCount}개`]] : [])];
    const key = JSON.stringify(options);
    if (key !== sourceOptionsKey) { $('analysis-source').replaceChildren(...options.map(([value, label]) => new Option(label, value))); sourceOptionsKey = key; }
    $('analysis-source').value = sourceId;
    $('analysis-message').textContent = !saved.writable ? copy.common.readOnly : '';
    const waiting = sourceId === 'recorded' && added > 0;
    $('apply-new-data').textContent = formatCopy(copy.analysis.newData,{count:number(added)});
    $('apply-new-data').hidden = !waiting; $('apply-new-data').disabled = !saved.writable || !waiting;
  }
  function reset() {
    centripetal.reset();
    sources.clear(); sourceOptionsKey = ''; originLink = null; inspectedKey = null; dialogs.dispose();
    transitions.forEach(transition => transition.cancel());
    clearTimeout(layoutTimer); layoutTimer = null;
    store = null; workspace = null; task = 'overview'; tableOpen = allColumns = overviewTableOpen = false; relationshipMode = 'split'; revealedColumnId = null; focusedId = null; currentModel = null;
    closeExclusion(); filters.close(); calculations.close(); graph.reset(); reflection.reset(); overview?.dispose(); overview = null; overviewKey = null; range.reset(); dismissToast();
  }
  return {
    open(nextStore, context = null, requestedSource = null) {
      if (!nextStore && copyContext !== context) {
        copyContext = context; copy = getLabCopy(context); applyLabCopy(root, copy);
      }
      if (nextStore !== store) {
        reset(); store = nextStore; $('analysis-feedback').textContent = ''; $('exclusion-reason').value = '';
        try { if (store) { switchSource(requestedSource ?? store.getSnapshot().workspace?.activeSourceId ?? (store.getRun().recordingMode === 'point' ? 'points' : 'recorded')); return; } } catch (error) { onError('분석 작업을 열지 못했어요. ' + error.message); }
        copyContext = workspace?.getState().context ?? context;
        theme = readVisualTheme(root, getSourceColumns(copyContext).filter(column => !['sampleId','receivedAt'].includes(column.id)));
        copy = getLabCopy(copyContext); applyLabCopy(root, copy);
        render({ resetScroll: true });
      } else if (requestedSource && requestedSource !== sourceId) act(() => switchSource(requestedSource));
      else render();
    },
    flush: () => reflection.flush() && centripetal.flush(), getWorkspace: () => workspace, updateStatus, hasGraph: () => Boolean(workspace && (task !== 'interpretation' || workspace.getReflectionModel())),
    exportPng: name => {
      const model = task === 'interpretation' ? workspace?.getReflectionModel() : workspace?.getGraphData();
      return exportAnalysisPng(model, { name, theme });
    },
    reset,
    dispose() { reset(); centripetal.dispose(); transitions.forEach(transition => transition.dispose()); transitions.clear(); events.abort(); table.dispose(); },
  };
}
