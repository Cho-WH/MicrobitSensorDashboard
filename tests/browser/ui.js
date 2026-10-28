import { mountLabFixture, clickLabControl } from './lab-fixture.js';
import { createAnalysisView } from '../../src/ui/analysis-view.js';
import { createReflectionPrint } from '../../src/ui/reflection-view.js';
import { readVisualTheme } from '../../src/ui/visual-theme.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

// Deliberately memory-backed: these checks exercise the actual DOM and Chart.js.
// IndexedDB and Web Locks are covered separately by storage.js.
function fixture({ count = 1500, dated = true, temporary = false } = {}) {
  const channels = ['a', 'b', 'c', 'strength'].map((id, index) => ({ id, name: ['가로 성분', '세로 성분', '높이 성분', '크기'][index], unit: 'µT', calculable: true }));
  const context = { sensor: { id: 'ui-fixture', name: '네 항목 검사용 센서' }, activity: null, channels,
    defaultGraph: { xColumnId: dated ? 'receivedAt' : 'sampleId', yColumnId: 'strength', type: dated ? 'line' : 'scatter' }, analysisTemplates: [] };
  const data = { run: { id: crypto.randomUUID(), name: 'DOM 검사용 자료', context }, samples: [], events: [], workspace: null };
  function append(amount) {
    const start = data.samples.length;
    for (let index = start; index < start + amount; index++) data.samples.push({ runId: data.run.id, sampleId: index + 1,
      receivedAt: dated ? 1700000000000 + index * 100 : null,
      values: { a: index + 1, b: index + 2, c: index + 3, strength: 10 + (index + 1) * 2 },
      validity: { a: 'valid', b: 'valid', c: 'valid', strength: 'valid' } });
  }
  append(count);
  const store = { getSnapshot: () => structuredClone(data), getRun: () => structuredClone(data.run),
    setActiveSource(sourceId) { data.workspace.activeSourceId = sourceId; data.workspace.envelopeRevision++; },
    getState: () => ({ id: data.run.id, name: data.run.name, source: 'import', writable: true, temporary, status: 'clean', sampleCount: data.samples.length, eventCount: 0 }),
    saveWorkspace(sourceId, value) { data.workspace = {runId:data.run.id, envelopeRevision:(data.workspace?.envelopeRevision ?? 0)+1, activeSourceId:sourceId, bySource:{...data.workspace?.bySource,[sourceId]:structuredClone(value)}}; } };
  return { data, store, append };
}

export async function runUiTests(report = (_message) => {}) {
  const previousFocus = document.activeElement, previousScroll = { x: scrollX, y: scrollY };
  const lab = await mountLabFixture({component:true}), {host} = lab;
  host.style.setProperty('--analysis-duration','0ms');
  lab.showScreen('analysis');
  const root = host.querySelector('[data-screen="analysis"]');
  const $ = selector => root.querySelector(selector);
  const failures = [], initialChartCount = Object.keys(globalThis.Chart.instances).length;
  const presentation = chart => ({
    font:chart.options.scales.x.title.font?.family,
    axis:chart.options.scales.x.ticks.color, grid:chart.options.scales.x.grid.color,
    series:chart.data.datasets.map((dataset,index) => ({
      label:dataset.label, data:structuredClone(dataset.data), dash:dataset.borderDash ?? [],
      color:dataset.borderColor, points:chart.getDatasetMeta(index).data.map(point => ({
        fill:point.options.backgroundColor, border:point.options.borderColor, shape:point.options.pointStyle,
      })),
    })),
  });
  let exported;
  const exportObserver = {id:'analysis-export-parity', beforeDestroy(chart) {
    if (chart.data.datasets[0]?.seriesModel?.xColumnId === 'receivedAt') {
      check(chart.scales.x.options.title.text === '경과 시간' && chart.scales.x.ticks.every(tick => /[초분시]/.test(tick.label)),
        '출력 그래프가 경과 시간과 공통 단위 표기를 사용하지 않습니다.');
    }
    if (!chart.canvas.isConnected) exported = presentation(chart);
  }};
  globalThis.Chart.register(exportObserver);
  let view;
  const click = async selector => {
    const target = $(selector); check(target, '화면 조작을 찾지 못했습니다: ' + selector);
    check(!target.disabled, '필요한 조작이 비활성화되어 있습니다: ' + selector);
    clickLabControl(host,target); await settle();
    check(!$('#analysis-feedback').textContent, $('#analysis-feedback').textContent);
  };
  try {
    view = createAnalysisView(root, { onError: message => failures.push(message) });
    const first = fixture(), original = structuredClone(first.data.samples);
    view.open(first.store); await settle();
    check(!failures.length, failures.join('\n'));
    await click('#overview-table-toggle');
    const scroller = $('#raw-scroll');
    check(scroller.clientHeight > 0 && scroller.clientHeight < 1500 * 32, '가상 표 스크롤 영역의 실제 높이가 잘못되었습니다.');
    check($('#raw-rows').querySelectorAll('.sample-row').length < 100, '1,500개 원자료를 모두 DOM 행으로 생성했습니다.');
    const columns = [...root.querySelectorAll('thead [data-sort]')].map(button => button.dataset.sort);
    check(['a', 'b', 'c', 'strength'].every(id => columns.includes(id)), '네 채널 중 표에서 누락된 항목이 있습니다.');
    scroller.scrollTop = scroller.scrollHeight; scroller.dispatchEvent(new Event('scroll')); await settle();
    check(Boolean($('#raw-rows [data-sample-id="1500"]')), '가상 표의 마지막 원자료를 표시하지 못했습니다.');
    check($('#raw-rows').querySelectorAll('.sample-row').length < 100, '스크롤 후 가상 표 행 수가 제한을 벗어났습니다.');
    report('실제 DOM · 네 채널 표와 1,500행 가상 스크롤');

    await click('#choose-range');
    for (const [id,value] of [['time-range-start','0.1'],['time-range-end','0.3']]) {
      $('#' + id).value = value; $('#' + id).dispatchEvent(new Event('input',{bubbles:true}));
    }
    check(view.getWorkspace().getState().appliedIds.length === 1500, '구간 초안이 적용 전에 분석 범위를 변경했습니다.');
    await click('#apply-time-range');
    check(same(view.getWorkspace().getState().appliedIds,[2,3,4]), '구간 적용이 선택한 시간 밖의 자료를 포함했습니다.');
    await click('#undo-analysis');
    check(view.getWorkspace().getState().appliedIds.length === 1500, '구간 적용을 되돌려도 이전 범위가 복원되지 않았습니다.');
    await click('#tab-overview');

    scroller.scrollTop = 0; scroller.dispatchEvent(new Event('scroll')); await settle();
    await click('[data-select="1"]'); await click('#exclude-selection');
    $('#exclusion-reason').value = '장치를 옮긴 순간'; await click('#apply-selection-exclusion');
    check(same(view.getWorkspace().getState().exclusions, [{ sampleId: 1, reason: '장치를 옮긴 순간' }]), '제외 사유가 분석 작업에 보존되지 않았습니다.');
    check(same(first.data.samples, original), 'UI의 제외 작업이 원자료를 변경했습니다.');
    check(!$('#scope-detail').hidden, '분석에서 제외한 자료 안내가 숨겨졌습니다.');
    await click('[data-select="1"]'); await click('#restore-selection');
    check(view.getWorkspace().getState().exclusions.length === 0, '제외한 자료를 다시 포함할 수 없습니다.');
    check($('#scope-detail').hidden, '제외를 복원한 뒤 0개 안내가 남았습니다.');
    await click('#undo-analysis');
    check(view.getWorkspace().getState().exclusions[0]?.reason === '장치를 옮긴 순간', '복원 취소에서 이전 제외 사유가 사라졌습니다.');
    if (!$('#clear-selection').disabled) await click('#clear-selection');
    await click('[data-select="2"]'); await click('[data-select="3"]'); await click('#analyze-selection');
    check(same(view.getWorkspace().getState().appliedIds, [2, 3]), '선택 자료로 분석하는 UI가 다른 행을 포함했습니다.');
    const beforeLayout = structuredClone(first.data);
    for (const mode of ['graph','table','split']) await click(`[data-relationship-mode="${mode}"]`);
    check(same(first.data,beforeLayout), '표/그래프 보기 전환이 저장할 자료나 분석 작업을 변경했습니다.');
    await click('#trend-enabled');
    await click('#trend-extended');
    check(view.getWorkspace().getGraphData().trend.extension.length>0, '추세선 연장 자료를 만들지 못했습니다.');
    await click('#use-graph-for-reflection');
    const text = '가로축 값이 증가할수록 크기도 증가했다.';
    $('#reflection-observation').value = text;
    $('#reflection-observation').dispatchEvent(new Event('input', { bubbles: true }));
    check(view.flush(), '해석 글의 변경을 확정하지 못했습니다.');
    const evidence = structuredClone(view.getWorkspace().getReflectionModel());
    const details = $('#reflection-zero-meaning');
    check(!details.hidden && details.querySelector('summary')?.textContent.trim() && details.querySelector('p')?.textContent.trim(), 'x절편 안내가 빈 세부정보 조작으로 표시됩니다.');
    report('실제 DOM · 행 선택·제외 사유·지정 분석·추세선·해석 글');

    first.append(250); view.updateStatus();
    check(view.getWorkspace().getLoadedCount() === 1500 && !$('#apply-new-data').hidden, '새 수신을 명시적 반영 없이 분석 자료에 포함했습니다.');
    await click('#tab-relationship'); await click('#apply-new-data');
    check(view.getWorkspace().getLoadedCount() === 1750 && same(view.getWorkspace().getState().appliedIds, [2, 3]), '새 자료 반영이 지정 분석 범위를 변경했습니다.');
    check(same(view.getWorkspace().getReflectionModel(), evidence), '새 자료 반영이 보관 근거를 변경했습니다.');
    check(view.getWorkspace().getState().reflection.answers.observation === text, '새 자료 반영에서 해석 글이 사라졌습니다.');
    await click('#tab-overview'); await click('#use-all-data');
    first.append(10); view.updateStatus(); await click('#apply-new-data');
    check(view.getWorkspace().getState().appliedIds.length === 1760 && view.getWorkspace().getSummary().includedCount === 1759, '전체 분석 모드가 새 자료를 포함하거나 이전 제외를 유지하지 못했습니다.');
    check(same(view.getWorkspace().getReflectionModel(), evidence), '전체 분석 전환이 보관 근거를 덮어썼습니다.');

    // Offscreen PNG must preserve the displayed model and visual encoding,
    // including excluded points and the saved (possibly older) evidence model.
    const liveGraph = globalThis.Chart.getChart($('#analysis-chart'));
    const screenPresentation = presentation(liveGraph), beforeExport = structuredClone(first.data);
    const png = view.exportPng('분석 출력');
    check(same(exported,screenPresentation), 'PNG의 자료·제외·추세선·글꼴·축 색이 화면 그래프와 다릅니다.');
    {
      const overview = globalThis.Chart.getChart($('#overview-chart'));
      check(liveGraph.data.datasets[0].borderColor === overview.data.datasets.find(dataset => dataset.label === liveGraph.options.scales.y.title.text)?.borderColor,
        '관계 그래프가 원자료 보기의 세로축 채널 색을 유지하지 못했습니다.');
    }
    const image = new Image(); image.src = png; await image.decode();
    const output = document.createElement('canvas'); output.width = image.width; output.height = image.height;
    const ctx = output.getContext('2d'); ctx.drawImage(image,0,0);
    check(image.width > 0 && image.height > 0 && same([...ctx.getImageData(0,0,1,1).data],[255,255,255,255]),
      'PNG가 비어 있거나 불투명한 흰 바탕을 유지하지 못했습니다.');
    await click('#tab-interpretation');
    const evidencePresentation = presentation(globalThis.Chart.getChart($('#reflection-chart')));
    view.exportPng('보관 근거');
    check(same(exported,evidencePresentation), '해석 화면 PNG가 보관 근거 대신 현재 분석 그래프를 내보냈습니다.');
    const reflection = view.getWorkspace().getState().reflection;
    const sheet = createReflectionPrint({name:'인쇄 검토',model:evidence,evidence:reflection.evidence,
      answers:reflection.answers,origin:first.data.samples[0].receivedAt,
      theme:readVisualTheme(root,first.data.run.context.channels)});
    check(same(exported,evidencePresentation) && sheet.textContent.includes(text), '인쇄 그래프 또는 해석 글이 보관한 내용과 다릅니다.');
    check(same(first.data,beforeExport), 'PNG·인쇄 과정에서 저장할 자료나 근거가 변경되었습니다.');
    report('실제 Canvas · 화면/PNG/인쇄의 자료·색·추세선 일치, 흰 출력 바탕과 보관 근거 유지');

    view.reset(); view.open(first.store); await settle();
    check(view.getWorkspace().getState().reflection.answers.observation === text && same(view.getWorkspace().getReflectionModel(), evidence), '분석 화면 재생성에서 글 또는 보관 근거가 달라졌습니다.');
    report('실제 DOM · 명시적 자료 반영과 전체/지정 범위 차이·근거/글 재열기 보존');

    const dual=fixture({count:10});
    view.reset(); view.open(dual.store); await settle(); await click('#tab-relationship');
    check($('#right-axis-controls').hidden && !view.getWorkspace().getState().graph?.right,'초기 화면에 오른쪽 축이 미리 추가되었습니다.');
    await click('#add-right-axis');
    check(!$('#right-axis-controls').hidden && $('#add-right-axis').hidden && document.activeElement===$('#graph-y-right'),'추가 축의 개수 제한 또는 초점 이동이 잘못되었습니다.');
    const dualChart=globalThis.Chart.getChart($('#analysis-chart'));
    check(dualChart.scales.x.ticks.every(tick => /초$/.test(tick.label) && !tick.label.includes('시')),
      '짧은 경과 시간 눈금에서 불필요한 시간 단위를 표시합니다.');
    check(dualChart.scales.x.options.title.text === '경과 시간', '축 제목이 경과 시간이 아닙니다.');
    check(dualChart.data.datasets[0].data[0].x === 0, '시간 그래프가 첫 수신부터의 경과 초로 표시되지 않습니다.');
    const timedSeries = dualChart.data.datasets[0], timedPoint = timedSeries.data.find(point => point.sampleId);
    const tooltip = dualChart.options.plugins.tooltip.callbacks.label({dataset:timedSeries,raw:timedPoint});
    check(tooltip.some(line => /\d{2}:\d{2}:\d{2}\.\d{3}/.test(line)), '상세 수신 시각의 정밀도가 사라졌습니다.');
    check(dualChart.scales.yRight && dualChart.data.datasets.filter(d=>d.legendSeries).length===2,'오른쪽 축에 별도 자료가 그려지지 않았습니다.');
    const pick=async(selector,value)=>{const input=$(selector);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));await settle();};
    await pick('#graph-y-right','b');
    await click('#right-trend-enabled'); await click('#right-trend-extended');
    check(!$('#trend-enabled').checked && view.getWorkspace().getGraphData().right.trend.intercept.length===1,'오른쪽 추세선이 왼쪽 상태를 변경하거나 연장되지 않았습니다.');
    await click('#trend-enabled');
    const menu=$('#graph-shape-menu'); await click('#graph-shape-menu summary');
    await click('[data-graph-type="scatter"]');
    check(!menu.open && document.activeElement===menu.querySelector('summary') && view.getWorkspace().getState().graph.type==='scatter','그래프 모양 선택 후 적용·메뉴 닫힘·초점 복귀가 잘못되었습니다.');
    const beforeFold=structuredClone(dual.data), axesBeforeFold=structuredClone(view.getWorkspace().getState());
    await click('#toggle-axis-settings');
    check($('#axis-settings-panel').inert && $('#toggle-axis-settings').getAttribute('aria-expanded')==='false', '접힌 축 설정이 키보드 조작에서 제외되지 않았습니다.');
    check(!$('#axis-summary').hidden && $('#axis-summary').textContent.includes('세로 성분'), '접힌 범례에서 비교 축을 확인할 수 없습니다.');
    await click('#tab-overview'); await click('#tab-relationship');
    check($('#axis-settings-panel').inert, '탭 이동이 접힌 축 설정을 초기화했습니다.');
    await click('#toggle-axis-settings');
    check(!$('#axis-settings-panel').inert && same(view.getWorkspace().getState(),axesBeforeFold) && same(dual.data,beforeFold),
      '축 설정을 접고 펼치는 동작이 분석 상태나 저장 자료를 바꿨습니다.');
    await click('#graph-shape-menu summary');
    menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    check(!menu.open,'Escape로 그래프 모양 메뉴를 닫지 못했습니다.');
    const dualPresentation=presentation(dualChart); view.exportPng('두 세로축');
    check(same(exported,dualPresentation),'두 세로축 PNG가 화면 자료·추세선과 다릅니다.');
    await click('#use-graph-for-reflection');
    check($('#reflection-equation').textContent.includes('세로 성분') && $('#reflection-equation').textContent.includes('크기'),'해석 근거에서 한 축의 추세선이 누락되었습니다.');
    await click('#reflection-back'); await click('#remove-right-axis');
    check($('#right-axis-controls').hidden && !dualChart.scales.yRight && !view.getWorkspace().getState().graph.right && document.activeElement===$('#add-right-axis'),'오른쪽 축 제거 후 차트·선택 UI·초점이 복원되지 않았습니다.');
    await click('#undo-analysis');
    check(view.getWorkspace().getState().graph.right.yColumnId==='b' && !$('#right-axis-controls').hidden,'되돌리기로 오른쪽 축 설정을 복원하지 못했습니다.');
    view.reset(); view.open(dual.store); await settle(); await click('#tab-relationship');
    check($('#graph-y-right').value==='b' && $('#right-trend-enabled').checked && $('#right-trend-extended').checked,'다시 열었을 때 오른쪽 축과 추세선 설정이 사라졌습니다.');
    check(dual.data.samples.every((sample,index)=>sample.values.b===index+2),'축 조작이 원자료 값을 변경했습니다.');
    for(const channel of dual.data.run.context.channels) { channel.quantity='magnetic-flux-density'; channel.quantityLabel='자기장'; }
    view.reset(); view.open(dual.store); await settle(); await click('#tab-relationship');
    const shared=globalThis.Chart.getChart($('#analysis-chart'));
    check(!shared.scales.yRight && shared.data.datasets.every(d=>d.yAxisID==='y') && shared.scales.y.options.title.text==='자기장 (µT)','동일 물리량·단위의 두 방향/크기가 서로 다른 스케일로 표시됩니다.');
    report('실제 DOM/Canvas · 오른쪽 축 추가·제거·독립 추세선·메뉴·되돌리기·재열기·출력·동일 물리량 공유 스케일');

    const missing = fixture({ count: 6 });
    missing.data.samples[0].values.b = null; missing.data.samples[0].validity.b = 'missing';
    view.reset(); view.open(missing.store); await settle(); await click('#tab-relationship');
    check($('#graph-count').hidden && $('#scope-detail').hidden && !$('#analysis-message').textContent,
      '범위와 같은 그래프 개수 또는 제외 0개를 중복 안내합니다.');
    await click('#add-right-axis'); await pick('#graph-y-right','b');
    check(!$('#graph-count').hidden && $('#graph-count').textContent.includes('값 없음 1개'),
      '두 축의 유효 자료 수가 다른데 결측 안내를 숨겼습니다.');
    check(view.getWorkspace().getGraphData().points.length===6 && view.getWorkspace().getGraphData().right.points.length===5,
      '안내 정리가 그래프에 포함되는 자료를 바꿨습니다.');
    await click('#remove-right-axis');
    check($('#graph-count').hidden, '결측이 없는 축으로 돌아온 뒤 중복 개수가 남았습니다.');
    report('분석 범위 안내 · 제외 복원·중복 개수 생략·축별 결측 안내 유지');

    const offset = fixture({count:4});
    offset.data.run.timeOrigin = offset.data.samples[0].receivedAt - 60125;
    view.reset(); view.open(offset.store); await settle();
    const offsetOverview = globalThis.Chart.getChart($('#overview-chart'));
    check(offsetOverview.data.datasets[0].data[0].x === 60.125, '복원한 기준이 원자료 그래프에서 사라졌습니다.');
    await click('#choose-range');
    check($('#time-range-start').valueAsNumber === 60.125, '구간 선택이 첫 행을 0초로 바꿨습니다.');
    await click('#cancel-time-range'); await click('#tab-relationship');
    check(globalThis.Chart.getChart($('#analysis-chart')).data.datasets[0].data[0].x === 60.125, '관계 그래프가 복원한 경과 시간을 사용하지 않습니다.');
    await click('#use-graph-for-reflection');
    check(globalThis.Chart.getChart($('#reflection-chart')).data.datasets[0].data[0].x === 60.125, '보관 근거에서 원래 경과 시간이 사라졌습니다.');
    report('복원한 경과 시간 기준 · 원자료/관계/해석 그래프와 구간 선택 일치');

    const undated = fixture({ count: 3, dated: false, temporary: true });
    view.reset(); view.open(undated.store); await settle();
    check($('#choose-range').disabled && $('#edit-analysis-range').disabled, '시각 없는 자료에서 시간 구간 선택을 허용했습니다.');
    const chart = globalThis.Chart.getChart($('#overview-chart'));
    check(chart.data.datasets[0].data.every((point, index) => point.x === index + 1 && point.elapsedSeconds === null), '시각 없는 자료에 가짜 경과 시간을 표시했습니다.');
    await click('#overview-table-toggle'); await click('[data-sample-id="1"]');
    check($('#point-time').textContent === '시각 정보 없음' && $('#point-title').textContent.startsWith('자료 1'), '시각 없는 자료를 1970년 또는 경과 시간 0초로 표시했습니다.');
    check(undated.data.samples.every(sample => sample.receivedAt === null), '화면에서 누락 시각을 임의로 채웠습니다.');
    report('실제 DOM · 시각 없는 파일의 자료 번호 축·시각 안내·시간 구간 차단');
    await click('#tab-interpretation');
    const temporaryStatus = $('#reflection-save-status');
    check(temporaryStatus.dataset.state === 'temporary' && temporaryStatus.textContent.includes('메모리에만') && temporaryStatus.textContent.includes('JSON 파일'),
      '임시 분석이 브라우저에 영구 저장된 것처럼 표시되거나 파일 보관 안내가 없습니다.');
    $('#reflection-observation').value = '파일로 보관할 임시 분석';
    $('#reflection-observation').dispatchEvent(new Event('input', { bubbles: true }));
    check(view.flush() && temporaryStatus.dataset.state === 'temporary' && temporaryStatus.textContent.includes('메모리에만'),
      '해석 글을 반영한 뒤 임시 자료를 영구 저장으로 표시했습니다.');
    report('실제 DOM · 임시 분석은 글 반영 후에도 메모리 보관·JSON 파일 저장 안내 유지');
    check(!failures.length, failures.join('\n'));
  } finally {
    view?.dispose(); lab.dispose();
    globalThis.Chart.unregister(exportObserver);
    previousFocus?.focus?.({ preventScroll: true }); scrollTo(previousScroll.x, previousScroll.y);
  }
  check(Object.keys(globalThis.Chart.instances).length === initialChartCount, '분석 화면 종료 후 Chart 인스턴스가 남았습니다.');
  report('실제 DOM · 분석 화면 종료 후 차트와 검사 DOM 정리');
}
