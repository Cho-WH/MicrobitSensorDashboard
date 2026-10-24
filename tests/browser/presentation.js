const check=(value,message)=>{if(!value)throw new Error(message);};
function contrast(foreground,background) {
  const luminance=color=>{
    const values=color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{
      value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
    });return values[0]*.2126+values[1]*.7152+values[2]*.0722;
  };
  const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,280));
async function until(predicate,message) {
  const deadline=performance.now()+15000;
  while(!predicate()){if(performance.now()>deadline)throw new Error(message);await settle();}
}
async function open(path,width=1366,height=768) {
  const frame=document.createElement('iframe'); frame.title='표현·접근성 검토';
  frame.style.cssText=`display:block;border:0;max-width:none;width:${width}px;height:${height}px`;
  frame.src=new URL('../../'+path,import.meta.url).href; document.body.append(frame);
  try {await until(()=>frame.contentDocument?.documentElement.dataset.reviewReady || frame.contentDocument?.documentElement.dataset.preparationReviewReady,'검토 화면 로딩 시간 초과: '+path);return frame;}
  catch(error){frame.remove();throw error;}
}
async function close(frame) {
  const button=[...frame.contentDocument.querySelectorAll('footer button,.preparation-review-cleanup')].find(node=>['검토 자료 정리','검토용 자료 정리'].includes(node.textContent));
  if(button){button.click();await until(()=>frame.contentDocument.body.textContent.includes('검토용 자료를 정리했습니다.'),'검토 DB 정리 실패');}
  frame.remove();
}

export async function runPresentationPerformance(report=()=>{}) {
  {
    const frame=await open('dev/design/?sensor=accelerometer&state=paused');
    const doc=frame.contentDocument,win=frame.contentWindow,$=selector=>doc.querySelector(selector);
    const times=[],starts=new WeakMap();let redraws=0;
    const observer={id:'review-cost',beforeUpdate(chart){starts.set(chart,performance.now());},afterUpdate(chart){
      times.push(performance.now()-starts.get(chart));if(chart.canvas.id==='live-chart')redraws++;
    }};
    win.Chart.register(observer);
    try {
      const initial=JSON.stringify(win.Chart.getChart($('#live-chart')).data.datasets.map(dataset=>dataset.data));
      await new Promise(resolve=>setTimeout(resolve,1200));
      const pausedRedraws=redraws;
      check(pausedRedraws<=1,'일시정지 자료를 주기적으로 다시 그리고 있습니다.');
      check(initial===JSON.stringify(win.Chart.getChart($('#live-chart')).data.datasets.map(dataset=>dataset.data)),'정지 중 그래프 자료가 바뀌었습니다.');
      $('#resume-recording').click();await settle();
      [...doc.querySelectorAll('footer button')].find(button=>button.textContent==='10초 수신').click();
      await until(()=>$('#sample-count').textContent.includes('700'),'성능 검토 중 기록이 누락되었습니다.');
      $('#pause-recording').click();await settle();
      $('[data-view="analysis"]').click();await settle();
      const transitionStart=performance.now();$('#tab-relationship').click();await settle();
      const transition=performance.now()-transitionStart;
      const chart=win.Chart.getChart($('#analysis-chart'));
      check(chart.data.datasets[0].data.length===700,'분석 전환에서 원자료가 누락되었습니다.');
      const chartCount=Object.keys(win.Chart.instances).length;
      for(const mode of ['graph','table','split']){$(`[data-relationship-mode="${mode}"]`).click();await settle();}
      check(Object.keys(win.Chart.instances).length===chartCount,'보기 전환마다 차트가 누적됩니다.');
      const scroller=$('#raw-scroll');const scrollStart=performance.now();
      scroller.scrollTop=scroller.scrollHeight;scroller.dispatchEvent(new win.Event('scroll'));await settle();
      check($('#raw-rows [data-sample-id="700"]')&&$('#raw-rows').querySelectorAll('.sample-row').length<100,'가상 표가 마지막 자료에 도달하지 못하거나 전체 행을 생성했습니다.');
      times.sort((a,b)=>a-b);
      report(`기본 Luminous · 4채널 600→700개 · Chart update 중앙값 ${times[Math.floor(times.length/2)].toFixed(1)}ms / p95 ${times[Math.floor(times.length*.95)].toFixed(1)}ms · 분석 전환 ${transition.toFixed(0)}ms · 표 끝 이동 ${(performance.now()-scrollStart).toFixed(0)}ms · 정지 1.2초 재그리기 ${pausedRedraws}회`);
    } finally {win.Chart.unregister(observer);await close(frame);}
  }
}

export async function runPresentationAccessibility(report=()=>{}) {
  for(const [path,width] of [
    ['dev/design/?sensor=bmp280&state=paused',1366],
    ['dev/design/?sensor=accelerometer&state=paused',390],
    ['dev/design/preparation.html?sensor=bmp280&step=connection',390],
  ]) {
    const frame=await open(path+'&text=200&fallback=1&motion=reduce',width,844);
    const doc=frame.contentDocument,win=frame.contentWindow,$=selector=>doc.querySelector(selector);
    try {
      await settle();
      const fits=label=>check(doc.documentElement.scrollWidth<=width+1,`${label}: 200% 글자에서 페이지 가로 넘침 ${doc.documentElement.scrollWidth}/${width}`);
      fits(path);
      check(parseFloat(win.getComputedStyle(doc.documentElement).fontSize)===32,'200% 글자 환경이 적용되지 않았습니다.');
      check(doc.documentElement.dataset.reviewFont==='error','글꼴 실패 경로를 거치지 않았습니다.');
      check(win.matchMedia('(prefers-reduced-motion: reduce)').matches,'동작 줄이기 분기 미적용');
      const sample=$('.guide')??$('.luminous-overview');
      check(win.getComputedStyle(sample).filter==='none'&&win.getComputedStyle(sample).backdropFilter==='none','필터 대체 환경 미적용');
      for(const node of doc.querySelectorAll('.channel-option,.lab-card strong')) {
        check(contrast(win.getComputedStyle(node).color,'rgb(255,255,255)')>=4.5,'작은 채널 글자 대비 부족');
      }
      for(const dialog of doc.querySelectorAll('dialog')) {
        // Empty lazy dialogs get their heading when configured for an activity.
        if(dialog.childElementCount)check(dialog.getAttribute('aria-label') || doc.getElementById(dialog.getAttribute('aria-labelledby')),'이름 연결이 없는 대화상자');
      }
      if($('.luminous-settings')?.getClientRects().length) {
        for(const selector of ['#event-note','#live-range']) {
          const style=win.getComputedStyle($(selector));
          check(contrast(style.borderTopColor,style.backgroundColor)>=3,selector+' 입력 경계 대비 부족');
        }
        $('.luminous-settings').click();await settle();
        const dialog=$('#measurement-settings');
        check(dialog.open&&dialog.contains(doc.activeElement),'설정 창 진입 초점 누락');
        check(dialog.scrollWidth<=dialog.clientWidth+1,'확대 설정 창 가로 넘침');
        $('.luminous-close').click();await settle();
        check(doc.activeElement===$('.luminous-settings'),'설정 닫기 후 초점 복귀 누락');
        $('[data-view="analysis"]').click();await settle();$('#tab-relationship').click();await settle();fits('분석');
        $('[data-relationship-mode="table"]').click();await settle();
        const scroller=$('#raw-scroll');scroller.scrollTop=scroller.scrollHeight;scroller.dispatchEvent(new win.Event('scroll'));await settle();
        check($('#raw-rows [data-sample-id="600"]'),'확대 가상 표의 마지막 원자료 누락');
      }
      report(`${width}px ${path.includes('preparation')?'준비 B':'측정·분석'} · 글자 200% · 글꼴 실패·필터 없음·동작 줄이기 · 대비·대화상자·자료 접근`);
    } finally {await close(frame);}
  }
}
