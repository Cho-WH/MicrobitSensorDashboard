import { mathSvg } from '../math-view.js';
import { texNumber } from '../scientific-notation.js';
import { GRAVITY } from '../../analysis/activities/centripetal.js';
import { format } from './diagrams.js';
export const relations={sensor:String.raw`\bar{A}^{2}=a^{2}+g^{2}\quad\Rightarrow\quad a=\sqrt{\bar{A}^{2}-g^{2}}`,omega:String.raw`\omega=\frac{2\mathrm{\pi}}{T}`,orbital:String.raw`a=r\omega^{2}`};
export const relationDescriptions={sensor:'센서 가속도 평균의 제곱은 구심가속도 제곱과 수직 성분 제곱의 합. a는 A 평균의 제곱에서 g 제곱을 뺀 값의 제곱근.',omega:'각속도는 2파이를 주기로 나눈 값',orbital:'구심가속도는 반지름 곱하기 각속도의 제곱'};
// Match the worksheet's visible precision without changing its stored values.
const n=v=>texNumber(Number(format(v).replaceAll(',','')));
export const substitutions=(v,mean)=>({sensor:String.raw`a=\sqrt{${n(mean)}^{2}-${n(GRAVITY)}^{2}}\;\mathrm{m/s^{2}}`,omega:String.raw`\omega=\frac{2\mathrm{\pi}}{${n(v.period>0?v.period:null)}}\;\mathrm{rad/s}`,orbital:String.raw`a=${n(v.radius>0?v.radius:null)}\times ${n(v.omega>0?v.omega:null)}^{2}\;\mathrm{m/s^{2}}`});
let pictures;
// Show the student's operands, never the calculated answer.
export function comparisonFormulae(v,review=[]) {
  const difference=v.difference>=0&&!review.includes('difference')?v.difference:null;
  return {
    difference:{general:String.raw`\Delta a=\left|a_{\mathrm{s}}-a_{T}\right|`,formula:String.raw`\Delta a=\left|${n(v.sensor)}-${n(v.orbital)}\right|\;\mathrm{m/s^{2}}`,description:'두 구심가속도의 차이의 절댓값'},
    percentDifference:{simple:String.raw`\frac{\text{두 값의 차이}}{\text{두 값의 평균}}\times100\;\%`,general:String.raw`\frac{\Delta a}{(a_{\mathrm{s}}+a_{T})/2}\times100\;\%`,formula:String.raw`\frac{${n(difference)}}{(${n(v.sensor)}+${n(v.orbital)})/2}\times100\;\%`,description:'내가 구한 차이를 두 구심가속도의 평균으로 나눈 뒤 100을 곱한 백분율 차이'},
  };
}
export const prepareOrbitMath=()=>pictures??=(Promise.all(['omega','orbital'].map(key=>mathSvg(relations[key],{size:21,display:true,description:relationDescriptions[key]}))).catch(error=>{pictures=null;throw error;}));
