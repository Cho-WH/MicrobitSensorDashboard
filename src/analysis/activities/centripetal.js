import { readCell } from '../../domain/columns.js';

export const GRAVITY = 9.8;
export const calculationFields = ['n', 'radius', 'period', 'omega', 'sensor', 'orbital'];
export const numericFields = [...calculationFields, 'difference', 'percentDifference'];
export const textFields = ['selectionReason', 'thinking', 'orbitalThinking', 'evidenceText', 'differenceReason', 'improvement', 'agreementReason', 'accuracyReflection', 'roles', 'reportClass', 'reportNumber', 'reportName'];
export const supportsCentripetal = context => context?.activity?.id === 'centripetal'
  && context.analysisSource !== 'points';
export const blankSheet = id => ({ id, startId: null, endId: null,
  inputs: Object.fromEntries([...numericFields, ...textFields].map(key => [key, ''])),
  sources: {}, review: [], endpointSources: {}, shownHelp: [], meanRequested: false, comparisonMode: 'difference' });
export const blankBook = () => ({ version: 2, nextId: 2, activeId: 1, sheets: [blankSheet(1)], evidence: null });
export const activeSheet = book => book.sheets.find(sheet => sheet.id === book.activeId);
export function inputNumber(value) {
  if (typeof value !== 'string' || !value.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));

export function validateCentripetalContext(context) {
  if(context.activity?.id!=='centripetal')return;
  requireValue(context.activity.version===2 && !Object.hasOwn(context.setup??{},'centripetalRadiusCm'),
    '이전 cm 단위 구심가속도 기록은 지원하지 않아요. 새 실험을 시작해 주세요.');
  const radius=context.setup?.centripetalRadiusM;
  requireValue(radius===undefined || typeof radius==='string'&&radius.length<=80, '회전 반지름의 저장 형식을 확인하세요.');
}

// Imported student drafts are bounded text, never measurements or trusted derived results.
export function validateCentripetal(input, samples, context, through = Infinity) {
  if (input == null) return undefined;
  requireValue(supportsCentripetal(context), '이 자료에는 구심가속도 활동지를 사용할 수 없어요.');
  validateCentripetalContext(context);
  const book = structuredClone(input), ids = new Set(samples.filter(s => s.sampleId <= through).map(s => s.sampleId));
  requireValue(keys(book, ['version','nextId','activeId','sheets','evidence']) && book.version === 2
    && Number.isSafeInteger(book.nextId) && book.nextId > 1 && Array.isArray(book.sheets)
    && book.sheets.length > 0 && book.sheets.length <= 100, '활동지 저장 형식을 확인하세요.');
  function sheet(value) {
    requireValue(keys(value,['id','startId','endId','inputs','sources','review','endpointSources','shownHelp','meanRequested','comparisonMode'])
      && Number.isSafeInteger(value.id) && value.id > 0, '활동지 번호를 확인하세요.');
    for (const key of ['startId','endId']) requireValue(value[key] === null || ids.has(value[key]), '활동지에 연결된 원자료가 없어요.');
    // Earlier drafts divided by the period result. Keep other work, but do not relabel that answer.
    if(object(value.inputs)&&Object.hasOwn(value.inputs,'relative')){
      requireValue(typeof value.inputs.relative==='string'&&value.inputs.relative.length<=80,'학생 입력의 형식이나 길이를 확인하세요.');
      delete value.inputs.relative;
      if(object(value.sources))delete value.sources.relative;
      if(Array.isArray(value.review))value.review=value.review.filter(key=>key!=='relative');
    }
    if(object(value.inputs))for(const key of ['orbitalThinking','difference','percentDifference','differenceReason','agreementReason','accuracyReflection','reportClass','reportNumber','reportName'])value.inputs[key] ??= '';
    value.comparisonMode ??= 'difference';
    requireValue(['difference','agreement'].includes(value.comparisonMode), '결과를 돌아보는 질문의 선택을 확인하세요.');
    requireValue(keys(value.inputs,[...numericFields,...textFields])
      && [...numericFields,...textFields].every(key => typeof value.inputs[key] === 'string'
        && value.inputs[key].length <= (numericFields.includes(key) ? 80 : 3000)), '학생 입력의 형식이나 길이를 확인하세요.');
    requireValue(keys(value.sources,numericFields) && Object.values(value.sources).every(v => ['manual','help'].includes(v)), '계산 입력의 출처를 확인하세요.');
    requireValue(Array.isArray(value.review) && new Set(value.review).size === value.review.length
      && value.review.every(key => numericFields.includes(key)), '계산 재확인 항목을 확인하세요.');
    requireValue(keys(value.endpointSources,['startId','endId']) && Object.values(value.endpointSources).every(v => ['manual','candidate-v1'].includes(v)), '기준점 출처를 확인하세요.');
    value.shownHelp ??= [];
    value.meanRequested ??= false;
    requireValue(typeof value.meanRequested === 'boolean', '구간 평균 확인 상태를 확인하세요.');
    requireValue(Array.isArray(value.shownHelp) && new Set(value.shownHelp).size===value.shownHelp.length
      && value.shownHelp.every(key=>['sensor','period','omega','orbital','reference'].includes(key)), '계산 도움 공개 상태를 확인하세요.');
  }
  book.sheets.forEach(sheet);
  requireValue(new Set(book.sheets.map(s => s.id)).size === book.sheets.length
    && book.sheets.some(s => s.id === book.activeId) && book.sheets.every(s => s.id < book.nextId), '현재 활동지 번호를 확인하세요.');
  if (book.evidence !== null) {
    const e = book.evidence;
    requireValue(keys(e,['sheet','capturedAt','policy','excludedIds']) && Number.isFinite(e.capturedAt)
      && e.policy === 'linear-time-v1' && Array.isArray(e.excludedIds) && e.excludedIds.every(id=>ids.has(id))
      && new Set(e.excludedIds).size===e.excludedIds.length, '보관한 활동지 근거를 확인하세요.');
    sheet(e.sheet);
  }
  return book;
}

export function editCentripetal(current, action) {
  const book = structuredClone(current ?? blankBook()), sheet = activeSheet(book);
  const mark = names => { sheet.review = [...new Set([...sheet.review, ...names.filter(key => sheet.inputs[key] !== '')])]; };
  if (action.type === 'input') {
    const { key, value, source = 'manual' } = action;
    requireValue([...numericFields,...textFields].includes(key) && typeof value === 'string', '입력 항목을 확인하세요.');
    if (sheet.inputs[key] === value && sheet.sources[key] === source && !sheet.review.includes(key)) return book;
    const dependencies = {n:['period','omega','orbital'], radius:['orbital'], period:['omega','orbital'], omega:['orbital'], difference:['percentDifference']};
    if (sheet.inputs[key] !== value) {
      mark(dependencies[key] ?? []);
      if(['sensor','orbital'].includes(key)&&inputNumber(sheet.inputs[key])!==inputNumber(value)){
        for(const result of ['difference','percentDifference']){sheet.inputs[result]='';delete sheet.sources[result];}
        sheet.review=sheet.review.filter(name=>!['difference','percentDifference'].includes(name));
      }
    }
    sheet.inputs[key] = value;
    if (numericFields.includes(key)) sheet.sources[key] = source;
    sheet.review = sheet.review.filter(k => k !== key);
  } else if (action.type === 'comparison-mode') {
    requireValue(['difference','agreement'].includes(action.mode), '결과를 돌아보는 질문을 선택하세요.');
    sheet.comparisonMode=action.mode;
  } else if (action.type === 'range') {
    for(const key of ['startId','endId'])if(sheet[key]!==action[key]){
      sheet[key]=action[key];sheet.endpointSources[key]='manual';sheet.meanRequested=false;
      mark(['n','period','omega','sensor','orbital']);
    }
  } else if (action.type === 'endpoint') {
    requireValue(['startId','endId'].includes(action.key), '시작점 또는 끝점을 선택하세요.');
    if (sheet[action.key] !== action.sampleId) {
      sheet[action.key] = action.sampleId;
      sheet.meanRequested = false;
      sheet.endpointSources[action.key] = action.source ?? 'manual';
      mark(['n','period','omega','sensor','orbital']);
    }
  } else if (action.type === 'mean') {
    sheet.meanRequested = true;
  } else if (action.type === 'review') {
    requireValue(numericFields.includes(action.key), '재확인할 항목을 확인하세요.');
    sheet.review = sheet.review.filter(k=>k!==action.key);
  } else if (action.type === 'help') {
    requireValue(['sensor','period','omega','orbital','reference'].includes(action.key), '계산 도움 항목을 확인하세요.');
    sheet.shownHelp = [...new Set([...(sheet.shownHelp??[]),action.key])];
  } else if (action.type === 'new') {
    requireValue(book.sheets.length < 100, '활동지는 한 실험에 100개까지 보관할 수 있어요.');
    const next = blankSheet(book.nextId++); next.inputs.radius = sheet.inputs.radius;
    if (sheet.sources.radius) next.sources.radius = sheet.sources.radius;
    book.sheets.push(next); book.activeId = next.id;
  } else if (action.type === 'select') {
    requireValue(book.sheets.some(s=>s.id===action.id), '활동지를 찾지 못했어요.'); book.activeId = action.id;
  } else if (action.type === 'delete') {
    requireValue(book.sheets.length > 1, '활동지 하나는 남겨 두세요.');
    const id = action.id ?? book.activeId;
    requireValue(book.sheets.some(s=>s.id===id), '활동지를 찾지 못했어요.');
    book.sheets = book.sheets.filter(s=>s.id!==id);
    if (book.activeId === id) book.activeId = book.sheets[0].id;
  } else throw new Error('지원하지 않는 활동지 변경입니다.');
  return book;
}

export function closestSample(samples, receivedAt) {
  if (!Number.isFinite(receivedAt) || !samples.length) return null;
  const times = samples.map(s=>s.receivedAt).filter(Number.isFinite);
  if (!times.length || receivedAt < times.reduce((a,b)=>Math.min(a,b),Infinity) || receivedAt > times.reduce((a,b)=>Math.max(a,b),-Infinity)) return null;
  return samples.reduce((best,s)=>Number.isFinite(s.receivedAt) && (!best || Math.abs(s.receivedAt-receivedAt)<Math.abs(best.receivedAt-receivedAt)) ? s : best, null);
}

export function intervalModel(sheet, samples, events = [], exclusions = []) {
  const a = samples.findIndex(s=>s.sampleId===sheet.startId), b = samples.findIndex(s=>s.sampleId===sheet.endId);
  const result = { start: samples[a] ?? null, end: samples[b] ?? null, duration: null, count: 0,
    problem: '', accelerationProblem: '', mean: null, deviation: null, min: null, max: null, gapLimit: null };
  const fail = message => ({...result, problem:message});
  if (a<0||b<0) return fail('구간 선택을 눌러 사용할 회전 구간을 정하세요.');
  if (b<=a || !(samples[b].receivedAt>samples[a].receivedAt)) return fail('끝점은 시작점보다 뒤에 있어야 해요.');
  const rows=samples.slice(a,b+1), excluded=new Set(exclusions.map(e=>typeof e==='number'?e:e.sampleId));
  result.count=rows.length; result.duration=(rows.at(-1).receivedAt-rows[0].receivedAt)/1000;
  if (rows.some(s=>excluded.has(s.sampleId))) return fail('제외한 자료가 구간 안에 있어요. 제외를 복원하거나 구간을 다시 선택하세요.');
  const breakTypes=['discontinuity','recording-paused','recording-resumed','additional-measurement','interrupted'];
  if(events.some(e=>e.receivedAt>rows[0].receivedAt&&e.receivedAt<=rows.at(-1).receivedAt
    && (breakTypes.includes(e.type)||(e.type==='reception-change'&&e.payload?.state==='stale')))) return fail('기록 중단·재연결을 가로지르는 구간이에요. 연속된 구간을 선택하세요.');
  const gaps=rows.slice(1).map((s,i)=>s.receivedAt-rows[i].receivedAt);
  if(gaps.some(dt=>!Number.isFinite(dt)||dt<=0)) return fail('시각이 겹치거나 역행한 자료가 있어요. 다른 연속 구간을 선택하세요.');
  // At least five regular intervals are needed to estimate cadence; a hard one-second floor remains conservative.
  const cadence=gaps.slice().sort((x,y)=>x-y);
  result.gapLimit=Math.max(1000,5*(cadence.length>=5?cadence[Math.floor(cadence.length/2)]:100));
  if(gaps.some(dt=>dt>result.gapLimit)) return fail('자료 사이에 큰 시간 공백이 있어요. 공백을 포함하지 않는 구간을 선택하세요.');
  const values=rows.map(s=>readCell(s,'accelerationStrength'));
  if(values.some(c=>c.reason||!Number.isFinite(c.value))) return {...result, accelerationProblem:'같은 구간에 유효하지 않은 가속도값이 있어 평균을 계산할 수 없어요.'};
  const anchor=values[0].value;
  let integral=0, square=0;
  for(let i=0;i<gaps.length;i++) { const x=values[i].value-anchor,y=values[i+1].value-anchor,weight=gaps[i]/1000;
    integral+=weight*(x+y)/2; square+=weight*(x*x+x*y+y*y)/3; }
  result.mean=anchor+integral/result.duration;
  result.deviation=Math.sqrt(Math.max(0,square/result.duration-(integral/result.duration)**2));
  result.min=values.reduce((v,c)=>Math.min(v,c.value),Infinity); result.max=values.reduce((v,c)=>Math.max(v,c.value),-Infinity);
  if(!Number.isFinite(result.mean)||!Number.isFinite(result.deviation))return {...result,mean:null,deviation:null,accelerationProblem:'자료의 수치 범위가 너무 커 가속도 통계를 계산할 수 없어요.'};
  if(result.mean<=GRAVITY) result.accelerationProblem='평균이 9.8 m/s² 이하라 이 근사식으로 구심가속도를 구할 수 없어요.';
  return result;
}

export function calculationModel(sheet, interval) {
  const values=Object.fromEntries(numericFields.map(key=>[key,inputNumber(sheet.inputs[key])]));
  const n=values.n, r=values.radius, validN=Number.isSafeInteger(n)&&n>0&&!sheet.review.includes('n');
  const period=!interval.problem&&validN ? interval.duration/n : null;
  const omega=period>0 ? 2*Math.PI/period : null;
  const orbital=omega!==null&&r>0 ? r*omega**2 : null;
  const sensor=!interval.problem&&!interval.accelerationProblem&&interval.mean!==null ? Math.sqrt(interval.mean-GRAVITY)*Math.sqrt(interval.mean+GRAVITY) : null;
  const finite=v=>Number.isFinite(v)?v:null;
  const comparisonScale=Math.max(values.sensor??0,values.orbital??0);
  const comparison=values.sensor!==null&&values.orbital!==null&&values.sensor>=0&&values.orbital>=0
    ? {difference:Math.abs(values.sensor-values.orbital),percentDifference:comparisonScale>0?finite(Math.abs(values.sensor-values.orbital)/comparisonScale/((values.sensor/comparisonScale+values.orbital/comparisonScale)/2)*100):null}:null;
  const reference={period:finite(period),omega:finite(omega),orbital:finite(orbital),sensor:finite(sensor)};
  const help={sensor:reference.sensor,period:reference.period,
    omega:values.period>0?finite(2*Math.PI/values.period):null,
    orbital:r>0&&values.omega>0?finite(r*values.omega**2):null};
  const comparisonReady=sheet.meanRequested && !interval.problem && !interval.accelerationProblem
    && Number.isFinite(interval.mean) && !sheet.review.some(key=>calculationFields.includes(key))
    && calculationFields.every(key=>key==='n'?Number.isSafeInteger(values[key])&&values[key]>0
      :['sensor','orbital'].includes(key)?values[key]!==null&&values[key]>=0:values[key]>0);
  return {values,reference,help,comparison,comparisonReady};
}

// Peak detection for pointer assistance; never determines N or confirms a range.
export function peakCandidates(samples) {
  const rows=samples.map(s=>({sample:s,cell:readCell(s,'magneticStrength')}));
  const values=rows.filter(r=>!r.cell.reason&&Number.isFinite(r.cell.value)).map(r=>r.cell.value);
  if(values.length<3)return [];
  const low=values.reduce((a,b)=>Math.min(a,b),Infinity),high=values.reduce((a,b)=>Math.max(a,b),-Infinity);
  if(!(high>low))return [];
  return rows.filter((r,i)=>i>0&&i<rows.length-1&&!r.cell.reason&&!rows[i-1].cell.reason&&!rows[i+1].cell.reason
    &&r.cell.value>rows[i-1].cell.value&&r.cell.value>=rows[i+1].cell.value&&r.cell.value>=low+(high-low)*.5).map(r=>r.sample);
}
