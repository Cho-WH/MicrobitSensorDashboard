// Real iframe viewports keep layout checks independent of the test runner's window.
const check=(value,message)=>{if(!value)throw new Error(message);};
const settle=()=>new Promise(resolve=>setTimeout(resolve,260));
// Exercise changing text in the real app's cells synchronously, before the next
// mock tick. Compare boxes, not implementation classes or exact copy.
export function stableText(doc,selector,targets,variants,label,{noScroll=false}={}) {
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
  const open=async(path,width,height)=>{
    frame.style.width=width+'px';frame.style.height=height+'px';
    const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
    frame.src=new URL('../../'+path+'?mock=1',import.meta.url).href;await loaded;
    const doc=frame.contentDocument, deadline=performance.now()+10000, marker=path==='lab.html'?'#sensor-cards a':'.guide';
    while(!doc.querySelector(marker)&&performance.now()<deadline)await settle();
    check(doc.querySelector(marker),'홈·준비 화면 로드 실패');await settle();return doc;
  };
  const fits=(doc,width,label)=>check(doc.documentElement.scrollWidth<=width+1,`${label}: 페이지 가로 넘침 ${doc.documentElement.scrollWidth}/${width}`);
  try{
    for(const [width,height] of [[1366,768],[1920,1080],[390,844],[683,384]]) {
      const home=await open('lab.html',width,height);fits(home,width,'홈');
      const cards=[...home.querySelectorAll('#sensor-cards a')];check(cards.length===5,'홈 센서 카드 누락');
      if(width>=1000){
        const bounds=cards.map(card=>card.getBoundingClientRect());
        check(new Set(bounds.map(rect=>Math.round(rect.top))).size<=2,'데스크톱 센서 카드가 두 줄을 넘습니다.');
        check(bounds.every(rect=>rect.bottom<=height),'데스크톱 센서 카드가 첫 화면 밖에 있습니다.');
      }
      const doc=await open('activities/gay-lussac/',width,height), label=`${width}×${height}`;
      fits(doc,width,label+' 준비물');
      doc.querySelector('[data-guide-group="wiring"]').click();await settle();
      const positions=[];
      for(const id of ['vcc','gnd','scl','sda']){
        doc.querySelector(`[data-guide-step="${id}"]`).click();await settle();fits(doc,width,label+' 배선');
        const button=doc.querySelector('[data-guide-action="confirm"]').getBoundingClientRect();positions.push(button.top);
        if(width>=1000){
          check(button.bottom<=height,`${label}: 현재 배선의 행동 버튼이 화면 밖에 있습니다.`);
          const figure=doc.querySelector('.guide-frame').getBoundingClientRect();
          check(figure.bottom<=height,`${label}: 배선 그림이 화면 밖에 있습니다 (${Math.round(figure.top)}–${Math.round(figure.bottom)}px).`);
        }
      }
      if(width>=1000)check(Math.max(...positions)-Math.min(...positions)<3,`${label}: 배선 단계마다 버튼 높이가 바뀝니다.`);
      doc.querySelector('[data-guide-group="placement"]').click();await settle();fits(doc,width,label+' 용기');
      doc.querySelector('#to-measure').click();await settle();fits(doc,width,label+' 측정');
      if(!doc.querySelector('.experiment-guide').open)doc.querySelector('#show-experiment-guide').click();
      const dialog=doc.querySelector('.experiment-guide'), bounds=dialog.getBoundingClientRect();
      check(bounds.left>=-1&&bounds.right<=width+1&&bounds.bottom<=height+1,`${label}: 실험 안내가 화면 밖에 있습니다.`);
      check(dialog.scrollWidth<=dialog.clientWidth+1,`${label}: 실험 안내 내부 가로 넘침`);
      for(const button of doc.querySelectorAll('.experiment-guide-pages button')){button.click();await settle();fits(doc,width,label+' 안내');}
      doc.querySelector('.experiment-guide-close').click();
      report(`홈·준비·측정·활동 안내 배치 ${label}${width===683?' (1366 화면의 200% 확대에 해당하는 CSS 영역)':''}`);
    }
    for(const [width,height] of [[1366,768],[1920,1080],[390,844],[683,384]]){
      for(const sensor of ['bmp280','magnetometer','temperature','light-level','accelerometer']){
        const path=`sensors/${sensor}/`, doc=await open(path,width,height),label=sensor+' '+width+'px';fits(doc,width,label);
        if(width===390){
          for(const group of doc.querySelectorAll('[data-guide-group]')){group.click();await settle();fits(doc,width,label);}
          if(sensor!=='bmp280')check(!doc.querySelector('iframe').src,label+': 내장 센서 화면이 3D 자원을 열었습니다.');
        }
        doc.querySelector('[data-guide-group="connection"]').click();await settle();
        const variants=sensor==='bmp280'?['—','0','999.99','1,000.01']:sensor==='magnetometer'?['—','0','-999.9','-1,000.1']:sensor==='accelerometer'?['—','0','999','-1,024','-9,999']:['—','0','99','100','255'];
        stableText(doc,'.guide-value strong','.guide-value,.guide-last-received,.guide-checks',variants,label+' 준비 값',{noScroll:true});
        doc.querySelector('#to-measure').click();await settle();
        stableText(doc,'.lab-card strong','.lab-card,.lab-chart,.live-chart-heading',variants,label+' 측정 값',{noScroll:true});
        stableText(doc,'.lab-card strong','.lab-card,.lab-chart',['-123,456,789.123456','—'],label+' 긴 가져온 값');
        stableText(doc,'.lab-status strong','.lab-identity,.lab-status > span,.lab-toolbar',['준비','기록 마감 중','기록 시작 전'],label+' 상태');
        doc.querySelector('[data-view="analysis"]').click();await settle();
        stableText(doc,'#overview-readout','.overview-readout,.overview-actions',[
          '00:00 · 값 0 mg','00:12 · X 성분 -1,024 mg · Y 성분 999 mg · Z 성분 -9,999 mg · 가속도 크기 1,234 mg',
          '가져온 열 -123456789.123456 kg · '.repeat(16)
        ],label+' 그래프 읽기');
        fits(doc,width,label);
      }
      report(`다섯 센서 ${width}px · 준비·측정·상태·분석의 부호/자릿수/긴 값 변화에도 칸과 그래프 위치 유지`);
    }
  }finally{frame.remove();}
}
