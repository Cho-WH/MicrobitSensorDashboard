// Adapted from Cho-WH/bme280 gay-lussac/ui/reflection-view.js at 59c5c149450f970bace2deaa183857c275595853.
import { ANSWER_LIMIT, REFLECTION_QUESTIONS, evidenceKey } from '../analysis/reflection.js';
import { graphColumns, CALCULATION_OPERATORS } from '../domain/contracts.js';
import { columnLabel, formatCalculated } from '../analysis/calculations.js';
import { createAnalysisChart, exportAnalysisPng } from './chart-view.js';
import { timeBounds } from '../analysis/scope.js';
import { trendSummary } from './trend-summary.js';
import { getLabCopy, formatCopy } from './lab-copy.js';

const number = value => value.toLocaleString('ko-KR');
const node = (tag, text, className) => {
  const element = document.createElement(tag); if (text != null) element.textContent = text;
  if (className) element.className = className; return element;
};
export function evidenceDescription(evidence, model, origin) {
  if (!evidence || !model) return '';
  const range = evidence.analysisRange;
  const scope = range ? `${formatCalculated((range.startAt - origin) / 1000)}–${formatCalculated((range.endAt - origin) / 1000)}초`
    : evidence.appliedScope === 'all' ? '가져온 시점의 전체 자료' : '선택한 자료';
  return `${scope} · 분석 포함 ${number(model.includedCount)}개 · 제외 ${number(model.excludedCount)}개`;
}

// An explicit print document keeps the student's saved evidence out of live analysis controls.
export function createReflectionPrint({ name, model, evidence, answers, origin, questions = REFLECTION_QUESTIONS, theme = null }) {
  const sheet = node('article', null, 'reflection-print'); sheet.id = 'reflection-print';
  sheet.append(node('p', '센서 실험 · 탐구 기록', 'print-eyebrow'), node('h1', name));
  if (model) {
    sheet.append(node('p', `${model.xLabel} → ${model.yLabel}`), node('p', evidenceDescription(evidence, model, origin), 'print-meta'));
    const image = document.createElement('img'); image.alt = '설명의 근거로 가져온 그래프'; image.src = exportAnalysisPng(model, { name, theme });
    sheet.append(image);
  } else sheet.append(node('p', '아직 근거 그래프를 가져오지 않았습니다.'));
  for (const q of questions) {
    const section = node('section'); section.append(node('h2', q.title), node('p', answers[q.id] || '아직 작성하지 않았습니다.')); sheet.append(section);
  }
  return sheet;
}

export function createReflectionView(root, { getWorkspace, getStoreState, act, onBack, signal, getTheme = () => null, getContext = () => getWorkspace()?.getState().context }) {
  let copy = getLabCopy(null);
  let attachedContext = null;
  const $ = id => root.querySelector('#' + id), inputs = new Map();
  let chart = null, chartKey = null, attachedWorkspace = null, model = null, evidence = null, origin = 0, printSheet = null, printing = false;
  let questions = REFLECTION_QUESTIONS;
  const hints = { analysis: $('reflection-analysis-hints'), extension: $('reflection-extension-hint'), zero: $('reflection-zero-meaning') };
  function buildQuestions(nextQuestions) {
    const placeholders = {
      observation: copy.reflection.observationPlaceholder,
      reasoning: copy.reflection.reasoningPlaceholder,
      limitations: copy.reflection.limitationsPlaceholder,
    };
    questions = nextQuestions; inputs.clear(); $('reflection-questions').replaceChildren();
  for (const [index, q] of questions.entries()) {
    const card = node('section', null, 'reflection-question');
    const heading = node('div', null, 'question-heading'), label = node('label'); label.htmlFor = 'reflection-' + q.id;
    label.append(node('strong', q.title), node('span', q.question));
    heading.append(node('span', String(index + 1).padStart(2, '0'), 'question-number'), label);
    const input = document.createElement('textarea'); input.id = 'reflection-' + q.id; input.name = q.id;
    input.rows = 3; input.maxLength = ANSWER_LIMIT; input.placeholder = q.placeholder ?? placeholders[q.id] ?? copy.reflection.placeholder;
    input.setAttribute('aria-describedby', 'reflection-' + q.id + '-hint');
    const footer = node('div', null, 'question-footer'), hint = node('span', copy.reflection.answerHint); hint.id = input.id + '-hint';
    const count = node('span', '0 / ' + number(ANSWER_LIMIT), 'answer-count'); count.setAttribute('aria-hidden', 'true');
    footer.append(hint, count); card.append(heading, input, footer); inputs.set(q.id, { input, count, card });
    input.addEventListener('input', () => { syncCounts(); flush(); }, { signal });
    $('reflection-questions').append(card);
  }
  const lastCard = [...inputs.values()].at(-1)?.card;
  (inputs.get('reasoning')?.card ?? lastCard)?.append(hints.analysis);
  (inputs.get('limitations')?.card ?? lastCard)?.append(hints.extension, hints.zero);
  hints.zero.replaceChildren(node('summary', copy.reflection.zeroTitle),
    node('p', copy.reflection.zeroHint));
  }
  buildQuestions(questions);
  function syncCounts() {
    let completed = 0;
    for (const { input, count, card } of inputs.values()) {
      count.textContent = number(input.value.length) + ' / ' + number(ANSWER_LIMIT);
      const written = Boolean(input.value.trim()); completed += Number(written); card.dataset.written = String(written);
    }
    $('reflection-progress').textContent = completed ? formatCopy(copy.reflection.completed,{total:questions.length,count:completed}) : copy.reflection.progress;
  }
  function answers() { return Object.fromEntries([...inputs].map(([id, { input }]) => [id, input.value])); }
  function flush() {
    const workspace = getWorkspace();
    if (!workspace || !workspace.isWritable()) return true;
    try { workspace.setReflectionAnswers(answers()); $('reflection-save-error').textContent = ''; updateStatus(); return true; }
    catch (error) { $('reflection-save-error').textContent = '글을 저장하지 못했어요. ' + error.message; return false; }
  }
  function updateStatus() {
    const saved = getStoreState();
    const text = !saved ? copy.reflection.noRun
      : saved.temporary ? copy.reflection.temporary
      : !saved.writable ? copy.reflection.readOnly
      : saved.status === 'error' ? copy.reflection.error
      : saved.status === 'clean' ? copy.reflection.clean : copy.reflection.saving;
    $('reflection-save-status').textContent = text;
    $('reflection-save-status').dataset.state = saved?.temporary ? 'temporary' : saved?.status ?? 'empty';
  }
  $('reflection-back').addEventListener('click', () => { if (flush()) onBack(); }, { signal });
  $('reflection-empty-back').addEventListener('click', onBack, { signal });
  $('reflection-refresh').addEventListener('click', () => {
    if (flush() && act(() => getWorkspace().captureReflection())) $('reflection-notice').textContent = copy.reflection.refreshed;
  }, { signal });
  function clearPrint() { delete document.body.dataset.printReflection; printSheet?.remove(); printSheet = null; }
  window.addEventListener('afterprint', clearPrint, { signal });
  $('reflection-print-button').addEventListener('click', async () => {
    if (printing || !getWorkspace() || !flush()) return;
    printing = true; $('reflection-print-button').disabled = true;
    try {
      clearPrint(); printSheet = createReflectionPrint({ name: getStoreState().name, model, evidence, answers: answers(), origin, questions, theme:getTheme() });
      document.body.append(printSheet);
      await Promise.all([...printSheet.querySelectorAll('img')].map(image => image.decode()));
      document.body.dataset.printReflection = 'true'; window.print();
    } catch (error) { clearPrint(); $('reflection-save-error').textContent = '인쇄 화면을 만들지 못했어요. ' + error.message; }
    finally { printing = false; $('reflection-print-button').disabled = false; }
  }, { signal });
  return {
    flush, updateStatus,
    render(visible) {
      const workspace = getWorkspace(), state = workspace?.getState(), reflection = state?.reflection;
      const nextContext = getContext() ?? null;
      if (attachedWorkspace !== workspace || attachedContext !== nextContext) {
        attachedWorkspace = workspace; chartKey = null;
        attachedContext = nextContext; copy = getLabCopy(nextContext);
        buildQuestions(state?.questions ?? REFLECTION_QUESTIONS);
        for (const [id, { input }] of inputs) input.value = reflection?.answers[id] ?? '';
        $('reflection-notice').textContent = ''; $('reflection-save-error').textContent = ''; syncCounts();
      }
      for (const { input } of inputs.values()) input.disabled = !workspace?.isWritable();
      evidence = reflection?.evidence; model = workspace?.getReflectionModel() ?? null;
      origin = timeBounds(workspace?.getSamples() ?? [])?.origin ?? null;
      $('reflection-print-button').disabled = !workspace || printing;
      $('reflection-empty').hidden = Boolean(model); $('reflection-evidence-body').hidden = !model;
      $('reflection-stale').hidden = !workspace?.reflectionChanged();
      $('reflection-refresh').disabled = !workspace?.isWritable() || !workspace.getGraphData().points.length;
      $('reflection-run-name').textContent = getStoreState()?.name ?? '나의 실험';
      $('reflection-evidence-caption').textContent = model ? `${model.xLabel} → ${model.yLabel}` : '관계 그래프에서 근거를 가져와 주세요.';
      $('reflection-scope').textContent = evidenceDescription(evidence, model, origin);
      const key = evidenceKey(evidence);
      if (visible && model && key !== chartKey) {
        chart ??= createAnalysisChart($('reflection-chart'), {theme:getTheme()});
        chart.render(model); chartKey = key;
        $('reflection-chart').setAttribute('aria-label', `보관한 근거 그래프. ${model.xLabel} 대 ${model.yLabel}. 분석 포함 ${model.includedCount}개, 제외 ${model.excludedCount}개.`);
      } else if (!visible) chartKey = null;
      const summary = trendSummary(model);
      $('reflection-statistics').hidden = !model?.regression?.enabled;
      $('reflection-equation').textContent = summary.equation; $('reflection-stat-detail').textContent = summary.detail;
      $('reflection-no-trend').hidden = Boolean(model?.regression?.enabled);
      const columns = graphColumns(evidence?.calculatedColumns ?? [], workspace?.getImportedColumns() ?? [], state?.context);
      const operand = o => o.kind === 'constant' ? formatCalculated(o.value) : columnLabel(columns.find(c => c.id === o.columnId));
      $('reflection-calculations').hidden = !evidence?.calculatedColumns.length;
      $('reflection-formulas').replaceChildren(...(evidence?.calculatedColumns ?? []).map(c => node('li', `${columnLabel(c)} = ${operand(c.lhs)} ${CALCULATION_OPERATORS[c.op]} ${operand(c.rhs)}`)));
      const exclusions = evidence?.exclusions ?? [], reasons = [...new Set(exclusions.map(e => e.reason).filter(Boolean))];
      $('reflection-exclusions').hidden = !exclusions.length;
      $('reflection-reasons').replaceChildren(...(reasons.length ? reasons : ['작성한 제외 사유가 없습니다.']).map(reason => node('li', reason)));
      $('reflection-extension-hint').hidden = model?.view !== 'extended';
      $('reflection-zero-meaning').hidden = !(model?.regression?.enabled && model.regression.result?.xIntercept != null);
      $('reflection-invalid').hidden = !model?.invalidCount;
      $('reflection-invalid').textContent = `축의 값이 없는 ${model?.invalidCount ?? 0}개는 그래프·회귀에서 빠져 있어요.`;
      updateStatus();
    },
    reset() {
      chart?.dispose(); chart = null; chartKey = null; attachedWorkspace = null; model = evidence = null;
      for (const { input } of inputs.values()) input.value = '';
      syncCounts(); clearPrint();
    },
  };
}
