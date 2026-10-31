import { setMath } from './math-view.js';
// Adapted from Cho-WH/bme280 gay-lussac/ui/trend-controls.js at 59c5c149450f970bace2deaa183857c275595853.
import { trendReasons, trendSummary } from './trend-summary.js';
import { labDefaults } from './lab-copy.js';

export function createTrendControls(root, { act, signal, prefix = '', onEnabled, onView, getCopy = () => labDefaults }) {
  const $ = id => root.querySelector('#' + prefix + id), toggle = $('trend-enabled'), extended = $('trend-extended');
  toggle.addEventListener('change', () => act(() => onEnabled(toggle.checked)), { signal });
  extended.addEventListener('change', () => act(() => onView(extended.checked ? 'extended' : 'measured')), { signal });
  return {
    render(model, writable) {
      const enabled = model?.regression?.enabled === true, fit = enabled ? model.regression.result : null;
      toggle.checked = enabled; toggle.disabled = !writable || !model;
      extended.closest('label').hidden = !enabled;
      extended.checked = enabled && model?.view === 'extended'; extended.disabled = !writable || !enabled || fit?.xIntercept == null;
      extended.title = !enabled ? '추세선을 먼저 켜 주세요.' : fit?.xIntercept == null ? trendReasons[fit?.reason ?? fit?.xInterceptReason] ?? 'x절편을 계산할 수 없어요.' : '';
      const summary = trendSummary(model);
      $('trend-label').textContent = model ? model.yLabel + (fit?.count != null ? ' · ' + fit.count.toLocaleString() + '개' : '') : '';
      $('trend-empty').hidden = enabled && !fit?.reason;
      $('trend-empty').textContent = enabled ? summary.equation : getCopy().analysis.trendEmpty;
      $('trend-metrics').hidden = !summary.metrics.length;
      // The fit's sample count sits beside its channel name; leave enough room
      // for the three numeric statistics and their units below it.
      $('trend-metrics').replaceChildren(...summary.metrics.slice(1).map(item => {
        const card = document.createElement('div'), label = document.createElement('span'), value = document.createElement('strong');
        label.textContent = item.label;
        value.textContent = item.value; card.append(label, value); return card;
      }));
      $('trend-details').hidden = !enabled || Boolean(fit?.reason);
      if(enabled&&!fit?.reason)void setMath($('trend-equation'),summary.equationTex,summary.equation);else void setMath($('trend-equation'),null,summary.equation); $('trend-detail').textContent = summary.detail;
    },
  };
}
