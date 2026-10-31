// Display helpers only: never parse or rewrite stored units or student inputs.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const symbolHtml = symbol => `<var class="science-symbol">${escapeHtml(symbol)}</var>`;
export const symbolSvg = symbol => `<tspan font-family="Times New Roman,serif" font-style="italic">${escapeHtml(symbol)}</tspan>`;
export const unitHtml = unit => `<span class="science-unit">${escapeHtml(unit)}</span>`;
export const valueWithUnit = (value,unit) => String(value)+(unit?'\u00a0'+unit:'');
// Keep compound units unambiguous without rewriting the saved unit vocabulary.
export const quotientUnit = (numerator,denominator) => {
  const group=unit=>/[\/·\s]/.test(unit)?`(${unit})`:unit;
  return numerator&&denominator?`${group(numerator)}/${group(denominator)}`:'';
};
export const texText = value => '\\text{'+String(value??'').replace(/[\\{}%$#&_~^]/g,c=>({'\\':'\\unicode{92}','{':'\\{','}':'\\}','%':'\\%','$':'\\$','#':'\\#','&':'\\&','_':'\\_','~':'\\unicode{126}','^':'\\unicode{94}'}[c]))+'}';
export function texNumber(value) {
  if(!Number.isFinite(value))return '\\boxed{\\phantom{0}}';
  const [base,exponent]=String(value).split('e');
  return exponent===undefined?base:`${base}\\times10^{${Number(exponent)}}`;
}
export const binaryTex = (left,op,right) => op==='/'?`\\frac{${left}}{${right}}`:op==='^'?`\\left(${left}\\right)^{${right}}`:`${left} ${op==='*'?'\\times':op} ${right}`;
