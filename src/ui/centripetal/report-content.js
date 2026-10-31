// A report contains the student's recorded answers, never reference answers.
export function reportContent({sheet,interval,values}) {
  const units={n:'회',period:'s',radius:'m',omega:'rad/s',sensor:'m/s²',orbital:'m/s²',difference:'m/s²',percentDifference:'%'};
  const numbers=Object.fromEntries(Object.entries(units).map(([key,unit])=>{
    const value=sheet.inputs[key],number=values[key];
    const valid=key==='n'?Number.isSafeInteger(number)&&number>0
      :['radius','period','omega'].includes(key)?number>0:number!==null&&number>=0;
    const status=key==='percentDifference'&&values.sensor===0&&values.orbital===0?'계산 불가'
      :sheet.review.includes(key)?'재확인 필요':!value.trim()?'미입력':!valid?'입력 형식 확인':'';
    return [key,{value,unit,status}];
  }));
  const reflection=sheet.comparisonMode==='agreement'?['agreementReason','accuracyReflection']:['differenceReason','improvement'];
  return {mean:sheet.meanRequested?interval.mean:null,numbers,
    notes:Object.fromEntries(['thinking','orbitalThinking','evidenceText',...reflection,'roles'].map(key=>[key,sheet.inputs[key]]))};
}
