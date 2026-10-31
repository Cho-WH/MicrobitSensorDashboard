import { unitHtml } from '../scientific-notation.js';
import { setMath } from '../math-view.js';
import { comparisonFormulae } from './formulas.js';
import { compareSvg, format } from './diagrams.js';

export const comparisonHelp={
  cpDifference:{label:'두 결과의 차이',text:'차이는 두 값이 얼마나 다른지, 백분율 차이는 그 차이가 값의 크기에 비해 얼마나 큰지 보여줘요.'},
  cpPercentDifference:{label:'백분율 차이',text:'두 결과가 값의 크기에 비해 얼마나 다른지 알려줘요. 회전 속도나 반지름이 다른 실험끼리도 두 방법의 일치 정도를 비교할 수 있어요.'},
  cpReexperiment:{label:'내 설명 점검하기',text:'예를 들어 회전수를 실제보다 많이 셌다면, 계산한 주기와 주기로 구한 구심가속도는 각각 어떻게 달라질까요?'},
  cpInterpretation:{label:'차이의 원인 찾기',text:'측정 구간 동안 가속도 그래프의 값은 안정적이었나요? 회전은 일정했나요? 회전수와 반지름은 어떻게 측정했나요?'},
  cpAgreement:{label:'실험 과정 돌아보기',text:'측정 구간 동안 회전은 일정했나요? 회전수와 반지름을 측정할 때 어떤 점에 주의했나요? 내가 지킨 실험 방법이 두 결과의 일치에 어떻게 도움이 되었는지 자료와 연결해 보세요.'},
  cpAccuracy:{label:'일치와 정확성 구분하기',text:'두 값이 실제보다 함께 크거나 작게 나와도 서로 비슷할 수 있어요. 반복 측정은 결과의 일관성을 확인하는 데 도움이 돼요. 정확성을 살피려면 센서 상태와 측정 방법을 점검하거나, 신뢰할 수 있는 기준과 비교할 방법도 생각해 보세요.'},
};

export function createCentripetalComparison(host,{note,input,help,fieldNames,signal}) {
  const card=key=>`<section class="cp-result-card" data-cp-result-card="${key}"><h3>${fieldNames[key]}</h3><strong class="cp-result" data-cp-${key}-result><span data-cp-result-value>—</span><small>${unitHtml('m/s²')}</small></strong><button type="button" class="cp-calculation-link" data-cp-revisit="${key}" aria-label="${fieldNames[key]} 계산 확인">계산 확인</button></section>`;
  host.innerHTML=`<div class="plot-heading"><h2 tabindex="-1">두 결과를 비교하고 설명해요</h2></div>
    <p data-cp-comparison-empty class="lab-note">구간·계산에서 두 계산을 완료하고 재확인 표시를 확인해 주세요.</p>
    <fieldset data-cp-comparison-fields disabled aria-label="두 구심가속도 결과 비교">
      <div class="cp-comparison-results">${card('sensor')}<div class="cp-comparison-bars"><div data-cp-compare-picture></div></div>${card('orbital')}</div>
      <section class="cp-error-analysis" aria-labelledby="cp-error-analysis-title"><h3 id="cp-error-analysis-title">오차 분석 <button type="button" class="help-trigger" data-action-help="cpDifference">?</button></h3>
        <p class="lab-note">오차 분석은 두 결과의 차이를 살펴보고 실험을 개선하는 과정이에요.</p>
        <p class="lab-note">차이와 백분율 차이를 구한 뒤, 그래프와 측정 과정에서 원인을 찾아보세요.</p>
        <div class="cp-error-inputs"><div>${input('difference')}${help('difference')}</div><div>${input('percentDifference')}${help('percentDifference')}</div></div>
      </section>
      ${note('evidenceText','두 방법으로 구한 구심가속도는 얼마나 비슷한가요?','어느 값이 더 큰지 확인하고, 차이와 백분율 차이를 이용해 얼마나 비슷한지 설명해 보세요.')}
      <div id="cp-reflection-questions">
        <button type="button" class="cp-reflection-switch" data-cp-comparison-mode="agreement" aria-controls="cp-reflection-questions">두 결과가 잘 일치했어요</button>
        <div data-cp-reflection="difference">
          <div class="cp-question cp-reflection-first"><button type="button" class="help-trigger" data-action-help="cpInterpretation">?</button>${note('differenceReason','두 결과에 차이가 생긴 이유는 무엇일까요?','그래프나 측정 과정에서 근거를 찾아 설명해 보세요.')}</div>
          <div class="cp-question"><button type="button" class="help-trigger" data-action-help="cpReexperiment">?</button>${note('improvement','생각한 원인이 오차를 잘 설명하나요? 개선하려면 실험을 어떻게 바꿔야 할까요?','그 원인은 구한 구심가속도를 더 작게 또는 크게 만들까요? 내 결과와 맞는지 살펴보고, 그 원인을 줄여 다시 실험하면 결과가 어떻게 달라질지 예상해 보세요.')}</div>
        </div>
        <div data-cp-reflection="agreement" hidden>
          <div class="cp-question cp-reflection-first"><button type="button" class="help-trigger" data-action-help="cpAgreement">?</button>${note('agreementReason','두 결과가 잘 일치한 데에는 어떤 실험 과정이 도움이 되었을까요?','측정 과정에서 주의한 점을 돌아보고, 그래프와 측정 기록을 근거로 설명해 보세요.')}</div>
          <div class="cp-question"><button type="button" class="help-trigger" data-action-help="cpAccuracy">?</button>${note('accuracyReflection','두 결과가 비슷하다는 것만으로 정확하게 측정했다고 볼 수 있을까요?','두 값이 실제보다 함께 크거나 작게 나왔을 가능성도 생각해 보세요. 정확성을 더 확인하려면 무엇을 측정하거나 비교해야 할까요?')}</div>
        </div>
      </div>
      <details><summary>나의 역할과 새롭게 시도한 점 (선택)</summary>${note('roles','모둠에서 내가 한 일과 새롭게 시도한 점')}</details>
      <div class="cp-actions cp-comparison-actions">
        <button type="button" class="primary" data-cp-export data-cp-action="evidence" disabled>결과 보고서로 내보내기</button>
      </div>
    </fieldset>`;
  const $=selector=>host.querySelector(selector),menu=$('[data-cp-export]'),fields=$('fieldset');
  return {
    render(model,{colors,writable}) {
      const ready=model.comparisonReady;
      fields.disabled=!ready;fields.inert=!ready;
      const agreement=model.sheet.comparisonMode==='agreement',switcher=$('[data-cp-comparison-mode]');
      switcher.dataset.cpComparisonMode=agreement?'difference':'agreement';
      switcher.textContent=agreement?'차이 원인 질문으로 돌아가기':'두 결과가 잘 일치했어요';
      switcher.disabled=!ready||!writable;
      for(const group of host.querySelectorAll('[data-cp-reflection]'))group.hidden=group.dataset.cpReflection!==(agreement?'agreement':'difference');
      $('[data-cp-comparison-empty]').hidden=ready;
      host.style.setProperty('--cp-sensor-color',colors.sensor);host.style.setProperty('--cp-orbit-color',colors.orbit);
      for(const key of ['sensor','orbital'])$(`[data-cp-${key}-result] [data-cp-result-value]`).textContent=ready?format(model.values[key]):'—';
      const picture=$('[data-cp-compare-picture]');
      picture.innerHTML=ready?compareSvg(model.values.sensor,model.values.orbital,colors,getComputedStyle(host).getPropertyValue('--cp-comparison-axis').trim()==='vertical'):'';
      const formulae=comparisonFormulae(ready?model.values:{},model.sheet.review);
      void setMath($('[data-cp-simple="percentDifference"]'),ready?formulae.percentDifference.simple:'',ready?formulae.percentDifference.description:'',{display:true});
      for(const key of ['difference','percentDifference']){
        for(const kind of ['general','formula'])void setMath($(`[data-cp-${kind}="${key}"]`),ready?formulae[key][kind]:'',ready?formulae[key].description:'',{display:true});
      }
      for(const input of host.querySelectorAll('[data-cp-input]')){
        const value=ready?model.sheet.inputs[input.dataset.cpInput]:'';
        if(input.value!==value)input.value=value;
        input.disabled=!ready||!writable;
      }
      if(!ready)for(const origin of host.querySelectorAll('[data-cp-origin]'))origin.textContent='';
      if(ready&&model.values.sensor===0&&model.values.orbital===0){
        $('[data-cp-input="percentDifference"]').disabled=true;
        $('[data-cp-origin="percentDifference"]').textContent='두 값의 평균이 0이므로 백분율 차이는 계산할 수 없어요.';
      }
      menu.disabled=!ready;
    },
  };
}
