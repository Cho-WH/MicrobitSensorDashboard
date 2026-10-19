// Adapted from Cho-WH/bme280 gay-lussac/ui/analysis-graph.js at 59c5c149450f970bace2deaa183857c275595853.
import { graphColumns } from '../domain/contracts.js';
import { columnLabel } from '../analysis/calculations.js';
import { createAnalysisChart } from './chart-view.js';
import { createTrendControls } from './trend-controls.js';

export function createAnalysisGraph(root, { getWorkspace, act, onSelect, signal }) {
  const $ = id => root.querySelector('#' + id), x = $('graph-x'), y = $('graph-y'), type = $('graph-type'), gaps = $('graph-gaps');
  let chart = null, columnsKey = null;
  const trend = createTrendControls(root, { getWorkspace, act, signal });
  function change() {
    if (x.value !== 'receivedAt') type.value = 'scatter';
    act(() => getWorkspace().setGraph({ xColumnId: x.value, yColumnId: y.value, type: type.value, connectGaps: gaps.checked }));
  }
  for (const input of [x, y, type, gaps]) input.addEventListener('change', change, { signal });
  $('graph-form').addEventListener('submit', event => event.preventDefault(), { signal });
  return {
    beginLayoutTransition() { chart?.beginLayoutTransition(); },
    endLayoutTransition() { chart?.endLayoutTransition(); },
    render(state, model, visible, canEdit, focusedId) {
      const current = state?.graph ?? state?.defaultGraph ?? { xColumnId: 'receivedAt', yColumnId: '', type: 'line', connectGaps: false };
      const columns = graphColumns(state?.calculatedColumns ?? [], getWorkspace()?.getImportedColumns() ?? [], state?.context), key = JSON.stringify(columns);
      if (key !== columnsKey) {
        for (const select of [x, y]) select.replaceChildren(...columns.filter(c => select === x || !['receivedAt', 'sampleId'].includes(c.id)).map(c => {
          const option = document.createElement('option'); option.value = c.id; option.textContent = columnLabel(c); return option;
        }));
        columnsKey = key;
      }
      x.value = current.xColumnId; y.value = current.yColumnId; type.value = current.type; gaps.checked = current.connectGaps;
      for (const input of [x, y, type, gaps]) input.disabled = !canEdit;
      type.querySelector('[value=line]').disabled = x.value !== 'receivedAt';
      $('graph-gap-control').hidden = x.value !== 'receivedAt' || type.value !== 'line';
      $('graph-empty').hidden = Boolean(model?.points.length || model?.excludedPoints.length);
      $('graph-empty').textContent = '현재 축에 표시할 유효한 자료가 없습니다.';
      $('graph-count').textContent = model ? '그래프 ' + model.points.length.toLocaleString() + '개' + (model.invalidCount ? ' · 현재 축의 값 없음 ' + model.invalidCount + '개' : '') : '';
      trend.render(model, canEdit);
      if (visible && model) {
        chart ??= createAnalysisChart($('analysis-chart'), { onSelect });
        chart.render(model, focusedId == null ? [] : [focusedId]);
        $('analysis-chart').setAttribute('aria-label', model.xLabel + ' 대 ' + model.yLabel + '. 그래프 ' + model.points.length + '개, 제외 ' + model.excludedCount + '개. 점의 정보는 표에서도 확인할 수 있습니다.');
      }
    },
    reset() { chart?.dispose(); chart = null; columnsKey = null; },
    dispose() { chart?.dispose(); },
  };
}
