// Adapted from Cho-WH/bme280 gay-lussac/ui/analysis-graph.js at 59c5c149450f970bace2deaa183857c275595853.
import { graphColumns } from '../domain/contracts.js';
import { columnLabel } from '../analysis/calculations.js';
import { createAnalysisChart } from './chart-view.js';
import { createTrendControls } from './trend-controls.js';
import { analysisSeriesColors } from './visual-theme.js';
import { bindDisclosureMenu } from './disclosure-menu.js';
import { labDefaults } from './lab-copy.js';

export function createAnalysisGraph(root, { getWorkspace, act, onSelect, signal, getTheme = () => null, getCopy = () => labDefaults }) {
  const $ = id => root.querySelector('#' + id), x = $('graph-x'), y = $('graph-y'), rightY = $('graph-y-right'), gaps = $('graph-gaps');
  const shapeButtons = [...root.querySelectorAll('[data-graph-type]')];
  let chart = null, columnsKey = null;
  let settingsExpanded = true;
  const settingsToggle = $('toggle-axis-settings'), settingsPanel = $('axis-settings-panel');
  function showSettings(expanded) {
    settingsExpanded = expanded;
    if (!expanded && settingsPanel.contains(settingsPanel.ownerDocument.activeElement)) settingsToggle.focus({preventScroll:true});
    settingsToggle.setAttribute('aria-expanded', String(expanded));
    settingsToggle.textContent = expanded ? '설정 접기' : '축 설정';
    settingsPanel.dataset.collapsed = String(!expanded);
    settingsPanel.inert = !expanded;
    settingsPanel.setAttribute('aria-hidden', String(!expanded));
    $('axis-summary').hidden = expanded;
    $('axis-settings-title').hidden = !expanded;
  }
  settingsToggle.addEventListener('click', () => showSettings(!settingsExpanded), {signal});
  const currentGraph = () => { const state = getWorkspace().getState(); return state.graph ?? state.defaultGraph; };
  const changeRight = patch => getWorkspace().setRightAxis({ ...currentGraph().right, ...patch });
  const trend = createTrendControls(root, { act, signal, getCopy, onEnabled: enabled => getWorkspace().setTrendEnabled(enabled), onView: view => getWorkspace().setGraphView(view) });
  const rightTrend = createTrendControls(root, { act, signal, getCopy, prefix:'right-', onEnabled: enabled => changeRight({trendEnabled:enabled, view:'measured'}), onView: view => changeRight({view}) });
  bindDisclosureMenu($('graph-shape-menu'), {signal});
  function change(type = currentGraph().type) {
    act(() => getWorkspace().setGraph({ ...currentGraph(), xColumnId:x.value, yColumnId:y.value, type:x.value === 'receivedAt' ? type : 'scatter', connectGaps:gaps.checked }));
  }
  for (const input of [x, y, gaps]) input.addEventListener('change', () => change(), {signal});
  for (const button of shapeButtons) button.addEventListener('click', () => change(button.dataset.graphType), {signal});
  rightY.addEventListener('change', () => act(() => changeRight({yColumnId:rightY.value, view:'measured'})), {signal});
  $('add-right-axis').addEventListener('click', () => {
    const next = [...rightY.options].find(option => option.value !== y.value);
    if (next && act(() => getWorkspace().setRightAxis({yColumnId:next.value, trendEnabled:false, view:'measured'}))) rightY.focus();
  }, {signal});
  $('remove-right-axis').addEventListener('click', () => {
    if (act(() => getWorkspace().setRightAxis(null))) $('add-right-axis').focus();
  }, {signal});
  $('graph-form').addEventListener('submit', event => event.preventDefault(), {signal});
  return {
    beginLayoutTransition() { chart?.beginLayoutTransition(); },
    endLayoutTransition() { chart?.endLayoutTransition(); },
    render(state, model, visible, canEdit, focusedId) {
      const current = state?.graph ?? state?.defaultGraph ?? {xColumnId:'receivedAt', yColumnId:'', type:'line', connectGaps:false};
      const columns = graphColumns(state?.calculatedColumns ?? [], getWorkspace()?.getImportedColumns() ?? [], state?.context), key = JSON.stringify(columns);
      if (key !== columnsKey) {
        for (const select of [x, y, rightY]) select.replaceChildren(...columns.filter(c => select === x || !['receivedAt', 'sampleId'].includes(c.id)).map(c => {
          const option = document.createElement('option'); option.value = c.id; option.textContent = c.id === 'receivedAt' ? '경과 시간' : columnLabel(c); return option;
        }));
        columnsKey = key;
      }
      const dual = Boolean(current.right);
      x.value = current.xColumnId; y.value = current.yColumnId; rightY.value = current.right?.yColumnId ?? ''; gaps.checked = current.connectGaps;
      for (const input of [x, y, rightY, gaps]) input.disabled = !canEdit;
      for (const option of y.options) option.disabled = dual && option.value === current.right.yColumnId;
      for (const option of rightY.options) option.disabled = option.value === y.value;
      $('right-axis-controls').hidden = !dual; $('right-trend-result').hidden = !dual;
      $('graph-form').dataset.dual = String(dual);
      $('left-axis-label').textContent = dual ? '왼쪽 축' : getCopy().analysis.y;
      $('add-right-axis').hidden = dual;
      $('add-right-axis').disabled = !canEdit || ![...rightY.options].some(option => !option.disabled);
      $('add-right-axis').title = $('add-right-axis').disabled ? '추가할 다른 자료 열이 없습니다.' : '오른쪽 세로축 추가';
      $('remove-right-axis').disabled = !canEdit;
      for (const button of shapeButtons) {
        button.disabled = !canEdit || (button.dataset.graphType === 'line' && x.value !== 'receivedAt');
        button.title = button.dataset.graphType === 'line' && x.value !== 'receivedAt' ? '가로축을 경과 시간으로 선택해 주세요.' : '';
        button.setAttribute('aria-pressed', String(button.dataset.graphType === current.type));
      }
      $('graph-type-label').textContent = current.type === 'line' ? getCopy().analysis.line : getCopy().analysis.scatter;
      $('graph-gap-control').hidden = x.value !== 'receivedAt' || current.type !== 'line';
      const series = model ? [model, ...(model.right ? [model.right] : [])] : [];
      const colors = model ? analysisSeriesColors(getTheme(), model) : [];
      const summary = [];
      const horizontal = document.createElement('span');
      horizontal.textContent = '가로: ' + (x.selectedOptions[0]?.textContent ?? '—');
      summary.push(horizontal);
      for (const [index, item] of series.entries()) {
        const label = document.createElement('span'); label.className = 'axis-series-key';
        label.style.setProperty('--axis-series-color', colors[index].pointText ?? colors[index].point);
        label.textContent = (dual ? (index ? '오른쪽: ' : '왼쪽: ') : '') + item.yLabel;
        summary.push(label);
      }
      $('axis-summary').replaceChildren(...summary);
      $('graph-empty').hidden = series.some(item => item.points.length || item.excludedPoints.length);
      $('graph-empty').textContent = '현재 축에 표시할 유효한 자료가 없습니다.';
      $('graph-count').textContent = series.map(item => (dual ? item.yLabel + ' ' : '그래프 ') + item.points.length.toLocaleString() + '개' + (item.invalidCount ? ' · 값 없음 ' + item.invalidCount + '개' : '')).join(' / ');
      $('graph-count').hidden = !series.some(item => item.invalidCount || item.points.length !== item.includedCount);
      trend.render(model, canEdit); rightTrend.render(model?.right, canEdit);
      for (const [prefix, item] of [['', model], ['right-', model?.right]]) {
        $(prefix + 'trend-label').hidden = !dual && !item?.regression?.enabled;
      }
      if (visible && model) {
        chart ??= createAnalysisChart($('analysis-chart'), {onSelect, theme:getTheme()});
        root.style.setProperty('--sl-graph-point-text', colors[0].pointText ?? colors[0].point);
        chart.render(model, focusedId == null ? [] : [focusedId]);
        $('analysis-chart').setAttribute('aria-label', model.xLabel + ' 대 ' + series.map(item => item.yLabel + ', 그래프 ' + item.points.length + '개').join(' 및 ') + '. 제외 ' + model.excludedCount + '개. 점의 정보는 표에서도 확인할 수 있습니다.');
      }
    },
    reset() { chart?.dispose(); chart = null; columnsKey = null; showSettings(true); },
    dispose() { chart?.dispose(); },
  };
}
