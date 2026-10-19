import test from 'node:test';
import assert from 'node:assert/strict';
import { createChartView } from '../../src/ui/chart-view.js';
import { tableColumns } from '../../src/ui/table-columns.js';
import { trendSummary } from '../../src/ui/trend-summary.js';
import { fitGraph } from '../../src/analysis/regression.js';

test('chart uses time gaps rather than old segment IDs; connecting gaps never fills missing values', () => {
  const original = globalThis.Chart;
  let chart;
  globalThis.Chart = class {
    constructor(_canvas, config) { Object.assign(this, config); chart = this; }
    update() {} destroy() {}
  };
  try {
    const view = createChartView({}, {context:{channels:[{id:'a',name:'A',unit:'µT'},{id:'b',name:'B',unit:'µT'}]}});
    const points = [0, 100, 6100, 6200, 6000].map((ms, i) => ({ receivedAt: ms, monotonicAt: ms,
      segmentId: i, values: {a: 20 + i, b: 1000},
      validity: { a: i === 3 ? 'out-of-range' : 'valid', b: 'valid' } }));
    view.render(points, 6200, { range: 'all' });
    assert.deepEqual(chart.data.datasets[0].data.map(p => p.y), [20, 21, null, 22, null, null, 24]);
    view.render(points, 6200, { range: 'all', connectGaps: true });
    assert.deepEqual(chart.data.datasets[0].data.map(p => p.y), [20, 21, 22, null, null, 24]);
    view.render(points.slice(0, 3), 6200);
    assert.deepEqual(chart.data.datasets[0].data.map(p => p.x), [-6.2, -6.1, -0.1, -0.1]);
    // Recent-window coordinates must not reset the elapsed-time tooltip origin.
    for (const range of ['recent', 'all']) {
      view.render(points.slice(0, 2), 6200, { range, origin: -59500 });
      const title = chart.options.plugins.tooltip.callbacks.title;
      assert.equal(title([{ raw: chart.data.datasets[0].data[0] }]), '1분 0초');
      assert.equal(title([{ raw: chart.data.datasets[1].data[1] }]), '1분 0초');
      view.render(points.slice(0, 1), 6200, { range, origin: -59499 });
      assert.equal(title([{ raw: chart.data.datasets[0].data[0] }]), '0분 59초');
    }
    view.dispose();
  } finally { globalThis.Chart = original; }
});

test('table column ordering supports arbitrary channel counts and preserves compact axis order', () => {
  const channels = ['x', 'y', 'z', 'magnitude'].map(id => ({ id, name: id, unit: 'µT' }));
  const calculated = [{ id: 'calc-doubled', name: '두 배', unit: 'µT' }];
  assert.deepEqual(tableColumns(calculated, null, [], channels).map(c => c.id), ['sampleId', 'x', 'y', 'z', 'magnitude', 'usage', 'receivedAt', 'note', 'calc-doubled']);
  assert.deepEqual(tableColumns(calculated, ['calc-doubled', 'z', 'z'], [], channels).map(c => c.id), ['sampleId', 'calc-doubled', 'z', 'usage']);
  assert.deepEqual(tableColumns([], ['sampleId', 'z'], [], channels).map(c => c.id), ['sampleId', 'z', 'usage']);
  assert.equal(channels.length, 4);
});

test('time regression captions express slope per second and undefined R squared explicitly', () => {
  const model = { xColumnId: 'receivedAt', yColumnId: 'light', xLabel: '수신 시각', yLabel: '밝기', xUnit: '초', yUnit: '%',
    points: [0, 1, 2].map(i => ({ x: 1700000000000 + i * 1000, y: 8 })) };
  const summary = trendSummary({ ...model, regression: fitGraph(model, 1) });
  assert.match(summary.equation, /경과 시간\(초\)/);
  assert.equal(summary.metrics.find(m => m.label === '기울기').value, '0 %/초');
  assert.equal(summary.metrics.find(m => m.label === 'R²').value, '—');
  assert.match(summary.detail, /R²를 정의할 수 없습니다/);
});

test('overview uses sample numbers when timestamps are missing and omits untimed rows from time plots', () => {
  const original = globalThis.Chart;
  let chart;
  globalThis.Chart = class {
    constructor(_canvas, config) { Object.assign(this, config); chart = this; }
    update() {} destroy() {}
  };
  try {
    const view = createChartView({}, { context: { channels: [{ id: 'light', name: '밝기' }] } });
    const samples = [1, 2, 3].map(sampleId => ({ sampleId, receivedAt: null, values: { light: sampleId * 2 }, validity: { light: 'valid' } }));
    view.render(samples, 0, { range: 'all' });
    assert.deepEqual(chart.data.datasets[0].data.map(p => [p.x, p.y, p.elapsedSeconds]), [[1, 2, null], [2, 4, null], [3, 6, null]]);
    assert.equal(view.timeGeometry(), null); assert.match(chart.options.scales.x.title.text, /자료 번호/);
    assert.equal(chart.options.plugins.tooltip.callbacks.title([{ raw: chart.data.datasets[0].data[0] }]), '자료 1');
    samples[1].receivedAt = 1700000000000; samples[2].receivedAt = 1700000001000;
    view.render(samples, 0, { range: 'all' });
    assert.deepEqual(chart.data.datasets[0].data.map(p => [p.x, p.y]), [[0, 4], [1, 6]]);
    assert.equal(samples[0].receivedAt, null);
    view.dispose();
  } finally { globalThis.Chart = original; }
});
