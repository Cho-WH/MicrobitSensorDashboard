import { createAnalysisView } from '../../src/ui/analysis-view.js';
import { stableText } from './layout.js';

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
  const store = { getSnapshot: () => structuredClone(data),
    getState: () => ({ id: data.run.id, name: data.run.name, source: 'import', writable: true, temporary, status: 'clean', sampleCount: data.samples.length, eventCount: 0 }),
    saveWorkspace(value) { data.workspace = structuredClone(value); } };
  return { data, store, append };
}

export async function runUiTests(report = (_message) => {}) {
  const response = await fetch(new URL('../../lab.html', import.meta.url));
  check(response.ok, '분석 화면 HTML을 불러오지 못했습니다.');
  const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
  const screen = parsed.querySelector('[data-screen="analysis"]');
  check(screen, '실제 분석 화면을 찾지 못했습니다.');
  const previousFocus = document.activeElement, previousScroll = { x: scrollX, y: scrollY };
  const host = document.createElement('div'); host.id = 'browser-analysis-host';
  host.style.cssText = 'width:min(1200px,100%);margin:24px auto;--analysis-duration:0ms';
  const root = document.importNode(screen, true); root.hidden = false; host.append(root); document.body.append(host);
  const $ = selector => root.querySelector(selector);
  const failures = [], initialChartCount = Object.keys(globalThis.Chart.instances).length;
  let view;
  const click = async selector => {
    const target = $(selector); check(target, '화면 조작을 찾지 못했습니다: ' + selector);
    check(!target.disabled, '필요한 조작이 비활성화되어 있습니다: ' + selector);
    target.click(); await settle();
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

    scroller.scrollTop = 0; scroller.dispatchEvent(new Event('scroll')); await settle();
    await click('[data-select="1"]'); await click('#exclude-selection');
    $('#exclusion-reason').value = '장치를 옮긴 순간'; await click('#apply-selection-exclusion');
    check(same(view.getWorkspace().getState().exclusions, [{ sampleId: 1, reason: '장치를 옮긴 순간' }]), '제외 사유가 분석 작업에 보존되지 않았습니다.');
    check(same(first.data.samples, original), 'UI의 제외 작업이 원자료를 변경했습니다.');
    await click('[data-select="2"]'); await click('[data-select="3"]'); await click('#analyze-selection');
    check(same(view.getWorkspace().getState().appliedIds, [2, 3]), '선택 자료로 분석하는 UI가 다른 행을 포함했습니다.');
    await click('#trend-enabled');
    stableText(root,'.trend-metrics strong','.trend-metrics > div,.trend-result', ['0','-9,999.123 mg/초','-1.23456789e+100 mg/초'], '분석 통계 칸');
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
    view.reset(); view.open(first.store); await settle();
    check(view.getWorkspace().getState().reflection.answers.observation === text && same(view.getWorkspace().getReflectionModel(), evidence), '분석 화면 재생성에서 글 또는 보관 근거가 달라졌습니다.');
    report('실제 DOM · 명시적 자료 반영과 전체/지정 범위 차이·근거/글 재열기 보존');

    const undated = fixture({ count: 3, dated: false, temporary: true });
    view.reset(); view.open(undated.store); await settle();
    check($('#choose-range').disabled && $('#edit-analysis-range').disabled, '시각 없는 자료에서 시간 구간 선택을 허용했습니다.');
    const chart = globalThis.Chart.getChart($('#overview-chart'));
    check(chart.data.datasets[0].data.every((point, index) => point.x === index + 1 && point.elapsedSeconds === null), '시각 없는 자료에 가짜 경과 시간을 표시했습니다.');
    await click('#overview-table-toggle'); await click('[data-sample-id="1"]');
    stableText(root,'#point-values dd','#point-values > div,.point-actions', ['0','-9,999.123 µT','-1.23456789e+100 µT'], '선택한 자료 값');
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
    view?.dispose(); host.remove();
    previousFocus?.focus?.({ preventScroll: true }); scrollTo(previousScroll.x, previousScroll.y);
  }
  check(Object.keys(globalThis.Chart.instances).length === initialChartCount, '분석 화면 종료 후 Chart 인스턴스가 남았습니다.');
  report('실제 DOM · 분석 화면 종료 후 차트와 검사 DOM 정리');
}
