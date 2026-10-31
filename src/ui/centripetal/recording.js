import { supportsCentripetal, inputNumber } from '../../analysis/activities/centripetal.js';
import { symbolHtml, unitHtml } from '../scientific-notation.js';

// Students measure in cm; the recording and analysis contract remains metres.
export function createCentripetalRecording(root) {
  const host=root.querySelector('#centripetal-recording');
  host.innerHTML=`<div class="cp-radius-label"><label for="cp-record-radius">측정한 회전 반지름 ${symbolHtml('r')}</label><small id="cp-record-radius-hint">회전축에서 센서 칩까지의 거리</small></div><div class="cp-radius-values"><span class="input-unit cp-number-input"><input id="cp-record-radius" type="text" inputmode="decimal" maxlength="80" aria-label="기록할 회전 반지름" aria-describedby="cp-record-radius-hint" autocomplete="off"><small>${unitHtml('cm')}</small></span><span aria-hidden="true">=</span><span class="cp-measured-value"><output for="cp-record-radius" aria-label="미터로 환산한 회전 반지름"></output><small>${unitHtml('m')}</small></span></div>`;
  const input=host.querySelector('input'),output=host.querySelector('output');
  const format=value=>String(Number(value.toPrecision(15)));
  const radiusM=()=>{const cm=inputNumber(input.value);return cm!==null&&cm>0?format(cm/100):'';};
  const update=()=>{const value=radiusM();if(output.textContent!==value)output.textContent=value;};
  input.addEventListener('input',update);
  let context=null;
  function showReadouts(){for(const card of root.querySelectorAll('#live-cards .lab-card'))card.hidden=Boolean(supportsCentripetal(context)&&context.readout?.componentChannelIds.includes(card.dataset.channel));}
  return {
    setup:()=>supportsCentripetal(context)?{centripetalRadiusM:radiusM()}:{},
    render(next,store,tour=false){
      host.hidden=!supportsCentripetal(next);
      if(context!==next){context=next;const metres=inputNumber(next?.setup?.centripetalRadiusM);input.value=metres!==null&&metres>0?format(metres*100):'';}
      showReadouts();
      if(host.hidden)return;
      input.readOnly=Boolean(store?.getState())||tour;update();
    },
    dispose(){input.removeEventListener('input',update);},
    reset(){context=null;input.value='';update();host.hidden=true;},
  };
}
