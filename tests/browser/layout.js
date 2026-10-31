import { rendered, until } from './render.js';
// Real iframe viewports keep layout checks independent of the test runner's window.
const check=(value,message)=>{if(!value)throw new Error(message);};
// Exercise changing text in the real app's cells synchronously, before the next
// mock tick. Compare boxes, not implementation classes or exact copy.
function stableText(doc,selector,targets,variants,label,{noScroll=false}={}) {
  const cells=[...doc.querySelectorAll(selector)], boxes=[...doc.querySelectorAll(targets)];
  check(cells.length&&boxes.length,label+': 검사할 표시 영역 없음');
  const originals=cells.map(cell=>cell.textContent);
  const read=()=>boxes.map(node=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
  const before=read();check(before.every(r=>r[2]>0&&r[3]>0),label+': 숨겨진 영역을 검사했습니다.');
  try {
    for(const value of variants){
      cells.forEach(cell=>cell.textContent=value);
      const after=read();
      check(after.every((r,i)=>r.every((v,j)=>Math.abs(v-before[i][j])<1)),label+': 숫자 변경으로 주변 배치가 움직입니다 ('+value+').');
      if(noScroll)check(cells.every(cell=>cell.scrollWidth<=cell.clientWidth+1),label+': 정상 범위 숫자가 칸에 맞지 않습니다 ('+value+').');
    }
  } finally {cells.forEach((cell,i)=>cell.textContent=originals[i]);}
}
export async function runLayoutTests(report=()=>{}) {
  const frame=document.createElement('iframe');frame.title='준비 화면 크기 검증';frame.style.cssText='display:block;border:0;max-width:none';document.body.append(frame);
  const settle=()=>rendered(frame.contentDocument);
  const open=async(path,width,height)=>{
    frame.style.width=width+'px';frame.style.height=height+'px';
    const url=new URL('../../'+path+'?mock=1',import.meta.url).href;
    await new Promise((resolve,reject)=>{
      const done=()=>{clearTimeout(timer);frame.removeEventListener('load',onLoad);};
      const onLoad=()=>{if(frame.contentDocument?.URL!==url)return;done();resolve();};
      const timer=setTimeout(()=>{done();reject(new Error(`${path} ${width}×${height}: 프레임 로딩 시간 초과 (${frame.contentDocument?.URL ?? '문서 없음'})`));},10000);
      frame.addEventListener('load',onLoad);frame.src=url;
    });
    const doc=frame.contentDocument, marker=path==='lab.html'?'#sensor-cards a':'.guide';
    await until(()=>doc.querySelector(marker),'홈·준비 화면 로드 실패');
    check(doc.querySelector(marker),'홈·준비 화면 로드 실패');await settle();return doc;
  };
  const fits=(doc,width,label)=>check(doc.documentElement.scrollWidth<=width+1,`${label}: 페이지 가로 넘침 ${doc.documentElement.scrollWidth}/${width}`);
  try{
    for(const [width,height] of [[1366,768],[390,844]]) {
      const home=await open('lab.html',width,height);fits(home,width,'홈');
      const doc=await open('activities/gay-lussac/',width,height), label=`${width}×${height}`;
      fits(doc,width,label+' 준비물');
      doc.querySelector('[data-guide-group="wiring"]').click();await settle();
      for(const id of ['vcc','gnd','scl','sda']){
        doc.querySelector(`[data-guide-step="${id}"]`).click();await settle();fits(doc,width,label+' 배선');
        const button=doc.querySelector('[data-guide-action="confirm"]').getBoundingClientRect();
        if(width>=1000){
          check(button.bottom<=height,`${label}: 현재 배선의 행동 버튼이 화면 밖에 있습니다.`);
          const figure=doc.querySelector('.guide-frame').getBoundingClientRect();
          check(figure.bottom<=height,`${label}: 배선 그림이 화면 밖에 있습니다 (${Math.round(figure.top)}–${Math.round(figure.bottom)}px).`);
        }
      }
      doc.querySelector('[data-guide-group="placement"]').click();await settle();fits(doc,width,label+' 용기');
      doc.querySelector('#to-measure').click();await settle();fits(doc,width,label+' 측정');
      if(!doc.querySelector('.experiment-guide').open)doc.querySelector('#show-experiment-guide').click();
      const dialog=doc.querySelector('.experiment-guide'), bounds=dialog.getBoundingClientRect();
      check(bounds.left>=-1&&bounds.right<=width+1&&bounds.bottom<=height+1,`${label}: 실험 안내가 화면 밖에 있습니다.`);
      check(dialog.scrollWidth<=dialog.clientWidth+1,`${label}: 실험 안내 내부 가로 넘침`);
      for(const button of doc.querySelectorAll('.experiment-guide-pages button')){button.click();await settle();fits(doc,width,label+' 안내');}
      doc.querySelector('.experiment-guide-close').click();
      report(`홈·준비·측정·활동 안내 배치 ${label}`);
    }
    // Shared numeric layout uses one four-channel sensor at two representative widths.
    for(const [width,height] of [[1366,768],[390,844]]) {
      const doc=await open('sensors/magnetometer/',width,height),label='magnetometer '+width+'px';
      doc.querySelector('[data-guide-group="connection"]').click();await settle();
      check(doc.querySelector('.guide-reception').hidden,label+': 연결 전 빈 수치 표시');
      doc.querySelector('[data-guide-action="connect"]').click();
      await until(()=>doc.querySelector('.tour-device-option input')&&!doc.querySelector('.tour-device-option').hidden,label+': 예시 장치 탐색 시간 초과',5000);
      doc.querySelector('.tour-device-option input').click();
      doc.querySelector('.tour-device-dialog button.primary').click();
      await until(()=>doc.querySelector('.magnetic-preparation').dataset.phase==='choice',label+': 보정 선택 시간 초과',5000);await settle();
      fits(doc,width,label+' 보정 선택');
      const buttons=[...doc.querySelectorAll('[data-device-action]')].map(node=>node.getBoundingClientRect());
      check(buttons.every(r=>r.width>0&&r.left>=0&&r.right<=width),label+': 보정 선택 버튼 넘침');
      doc.querySelector('[data-device-action="skip"]').click();await settle();
      check(!doc.querySelector('.guide-reception').hidden,label+': 생략 후 수치 표시 누락');
      const variants=['—','0','-999.9','-1,000.1'];
      stableText(doc,'.guide-value strong','.guide-value,.guide-last-received,.guide-checks',variants,label+' 준비 값',{noScroll:true});
      doc.querySelector('#to-measure').click();await settle();
      doc.querySelector('.experiment-guide [data-guide-next]').click();await settle();
      stableText(doc,'.lab-card strong','.lab-card,.lab-chart,.live-chart-heading',variants,label+' 측정 값',{noScroll:true});
      stableText(doc,'.lab-card strong','.lab-card,.lab-chart',['-123,456,789.123456','—'],label+' 긴 가져온 값');
      fits(doc,width,label);
      report('네 채널 대표 센서 '+width+'px · 준비·측정의 부호/자릿수/긴 값 변화에서 배치 유지');
    }
  }finally{frame.remove();}
}
