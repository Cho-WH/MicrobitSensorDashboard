import { escapeHtml } from '../scientific-notation.js';

export const fieldWarningMessages={
  radiusUnits:{text:'단위를 확인했나요? 측정한 cm를 미터 단위로 환산해서 적으세요.'},
  reviewInput:{text:'조건이 바뀌었어요. 다시 계산해 주세요. 값이 같으면 입력칸에서 Enter 키를 눌러 확인하세요.'},
  reviewCount:{text:'측정 구간이 바뀌었어요. 회전수를 다시 확인해 주세요. 값이 같으면 입력칸에서 Enter 키를 눌러 확인하세요.'},
  reviewPeriod:{text:'주기 측정에서 회전수를 확인한 뒤 주기 적용을 눌러 주세요.'},
};
export const fieldWarningButton=label=>`<button type="button" class="help-trigger field-warning" data-field-warning data-action-help="reviewInput" aria-label="${escapeHtml(label)} 안내" hidden>!</button>`;
export function setFieldWarning(container,key,{caution=false}={}) {
  const button=container.querySelector('[data-field-warning]');
  button.hidden=!key;
  if(key)button.dataset.actionHelp=key;
  container.classList.toggle('field-caution',Boolean(key&&caution));
}
