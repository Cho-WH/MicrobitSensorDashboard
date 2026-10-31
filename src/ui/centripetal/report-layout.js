import { escapeHtml as esc } from '../scientific-notation.js';
import { format, componentSvg, orbitSvg, compareSvg } from './diagrams.js';
import { relations, relationDescriptions, prepareOrbitMath } from './formulas.js';
import { mathSvg } from '../math-view.js';
import { createChartView } from '../chart-view.js';
import { getTimeAxisPolicies } from '../../catalog/index.js';
import { reportContent } from './report-content.js';

export const PAGE_WIDTH=794,PAGE_HEIGHT=1123;
const FONT='Malgun Gothic, Apple SD Gothic Neo, sans-serif';
const inks={text:'#122944',muted:'#4e6278',line:'#9aaec2',sensor:'#156082',orbit:'#b84c1b',result:'#122944'};
let lastGraph = null;

// The same fitted SVG text is used by preview, print and PNG. No truncation or reflow.
export function fitReportText(context,text,width,height,maxSize=13,weight=400) {
  const paragraphs=String(text).replace(/\r\n?/g,'\n').split('\n');
  const wrap=size=>{
    context.font=`${weight} ${size}px ${FONT}`;
    return paragraphs.flatMap(paragraph=>{
      const lines=[];let line='';
      for(const char of paragraph){
        if(line&&context.measureText(line+char).width>width){
          const space=line.lastIndexOf(' '),split=space>0?space+1:line.length;
          lines.push(line.slice(0,split));line=line.slice(split);
        }
        line+=char;
      }
      lines.push(line);return lines;
    });
  };
  const full=wrap(maxSize);
  if(full.length*maxSize*1.55<=height)return {size:maxSize,lines:full};
  let low=.001,high=maxSize;
  for(let n=0;n<18;n++){const middle=(low+high)/2,lines=wrap(middle);if(lines.length*middle*1.55<=height)low=middle;else high=middle;}
  const size=Math.floor(low*1000)/1000;
  return {size,lines:wrap(size)};
}

export async function prepareReportAssets({model,samples,context,origin,theme}) {
  const selected=samples.filter(s=>s.sampleId>=model.sheet.startId&&s.sampleId<=model.sheet.endId);
  if(!selected.length)throw new Error('출력할 측정 구간의 자료가 없어요.');
  const channels=context.channels.filter(c=>['accelerationStrength','magneticStrength'].includes(c.id));
  const axisPolicies=getTimeAxisPolicies(context);
  const chartTheme=theme?{...theme,font:FONT,text:inks.text,grid:'#e6ecf2'}:null;
  const timeRange={startAt:model.interval.start.receivedAt,endAt:model.interval.end.receivedAt};
  // Retain only the last PNG. Compare graph inputs, not worksheet/author fields;
  // changed data, range, units or colours must never reuse a stale picture.
  const key=JSON.stringify({selected,channels,axisPolicies,origin,timeRange,theme:chartTheme});
  let graph=lastGraph?.key===key?lastGraph.graph:null;
  if(!graph){
    const plot=document.createElement('canvas');plot.width=698;plot.height=224;
    const chart=createChartView(plot,{context,channels,axisPolicies,inspect:true,tooltip:false,legendToggle:false,eventMarkers:false,responsive:false,pixelRatio:3,theme:chartTheme});
    try {chart.render(selected,0,{range:'all',origin,timeRange});graph=chart.exportPng();}finally{chart.dispose();}
    lastGraph={key,graph};
  }
  const [sensor,omega,orbital,orbitMath]=await Promise.all([
    ...['sensor','omega','orbital'].map(key=>mathSvg(relations[key],{size:16,display:true,description:relationDescriptions[key]})),prepareOrbitMath(),
  ]);
  return {graph,sensor,omega,orbital,orbitMath};
}

export function renderReportPages({model,origin,createdAt},assets) {
  const {sheet,interval:i,values:v}=model,agreement=sheet.comparisonMode==='agreement',content=reportContent(model);
  const measure=document.createElement('canvas').getContext('2d');
  let smallest=13;
  const rule=(x,y,w)=>`<path d="M${x} ${y}h${w}" stroke="${inks.line}"/>`;
  const box=(x,y,w,h,fill='#fff')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${inks.line}"/>`;
  function text(value,x,y,w,h,size=13,weight=400,color=inks.text){
    const fitted=fitReportText(measure,String(value??''),w,h,size,weight);
    if(fitted.size<size)smallest=Math.min(smallest,fitted.size);
    return `<text fill="${color}" font-size="${fitted.size}" font-weight="${weight}" xml:space="preserve">${fitted.lines.map((line,n)=>`<tspan x="${x}" y="${y+fitted.size+(n*fitted.size*1.55)}">${esc(line)}</tspan>`).join('')}</text>`;
  }
  function student(key){
    const item=content.numbers[key];
    return {...item,value:item.value||'미작성',status:item.status==='미입력'?'':item.status};
  }
  function quantity(value,unit,x,y,w,h,size=14,weight=600,color=inks.text){
    const number=String(value),gap=5;
    measure.font=`${weight} ${size}px ${FONT}`;
    const numberWidth=measure.measureText(number).width;
    measure.font=`400 ${size*.72}px ${FONT}`;
    const scale=Math.min(1,w/(numberWidth+gap+measure.measureText(' '+unit).width),h/(size*1.55));
    if(scale<1)smallest=Math.min(smallest,size*scale);
    return `<text x="${x}" y="${y+size*scale}" fill="${color}" font-size="${size*scale}" font-weight="${weight}" xml:space="preserve"><tspan>${esc(number)}</tspan><tspan x="${x+(numberWidth+gap)*scale}" font-size="${size*.72*scale}" font-weight="400"> ${esc(unit)}</tspan></text>`;
  }
  function value(key,label,unit,x,y,w=334){
    const item=student(key),numberWidth=w-158;
    return text(label,x,y+6,145,26,12)+box(x+150,y,numberWidth,36)+quantity(item.value,unit,x+158,y+6,numberWidth-16,24)+ (item.status?text(item.status,x+154,y+37,numberWidth,12,8,400,'#a33232'):'');
  }
  let pictureId=0;
  const embed=(svg,x,y,w,h)=>{
    const prefix=`cp-report-${++pictureId}-`;
    return svg.replace(/<svg\b([^>]*)>/,(_,attrs)=>`<svg${attrs.replace(/ (?:width|height|x|y|preserveAspectRatio)="[^"]*"/g,'')} x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">`)
      .replace(/id="([^"]+)"/g,(_,id)=>`id="${prefix}${id}"`).replace(/url\(#([^)]+)\)/g,(_,id)=>`url(#${prefix}${id})`).replace(/href="#([^"]+)"/g,(_,id)=>`href="#${prefix}${id}"`);
  };
  const math=(asset,x,y,w,h)=>{
    const scale=Math.min(1,w/asset.width,h/asset.height),width=asset.width*scale,height=asset.height*scale;
    return embed(asset.svg,x+(w-width)/2,y+(h-height)/2,width,height);
  };
  const date=Number.isFinite(createdAt)?new Date(createdAt).toLocaleDateString('ko-KR'):'';
  const authorField=(label,key,x,width)=>text(label,x,119,28,20,11,400,inks.muted)
    +text(sheet.inputs[key]?.trim()||'—',x+34,119,width-8,20,11)
    +rule(x+30,139,width);
  function page(content,index,title){
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" role="document" aria-label="구심가속도 탐구 기록 ${index}쪽" font-family="${FONT}" color="${inks.text}"><rect width="794" height="1123" fill="white"/>${text('구심가속도 탐구 기록',48,35,698,42,30,700)}${text(`0${index}  ${title}`,48,82,470,30,21,600)}${authorField('학급','reportClass',48,100)}${authorField('학번','reportNumber',200,64)}${authorField('이름','reportName',316,130)}${text(date,605,119,141,22,11,400,inks.muted)}${rule(48,152,698)}${content}${rule(48,1070,698)}${text('센서 실험실 · 활동지 '+sheet.id,48,1081,450,20,10,400,inks.muted)}${text(`${index} / 2`,694,1081,52,20,10,400,inks.muted)}</svg>`;
  }
  function answer(label,question,key,y,h){
    return text(label,48,y,698,18,11,600,inks.sensor)+text(question,48,y+24,698,42,14,400,inks.muted)+box(48,y+72,698,h)+text(content.notes[key]||'미작성',60,y+84,674,h-24,14);
  }
  const left=48,right=412,w=334;
  const result=(key,label,x,y,color)=>{const item=student(key);return text(label,x,y,w,22,12,600,color)+box(x,y+27,w,36)+quantity(item.value,'m/s²',x+12,y+30,w-24,30,19,700,color)+(item.status?text(item.status,x,y+64,w,13,9,400,'#a33232'):'');};
  const first=text('내가 분석한 측정 구간',48,180,370,25,17,600)
    +text(`선택 구간 ${format((i.start.receivedAt-origin)/1000)}–${format((i.end.receivedAt-origin)/1000)} s · 걸린 시간 ${format(i.duration)} s`,420,182,326,22,11,400,inks.muted)
    +`<image href="${assets.graph}" x="48" y="211" width="698" height="200"/>`
    +text('가속도 측정값으로 구하기',left,431,w,27,18,600)+text('주기로 구하기',right,431,w,27,18,600)
    +rule(left,465,w)+rule(right,465,w)
    +text('센서 가속도 Ā',left,484,145,24,12)+box(left+150,477,184,36)+quantity(format(content.mean),'m/s²',left+158,483,168,24,14,600)
    +text('수직 성분 g',left,530,145,24,12)+quantity('9.8','m/s²',left+158,530,168,24,14)
    +text('센서 가속도와 수직 성분의 관계를 이용해 구심가속도를 계산한다.',left,578,w,55,12,400,inks.muted)
    +value('n','내가 센 회전수','회',right,477)+value('period','주기 T','s',right,516)+value('radius','회전 반지름 r','m',right,555)+value('omega','각속도 ω','rad/s',right,594)
    +text('관계식',left,640,w,18,11,600)+math(assets.sensor,left,662,w,28)
    +text('관계식',right,640,w,18,11,600)+math(assets.omega,right,662,150,28)+math(assets.orbital,right+175,662,150,28)
    +text('내 계산과 설명',left,696,w,18,11,600)+box(left,720,w,109)+text(content.notes.thinking||'미작성',left+12,730,w-24,89,14)
    +text('내 계산과 설명',right,696,w,18,11,600)+box(right,720,w,109)+text(content.notes.orbitalThinking||'미작성',right+12,730,w-24,89,14)
    +result('sensor','센서로 구한 구심가속도',left,843,inks.sensor)
    +result('orbital','주기로 구한 구심가속도',right,843,inks.orbit)
    +embed(componentSvg(content.mean,inks,334),left,913,w,150)
    +embed(orbitSvg(v.radius,v.orbital,inks,334,assets.orbitMath),right,913,w,150);
  const second=text('두 방법으로 구한 구심가속도',48,179,698,25,17,600)
    +box(48,218,698,170,'#f1f6fa')
    +text('센서로 구한 구심가속도',64,240,260,25,13,600,inks.sensor)+box(64,279,254,40)+quantity(student('sensor').value,'m/s²',76,281,230,36,29,700,inks.sensor)
    +text('주기로 구한 구심가속도',476,240,254,25,13,600,inks.orbit)+box(476,279,254,40)+quantity(student('orbital').value,'m/s²',488,281,230,36,29,700,inks.orbit)
    +embed(compareSvg(v.sensor,v.orbital,inks,true),348,230,96,96)
    +value('difference','두 결과의 차이','m/s²',64,337,318)+value('percentDifference','백분율 차이','%',412,337,318)
    +answer('결과 비교','두 방법으로 구한 구심가속도는 얼마나 비슷한가요?','evidenceText',403,81)
    +answer(agreement?'실험 과정 돌아보기':'차이의 원인',agreement?'두 결과가 잘 일치한 데에는 어떤 실험 과정이 도움이 되었을까요?':'두 결과에 차이가 생긴 이유는 무엇일까요?',agreement?'agreementReason':'differenceReason',575,98)
    +answer(agreement?'정확성에 대한 성찰':'설명 점검과 개선 계획',agreement?'두 결과가 비슷하다는 것만으로 정확하게 측정했다고 볼 수 있을까요?':'생각한 원인이 오차를 잘 설명하나요? 개선하려면 실험을 어떻게 바꿔야 할까요?',agreement?'accuracyReflection':'improvement',763,122)
    +text('내 역할과 새롭게 시도한 점',48,975,698,18,11,600)+box(48,999,698,60)+text(content.notes.roles||'미작성',60,1007,674,44,14);
  return {pages:[page(first,1,'측정하고 계산하기'),page(second,2,'비교하고 돌아보기')],smallest};
}
