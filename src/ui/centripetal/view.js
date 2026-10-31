import { createCentripetalComparison, comparisonHelp } from './comparison.js';
import { tableRowHeight, visibleTableRows, tableSpacer, bindTableScrollKeys } from '../table-viewport.js';
import { fieldWarningMessages, fieldWarningButton, setFieldWarning } from './field-warning.js';
import { setMath } from '../math-view.js';
import { symbolHtml, unitHtml } from '../scientific-notation.js';
import { relations, relationDescriptions, substitutions, prepareOrbitMath } from './formulas.js';
import { supportsCentripetal, closestSample, peakCandidates, inputNumber, calculationModel, numericFields, editCentripetal } from '../../analysis/activities/centripetal.js';
import { readCell } from '../../domain/columns.js';
import { snapToPeak } from './peak-snap.js';
import { createRangeSelector } from '../range-selector.js';
import { createChartView } from '../chart-view.js';
import { readVisualTheme } from '../visual-theme.js';
import { componentSvg, orbitSvg, format } from './diagrams.js';
import { exportWorksheet } from './export.js';
import { getTimeAxisPolicies } from '../../catalog/index.js';
import { bindDisclosureMenu } from '../disclosure-menu.js';
import { createRecordDialogs } from '../record-dialogs.js';
import { createActionHelp } from '../action-help.js';

const fieldNames = {n:'내가 센 회전수',radius:'회전 반지름 r',period:'주기 T',omega:'각속도 ω',sensor:'센서로 구한 구심가속도',orbital:'주기로 구한 구심가속도',difference:'두 결과의 차이',percentDifference:'백분율 차이'};
const units = {n:'회',radius:'m',period:'s',omega:'rad/s',sensor:'m/s²',orbital:'m/s²',difference:'m/s²',percentDifference:'%'};
// All editable worksheet numbers use the same unit-bearing input.
const numberInput = key => `<span class="input-unit cp-number-input ${key==='n'?'cp-count-input':''}"><input id="cp-measure-${key}" data-cp-input="${key}" inputmode="${key==='n'?'numeric':'decimal'}" type="text" enterkeyhint="done" maxlength="80" autocomplete="off" aria-label="${fieldNames[key]}" placeholder="${key==='n'?'':'직접 입력'}"><small>${unitHtml(units[key])}</small>${fieldWarningButton(fieldNames[key])}</span>`;
const input = key => `<label class="cp-field"><span class="cp-field-label">${key==='radius'?'회전 반지름 '+symbolHtml('r'):key==='omega'?'각속도 '+symbolHtml('ω'):fieldNames[key]}${key==='percentDifference'?'<button type="button" class="help-trigger" data-action-help="cpPercentDifference">?</button>':''}</span>${numberInput(key)}<small data-cp-origin="${key}"></small></label>`;

const note = (key,label,hint='') => `<label class="cp-field"><span>${label}</span>${hint?`<small id="cp-hint-${key}">${hint}</small>`:''}<textarea data-cp-input="${key}" aria-label="${label}" ${hint?`aria-describedby="cp-hint-${key}"`:''} maxlength="3000" rows="2"></textarea></label>`;
const helpNames={sensor:'구심가속도',omega:'각속도',orbital:'구심가속도',difference:'차이',percentDifference:'백분율 차이'};
const help = key => `<details class="cp-help"><summary>${helpNames[key]} 계산 도움</summary>${key==='percentDifference'?'<p data-cp-simple="percentDifference"></p>':''}<p class="lab-note">${({sensor:'서로 수직인 두 성분의 크기 관계를 이용해 구심가속도를 구해 보세요.',omega:'한 바퀴의 회전각은 2π rad이에요. 이를 주기로 나누어 각속도를 구해 보세요.',orbital:'반지름에 각속도의 제곱을 곱해 보세요.',difference:'큰 값에서 작은 값을 빼세요.',percentDifference:'두 값을 더하고 2로 나누면 평균이에요.'})[key]}</p><details><summary>관계식과 값 대입</summary>${['difference','percentDifference'].includes(key)?`<p class="lab-note">${symbolHtml('Δa')}: 두 결과의 차이<br>${symbolHtml('a')}<sub>s</sub>: 센서로 구한 값 · ${symbolHtml('a')}<sub>T</sub>: 주기로 구한 값</p>`:''}<p data-cp-general="${key}"></p><p data-cp-formula="${key}"></p></details></details>`;

export function createCentripetalView(host,{refresh,navigation}) {
  host.className='cp-workspace';
  host.innerHTML=`<div data-cp-body class="analysis-workspace"><div class="analysis-scope-bar"><div class="scope-summary"><span class="scope-dot" aria-hidden="true"></span><strong data-cp-source></strong></div><div class="cp-sheet-picker"><details class="disclosure-menu" data-cp-sheets><summary class="ui-button" aria-controls="cp-sheet-options"><span data-cp-sheet-label>활동지 1</span></summary><div id="cp-sheet-options" class="disclosure-menu-panel"><div data-cp-sheet-list></div><button type="button" data-cp-action="new">+ 새 구간으로 분석</button></div></details><button type="button" class="help-trigger" data-action-help="cpSheets" aria-label="활동지 사용 안내">?</button></div><div class="scope-actions"><button type="button" data-cp-action="refresh" hidden>새 자료 반영</button><div class="history-actions"><button type="button" data-cp-action="undo" aria-label="실행 취소" title="실행 취소"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><use href="public/vendor/lucide-history.svg#undo-2"></use></svg></button><button type="button" data-cp-action="redo" aria-label="다시 실행" title="다시 실행"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><use href="public/vendor/lucide-history.svg#redo-2"></use></svg></button></div></div></div>
  <p class="analysis-feedback" data-cp-error role="alert"></p><p class="analysis-feedback" data-cp-problem role="status"></p>
  <section data-cp-panel="worksheet"><div class="plot-heading"><h2 tabindex="-1">구간을 고르고 두 방법으로 계산해요</h2></div><div class="cp-measure-layout"><details class="cp-signal" data-cp-signal open><summary><span>구간 그래프</span><small data-cp-range-summary></small><small class="cp-collapsed-metrics" data-cp-collapsed-metrics></small></summary><p class="lab-note">같은 회전 위치를 나타내는 두 지점을 고르고, 그 사이 회전수를 세어 보세요.</p>
  <div class="cp-chart"><canvas id="cp-overview-chart" aria-label="가속도와 자기장의 같은 시간 구간"></canvas><div class="cp-range" aria-hidden="true" hidden></div><div id="cp-range-overlay" class="range-overlay" hidden><div id="cp-range-window" class="range-window"></div><button type="button" id="cp-range-start-handle" class="range-handle" role="slider" aria-label="구간 시작" aria-orientation="horizontal"><span></span></button><button type="button" id="cp-range-end-handle" class="range-handle" role="slider" aria-label="구간 끝" aria-orientation="horizontal"><span></span></button></div></div>
  <div id="cp-overview-actions" class="overview-actions cp-graph-actions"><div class="cp-range-actions" role="group" aria-label="분석 구간과 보기"><button type="button" data-ui-action="primary" data-cp-action="range">구간 선택</button><button type="button" data-cp-action="view-range">선택 구간만 보기</button></div></div>
  <form id="cp-range-form" class="range-controls" hidden><div class="range-fields"><label>시작<span class="input-unit"><input id="cp-time-range-start" type="number" step="any" required aria-label="구간 시작 경과 시간"><span>초</span></span></label><span class="range-dash">—</span><label>끝<span class="input-unit"><input id="cp-time-range-end" type="number" step="any" required aria-label="구간 끝 경과 시간"><span>초</span></span></label><div class="range-count"><strong id="cp-range-count"></strong><small id="cp-range-hint"></small></div></div><div class="range-buttons"><button id="cp-reset-time-range" type="button">전체 구간</button><button id="cp-cancel-time-range" type="button">취소</button><button id="cp-apply-time-range" data-ui-action="accent" class="primary" type="submit">이 구간 사용 →</button></div><p id="cp-range-error" role="status"></p></form>

  </details>
  <div class="cp-measurements">
  <section class="cp-measurement" aria-labelledby="cp-acceleration-title"><h3 id="cp-acceleration-title">가속도 측정</h3><div class="cp-acceleration-measure">
  <div><h4><span>측정 구간</span><button type="button" class="help-trigger" data-action-help="cpRange">?</button></h4><p data-cp-measure-range></p></div>
  <div><h4><span id="cp-mean-label">구간 평균 가속도</span><button type="button" class="help-trigger" data-action-help="cpMean">?</button></h4><div class="cp-result-action"><div class="cp-measured-value"><output data-cp-mean aria-labelledby="cp-mean-label" aria-live="polite"></output><small>m/s²</small></div><button type="button" data-cp-action="mean">평균 구하기</button></div></div></div>
  </section>
  <section class="cp-measurement" aria-labelledby="cp-period-title"><h3 id="cp-period-title">주기 측정</h3><div class="cp-measure-equation">
  <span id="cp-duration-label">구간의 걸린 시간</span><span aria-hidden="true">÷</span><label for="cp-measure-n">내가 센 회전수</label><span aria-hidden="true">=</span><span id="cp-period-label">주기</span>
  <div class="cp-measured-value"><output data-cp-duration aria-labelledby="cp-duration-label"></output><small>s</small></div>${numberInput('n')}<div class="cp-result-action"><div class="cp-measured-value"><output data-cp-period-preview aria-labelledby="cp-period-label" aria-live="polite"></output><small>s</small></div><button type="button" data-cp-adopt="period">주기 적용</button></div><span class="cp-value-divide" aria-hidden="true">÷</span><span class="cp-value-equals" aria-hidden="true">=</span></div>
  <small data-cp-origin="n"></small>
  </section></div></div>
  <details class="cp-analysis" data-cp-analysis><summary aria-disabled="true" aria-describedby="cp-analysis-status">두 방법으로 구심가속도 구하기</summary><fieldset data-cp-analysis-fields disabled aria-label="구심가속도 분석">
  <div class="cp-columns"><section class="cp-path"><h3>가속도 측정값으로 구하기</h3><div class="cp-data"><div>센서 가속도 ${symbolHtml('Ā')}<strong><span data-cp-sensor-mean></span> <small>m/s²</small></strong></div><div>수직 성분 ${symbolHtml('g')}<strong>9.8 <small>m/s²</small></strong></div></div>
  <p class="lab-note">센서 측정값에는 중력에 의한 수직 성분도 포함되어 있어요. 구심 방향 가속도만 계산해 보세요.</p>${input('sensor')}<div class="cp-calculation-help">${help('sensor')}</div><div data-cp-component></div>${note('thinking','어떤 식으로 계산했나요? (풀이 과정)')}
  </section>
  <section class="cp-path"><h3>주기로 구하기</h3><div class="cp-orbit-inputs">${input('radius')}<div class="cp-field"><span class="cp-field-label" id="cp-applied-period-label">주기 ${symbolHtml('T')}</span><div class="cp-measured-value"><output data-cp-period-value aria-labelledby="cp-applied-period-label"></output><small>s</small>${fieldWarningButton('주기')}</div></div>${input('omega')}${input('orbital')}</div><div class="cp-calculation-help">${help('omega')}${help('orbital')}</div><div data-cp-orbit></div>${note('orbitalThinking','어떤 식으로 계산했나요? (풀이 과정)')}</section></div><button type="button" class="primary" data-cp-step="compare" disabled>두 결과 비교 →</button></fieldset></details><p id="cp-analysis-status" data-cp-analysis-status role="status"></p></section>
  <section data-cp-panel="compare" hidden></section>
  <section data-cp-panel="raw" hidden><div class="plot-heading"><h2 tabindex="-1">원자료</h2><span class="lab-note">음영: 선택한 분석 구간</span></div><div class="cp-table-scroll" tabindex="0" role="region" aria-label="구심가속도 원자료 표"><table class="data-table"><colgroup><col class="cp-col-id"><col class="cp-col-time"><col class="cp-col-acceleration"><col class="cp-col-magnetic"><col class="cp-col-component" span="3"></colgroup><thead><tr><th scope="col">자료</th><th scope="col">경과 시간 (s)</th><th scope="col">가속도 크기 (m/s²)</th><th scope="col">자기장 크기 (µT)</th><th scope="col">가속도 X<br>(m/s²)</th><th scope="col">가속도 Y<br>(m/s²)</th><th scope="col">가속도 Z<br>(m/s²)</th></tr></thead><tbody data-cp-rows></tbody></table></div></section>
  </div>`;
  const $=selector=>host.querySelector(selector), abort=new AbortController(), signal=abort.signal;
  const sheetMenu=$('[data-cp-sheets]');
  bindDisclosureMenu(sheetMenu,{signal});
  const dialogs=createRecordDialogs(host);
  let sheetListKey='';
  const comparisonView=createCentripetalComparison($('[data-cp-panel="compare"]'),{note,input,help,fieldNames,signal});
  const measureHelp=createActionHelp(host,{messages:{cpSheets:{label:'활동지 사용 안내',text:'같은 측정 기록에서 구간을 달리 골라 분석할 수 있어요. + 새 구간으로 분석을 누르면 새 활동지가 생기고, 각 활동지의 계산과 설명은 따로 저장돼요. 이름을 눌러 활동지를 바꾸고 휴지통을 눌러 삭제하세요. 측정 원자료는 유지되며 활동지는 하나 이상 남겨 두어야 해요.'},...fieldWarningMessages,...comparisonHelp,cpRange:{label:'측정 구간',text:'기록 시작부터의 경과 시간입니다.'},cpMean:{label:'구간 평균 가속도',text:'선택한 구간에서 센서가 측정한 가속도 크기의 평균입니다.'}}});
  let workspace=null,store=null,model=null,samples=[],visibleSamples=[],chart=null,chartKey='',owner='',origin=0,step='worksheet';
  let zoom=false,snapPeaks=[],dirty=new Map(),timer=null,colors=null;
  let readOnlySheetId=null,previewMean=false,analysisReady=false,orbitMath=null,orbitRequest=null,disposed=false;
  const inputs=new Map([...host.querySelectorAll('[data-cp-input]')].map(e=>[e.dataset.cpInput,e]));
  const action=fn=>{try{$('[data-cp-error]').textContent='';fn();refresh();return true;}catch(error){$('[data-cp-error]').textContent=error.message;return false;}};
  function flush(){clearTimeout(timer);if(!workspace||!dirty.size)return true;return action(()=>{
    for(const [key,value] of dirty){workspace.editActivity({type:'input',key,value});dirty.delete(key);}
  });}
  function draftModel(){
    if(!model)return null;
    let book={...model.book,activeId:model.sheet.id};
    for(const [key,value] of dirty)book=editCentripetal(book,{type:'input',key,value});
    const sheet=book.sheets.find(item=>item.id===model.sheet.id);
    return {...model,sheet,...calculationModel(sheet,model.interval)};
  }
  const range=createRangeSelector(host,{idPrefix:'cp-',signal,getChart:()=>chart,adjustPointerTime:(at,geometry,limits)=>snapToPeak(at,snapPeaks,geometry,limits),onClose:()=>{layout();$('[data-cp-action="range"]').focus();},onApply:selection=>{
    if(!flush())return;
    action(()=>{
      const start=closestSample(samples,selection.startAt),end=closestSample(samples,selection.endAt);
      if(!start||!end)throw new Error('불러온 자료 안에서 구간을 선택하세요.');
      workspace.editActivity({type:'range',startId:start.sampleId,endId:end.sampleId});
      range.close();$('[data-cp-action="range"]').focus();
    });
  }});
  function rangeState(){return {exclusions:workspace.getState().exclusions,appliedScope:'all',analysisRange:model.interval.start&&model.interval.end?{startAt:model.interval.start.receivedAt,endAt:model.interval.end.receivedAt}:null};}
  function layout(){range.layout();const geometry=chart?.timeGeometry();if(!geometry||!model)return;
    const measureLayout=$('.cp-measure-layout'),cards=$('.cp-measurements');
    if(getComputedStyle(measureLayout).display==='grid'&&measureLayout.getClientRects().length){
      const canvas=$('#cp-overview-chart').getBoundingClientRect(),container=measureLayout.getBoundingClientRect();
      const offset=Math.max(0,canvas.top-container.top+geometry.top+geometry.height/2-cards.getBoundingClientRect().height/2);
      measureLayout.style.setProperty('--cp-measure-offset',Math.round(offset)+'px');
    }else measureLayout.style.removeProperty('--cp-measure-offset');
    const a=model.interval.start,b=model.interval.end,band=$('.cp-range');band.hidden=range.isActive()||!a||!b||b.receivedAt<=a.receivedAt;
    const pixel=t=>Math.max(geometry.left,Math.min(geometry.left+geometry.width,geometry.pixel(t)));
    if(!band.hidden)Object.assign(band.style,{left:pixel(a.receivedAt)+'px',top:geometry.top+'px',width:Math.max(0,pixel(b.receivedAt)-pixel(a.receivedAt))+'px',height:geometry.height+'px'});
  }
  function redraw(){const m=draftModel();if(!m||!colors)return;const v=m.values,i=m.interval,mean=(m.sheet.meanRequested||previewMean)?i.mean:null;
    const problems=[!workspace.isWritable()?'읽기 전용입니다. 저장된 활동지를 선택해 살펴볼 수 있어요.':'',i.problem,mean!==null||i.mean===null?i.accelerationProblem:''];
    $('[data-cp-problem]').textContent=problems.filter(Boolean).join(' ');
    const periodOutput=$('[data-cp-period-value]'),periodStale=m.sheet.review.includes('period');
    periodOutput.textContent=v.period===null?'':format(v.period);
    periodOutput.closest('.cp-measured-value').classList.toggle('cp-stale',periodStale);
    setFieldWarning(periodOutput.closest('.cp-measured-value'),periodStale?'reviewPeriod':null);
    if(periodStale)periodOutput.setAttribute('aria-description','조건 변경 전 적용한 주기. 주기 측정에서 다시 적용하세요.');else periodOutput.removeAttribute('aria-description');
    for(const key of numericFields){
      if(key==='period')continue;
      const element=inputs.get(key),number=inputNumber(m.sheet.inputs[key]);
      const valid=key==='n'?Number.isSafeInteger(number)&&number>0:['sensor','orbital','difference','percentDifference'].includes(key)?number!==null&&number>=0:number>0;
      const invalid=m.sheet.inputs[key]!==''&&!valid;element.setAttribute('aria-invalid',String(invalid));
      $(`[data-cp-origin="${key}"]`).textContent=invalid?(key==='n'?'1 이상의 정수로 입력하세요.':['sensor','orbital','difference','percentDifference'].includes(key)?'0 이상의 유한한 크기로 입력하세요.':'0보다 큰 수로 입력하세요.'):
        !m.sheet.review.includes(key)&&m.sheet.sources[key]==='help'?'계산 도움에서 채택':'';
      const stale=m.sheet.review.includes(key);
      const container=element.closest('.cp-number-input');
      container.classList.toggle('cp-stale',stale);
      const unitWarning=key==='radius'&&number>3;
      setFieldWarning(container,unitWarning?'radiusUnits':stale?(key==='n'?'reviewCount':'reviewInput'):null,{caution:unitWarning&&!stale});
      if(stale){
        element.setAttribute('aria-description','조건 변경 전 입력한 값. 같은 값이면 Enter로 확인하세요.');
      }else{element.removeAttribute('aria-description');}
    }
    $('[data-cp-component]').innerHTML=componentSvg(mean,colors,Math.max(1,$('[data-cp-component]').clientWidth));
    $('[data-cp-orbit]').innerHTML=orbitSvg(v.radius,v.orbital,colors,Math.max(280,$('[data-cp-orbit]').clientWidth),orbitMath);
    const blank=value=>Number.isFinite(value)?format(value):'빈칸';
    const steps={sensor:`a = √(${blank(mean)}² − 9.8²) m/s²`,omega:`ω = 2π ÷ ${blank(v.period>0?v.period:null)} rad/s`,orbital:`a = ${blank(v.radius>0?v.radius:null)} × ${blank(v.omega>0?v.omega:null)}² m/s²`};
    $('[data-cp-collapsed-metrics]').textContent=`가속도 크기 평균 ${format(mean)} m/s² · T 입력 ${format(v.period)} s`;
    const stage=m.help;
    const period=stage.period, valid=Number.isFinite(period)&&period>0;
    const applied=valid&&v.period===period&&m.sheet.sources.period==='help'&&!m.sheet.review.includes('period');
    $('[data-cp-period-preview]').textContent=valid?format(period):'';
    $('[data-cp-adopt="period"]').disabled=!workspace.isWritable()||!valid||applied;
    $('[data-cp-mean]').textContent=mean===null?'':format(mean);
    $('[data-cp-sensor-mean]').textContent=mean===null?'—':format(mean);
    $('[data-cp-action="mean"]').disabled=!Number.isFinite(i.mean)||mean!==null;
    const ready=mean!==null&&valid;
    if(ready){
      orbitRequest??=prepareOrbitMath().then(result=>{orbitMath=result;if(!disposed)redraw();}).catch(()=>{orbitRequest=null;});
      const substitute=substitutions(v,mean);
      for(const key of ['sensor','omega','orbital']){void setMath($(`[data-cp-general="${key}"]`),relations[key],relationDescriptions[key],{display:true});void setMath($(`[data-cp-formula="${key}"]`),substitute[key],steps[key],{display:true});}
    }
    const analysis=$('[data-cp-analysis]');
    if(ready!==analysisReady)analysis.open=ready;
    analysisReady=ready;
    analysis.querySelector('summary').setAttribute('aria-disabled',String(!ready));
    $('[data-cp-analysis-fields]').disabled=!ready;
    $('[data-cp-analysis-status]').textContent=ready?'':'가속도 평균과 주기를 모두 구하면 분석이 열려요.';
    host.querySelectorAll('[data-cp-panel]').forEach(e=>e.hidden=e.dataset.cpPanel!==step);
    [...host.querySelectorAll('[data-cp-step]'),...navigation.querySelectorAll('[data-cp-step]')].forEach(e=>{e.disabled=e.dataset.cpStep==='compare'&&!m.comparisonReady;if(e.dataset.cpStep===step)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});
    navigation.style.setProperty('--active-tab', String(['raw','worksheet','compare'].indexOf(step)));
    comparisonView.render(m,{colors,writable:workspace.isWritable()});
    return stage;
  }
  $('[data-cp-analysis] > summary').addEventListener('click',e=>{if(!analysisReady)e.preventDefault();},{signal});
  $('[data-cp-analysis]').addEventListener('toggle',()=>{if(!analysisReady)$('[data-cp-analysis]').open=false;else redraw();},{signal});
  $('[data-cp-signal]').addEventListener('toggle',()=>{if(!$('[data-cp-signal]').open)range.close();if(workspace)refresh();},{signal});
  host.addEventListener('input',e=>{const key=e.target.dataset.cpInput;if(!key||e.target.disabled||(e.target.closest('[data-cp-panel=compare]')&&!draftModel()?.comparisonReady))return;dirty.set(key,e.target.value);redraw();clearTimeout(timer);timer=setTimeout(flush,650);},{signal});
  host.addEventListener('keydown',e=>{
    const key=e.target.dataset.cpInput;
    if(e.key!=='Enter'||e.isComposing||!numericFields.includes(key)||e.target.disabled||!workspace?.isWritable())return;
    e.preventDefault();
    if(!flush()||!model.sheet.review.includes(key)||e.target.getAttribute('aria-invalid')==='true')return;
    action(()=>workspace.editActivity({type:'review',key}));
  },{signal});
  host.addEventListener('change',e=>{if(e.target.dataset.cpInput)flush();},{signal});
  const handleClick=async e=>{
    const button=e.target.closest('button');if(!button||(!host.contains(button)&&!navigation.contains(button))||button.disabled)return;
    if(!flush())return;
    const d=button.dataset;
    if(d.cpSelect){
      action(()=>{const id=Number(d.cpSelect);if(workspace.isWritable())workspace.editActivity({type:'select',id});else readOnlySheetId=id;});return;
    }
    if(d.cpDelete){
      const id=Number(d.cpDelete),targetWorkspace=workspace;
      await dialogs.confirm({title:'활동지를 삭제할까요?',description:'활동지 '+id+'의 선택 구간, 계산과 설명을 삭제합니다. 측정 원자료와 다른 활동지는 유지됩니다.',submit:'활동지 삭제'},()=>{
        if(workspace!==targetWorkspace)throw new Error('현재 활동지를 다시 확인해 주세요.');
        const deletingCurrent=model.sheet.id===id;
        workspace.editActivity({type:'delete',id});
        if(deletingCurrent){step='worksheet';zoom=false;}
        refresh();
      });return;
    }
    if(d.cpStep){if(d.cpStep==='compare'&&!draftModel()?.comparisonReady)return;range.close();step=d.cpStep;refresh();const heading=$(`[data-cp-panel="${step}"] h2`);heading.focus({preventScroll:true});heading.scrollIntoView({block:'start'});return;}
    if(d.cpRevisit){if(!draftModel()?.comparisonReady)return;step='worksheet';refresh();$('[data-cp-analysis]').open=true;inputs.get(d.cpRevisit)?.focus();return;}
    if(d.cpComparisonMode){
      if(!draftModel()?.comparisonReady||!workspace.isWritable())return;
      action(()=>workspace.editActivity({type:'comparison-mode',mode:d.cpComparisonMode}));return;
    }
    if(d.cpAdopt){const value=redraw()[d.cpAdopt];if(Number.isFinite(value))action(()=>workspace.editActivity({type:'input',key:d.cpAdopt,value:String(value),source:'help'}));return;}
    if(!d.cpAction)return;
    const name=d.cpAction;
    if(['evidence','png','print'].includes(name)&&!draftModel()?.comparisonReady)return;
    if(name==='mean'){action(()=>{if(workspace.isWritable())workspace.editActivity({type:'mean'});else previewMean=true;});return;}
    if(['evidence','png','print'].includes(name)){
      try {
        const current=draftModel();if(!current?.comparisonReady)return;
        const context=workspace.getState().context,run=store.getRun();
        await exportWorksheet(name==='evidence'?'preview':name,{model:current,name:run.name,createdAt:run.createdAt,origin,
          samples:samples.filter(s=>s.sampleId>=current.sheet.startId&&s.sampleId<=current.sheet.endId),context,
          theme:readVisualTheme(host,context.channels),onAuthorChange:values=>{
            if(!workspace.isWritable()||workspace.getCentripetalModel().sheet.id!==current.sheet.id)return;
            for(const [key,value] of Object.entries(values))workspace.editActivity({type:'input',key,value});
          }});
      }catch(error){$('[data-cp-error]').textContent=error.message;}return;
    }
    action(()=>{
      if(name==='new'){workspace.editActivity({type:name});step='worksheet';zoom=false;}
      if(name==='range'){zoom=false;chartKey='';refresh();range.update(samples,rangeState(),origin);snapPeaks=peakCandidates(samples);range.open(rangeState());}
      if(name==='refresh'){range.close();workspace.showNewData();chartKey='';}
      if(name==='undo')workspace.undo();if(name==='redo')workspace.redo();
      if(name==='view-range'){if(!zoom&&(!model.interval.start||!model.interval.end))return;zoom=!zoom;chartKey='';}
    });
  };
  host.addEventListener('click',handleClick,{signal});
  navigation.addEventListener('click',handleClick,{signal});
  function tableRows(target,rows){target.replaceChildren();for(const sample of rows){
    const row=document.createElement('tr');row.className='data-row';
    const values=[sample.sampleId,format((sample.receivedAt-origin)/1000),...['accelerationStrength','magneticStrength','accelerationX','accelerationY','accelerationZ'].map(id=>format(readCell(sample,id).value))];
    const inRange=model.interval.start&&model.interval.end&&sample.sampleId>=model.interval.start.sampleId&&sample.sampleId<=model.interval.end.sampleId;
    row.dataset.inRange=String(Boolean(inRange));if(inRange)row.setAttribute('aria-label','자료 '+sample.sampleId+' · 선택한 분석 구간');
    for(const [index,value] of values.entries()){const cell=document.createElement(index?'td':'th');if(!index)cell.scope='row';cell.textContent=String(value);row.append(cell);}
    target.append(row);
  }}
  const tableScroll=$('.cp-table-scroll'),tableBody=$('[data-cp-rows]'),rawTable=tableBody.closest('table');
  let tableFrame=null;
  function paintTable(){
    if(step!=='raw'||host.hidden)return;
    const height=tableRowHeight(rawTable);
    rawTable.style.setProperty('--table-row-height',height+'px');
    rawTable.setAttribute('aria-rowcount',String(samples.length+1));
    const {start,end}=visibleTableRows(samples.length,tableScroll.scrollTop,tableScroll.clientHeight,height);
    tableRows(tableBody,samples.slice(start,end));
    [...tableBody.rows].forEach((row,index)=>row.setAttribute('aria-rowindex',String(start+index+2)));
    if(start)tableBody.prepend(tableSpacer(start,height,rawTable.tHead.rows[0].cells.length));
    if(end<samples.length)tableBody.append(tableSpacer(samples.length-end,height,rawTable.tHead.rows[0].cells.length));
  }
  function scheduleTable(){tableFrame??=requestAnimationFrame(()=>{tableFrame=null;paintTable();});}
  tableScroll.addEventListener('scroll',scheduleTable,{passive:true,signal});

  bindTableScrollKeys(tableScroll,scheduleTable,signal);
  const tableObserver=new ResizeObserver(scheduleTable);tableObserver.observe(tableScroll);
  const observer=new ResizeObserver(()=>{if(!host.hidden){layout();redraw();}});observer.observe(host);observer.observe($('.cp-measurements'));
  function renderSheetMenu(){
    const key=model.book.sheets.map(sheet=>sheet.id).join(',');
    if(key!==sheetListKey){
      const list=$('[data-cp-sheet-list]');list.replaceChildren();sheetListKey=key;
      for(const sheet of model.book.sheets){
        const row=document.createElement('div');row.className='cp-sheet-option';
        const select=document.createElement('button');select.type='button';select.dataset.cpSelect=String(sheet.id);select.textContent='활동지 '+sheet.id;
        const remove=document.createElement('button');remove.type='button';remove.dataset.cpDelete=String(sheet.id);remove.setAttribute('aria-label','활동지 '+sheet.id+' 삭제');remove.title='활동지 '+sheet.id+' 삭제';
        remove.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6"/></svg>';
        row.append(select,remove);list.append(row);
      }
    }
    $('[data-cp-sheet-label]').textContent='활동지 '+model.sheet.id;
    for(const button of host.querySelectorAll('[data-cp-select]')){
      if(Number(button.dataset.cpSelect)===model.sheet.id)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
    }
    for(const button of host.querySelectorAll('[data-cp-delete]'))button.disabled=!workspace.isWritable()||model.book.sheets.length===1;
  }
  function render(nextWorkspace,nextStore){
    const state=nextWorkspace?.getState(),supported=supportsCentripetal(state?.context);host.hidden=!supported;navigation.hidden=!supported;
    if(!supported){if(owner)reset();return false;}
    if(workspace!==nextWorkspace)readOnlySheetId=null;
    workspace=nextWorkspace;store=nextStore;model=workspace.getCentripetalModel(false,workspace.isWritable()?null:readOnlySheetId);origin=workspace.getTimeOrigin();
    const nextOwner=state.runId+':'+model.sheet.id;
    if(owner!==nextOwner){dirty.clear();clearTimeout(timer);owner=nextOwner;analysisReady=false;$('[data-cp-analysis]').open=false;$('[data-cp-signal]').open=true;zoom=false;chartKey='';tableScroll.scrollTop=0;range.close();previewMean=false;host.querySelectorAll('.cp-help, .cp-help details').forEach(e=>e.open=false);}
    samples=workspace.getSamples();visibleSamples=zoom&&model.interval.start&&model.interval.end?samples.filter(s=>s.sampleId>=model.sheet.startId&&s.sampleId<=model.sheet.endId):samples;
    renderSheetMenu();
    const i=model.interval,write=workspace.isWritable(),summary=workspace.getSummary();
    $('[data-cp-action="view-range"]').textContent=zoom?'전체 기록 보기':'선택 구간만 보기';
    $('[data-cp-action="view-range"]').disabled=!zoom&&(!i.start||!i.end||i.end.receivedAt<=i.start.receivedAt);
    $('[data-cp-source]').textContent=store.getRun().name;
    $('[data-cp-range-summary]').textContent=`${i.start?format((i.start.receivedAt-origin)/1000):'시작 미정'}–${i.end?format((i.end.receivedAt-origin)/1000):'끝 미정'}초 · ${i.count}개 표본`;
    host.querySelectorAll('input,textarea').forEach(e=>e.disabled=!write);
    host.querySelectorAll('[data-cp-action="range"],.range-handle').forEach(e=>e.disabled=!write);
    for(const [key,element]of inputs){const value=model.sheet.inputs[key];if(!dirty.has(key)&&element.value!==value)element.value=value;}
    $('[data-cp-duration]').textContent=i.duration===null?'':format(i.duration);
    $('[data-cp-measure-range]').textContent=i.start&&i.end?format((i.start.receivedAt-origin)/1000)+'–'+format((i.end.receivedAt-origin)/1000)+' s':'구간을 선택하세요.';
    for(const key of ['new','refresh','undo','redo'])$(`[data-cp-action="${key}"]`).disabled=!write;
    $('[data-cp-action="undo"]').disabled=!write||!summary.undoLabel;$('[data-cp-action="redo"]').disabled=!write||!summary.redoLabel;
    $('[data-cp-action="refresh"]').hidden=!workspace.pendingChanges().added;
    const styles=getComputedStyle(host),theme=readVisualTheme(host,state.context.channels);colors={text:styles.getPropertyValue('--sl-text').trim()||'#122944',muted:styles.getPropertyValue('--sl-line').trim()||'#d5ddeb',sensor:theme?.channelColors.accelerationStrength||'#156082',orbit:theme?.channelColors.magneticStrength||'#e97132',result:styles.getPropertyValue('--sl-primary-bg').trim()||'#ee6a26'};
    redraw();
    if(step==='worksheet'&&$('[data-cp-signal]').open){
      chart??=createChartView($('.cp-chart canvas'),{context:state.context,channels:state.context.channels.filter(c=>['accelerationStrength','magneticStrength'].includes(c.id)),axisPolicies:getTimeAxisPolicies(state.context),inspect:true,tooltip:'time',legendToggle:false,eventMarkers:false,theme:readVisualTheme(host,state.context.channels),onLayout:layout});
      const key=[owner,state.tableLastSampleId,zoom,model.sheet.startId,model.sheet.endId].join(':');if(chartKey!==key){chart.render(visibleSamples,0,{range:'all',origin,timeRange:zoom?rangeState().analysisRange:null,events:store.getEvents(Infinity),referencePoints:samples,scopeKey:state.runId});chartKey=key;}chart.resize();layout();
    }
    paintTable();
    range.update(samples,rangeState(),origin);layout();redraw();return true;
  }
  function reset(){cancelAnimationFrame(tableFrame);tableFrame=null;tableBody.replaceChildren();tableScroll.scrollTop=0;measureHelp.close();range.reset();clearTimeout(timer);dirty.clear();previewMean=false;analysisReady=false;readOnlySheetId=null;chart?.dispose();chart=null;chartKey='';owner='';workspace=store=model=null;samples=[];step='worksheet';sheetMenu.open=false;sheetListKey='';host.hidden=true;navigation.hidden=true;}
  return {render,flush,reset,dispose(){disposed=true;reset();measureHelp.dispose();dialogs.dispose();tableObserver.disconnect();observer.disconnect();abort.abort();}};
}
