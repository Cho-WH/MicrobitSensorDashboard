import { rendered, until } from './render.js';
import { stableText } from './layout.js';
const check=(value,message)=>{if(!value)throw new Error(message);};

// Reflow the same persisted experiment, then reopen it through the library.
// This protects screen transitions without keeping separate layout fixtures.
export async function runLuminousWorkspaceTests(report=()=>{}) {
  const frame=document.createElement('iframe'); frame.title='분석·해석·저장 화면 검증';
  frame.style.cssText='display:block;border:0;max-width:none;width:1366px;height:768px';
  frame.src=new URL('../../dev/design/?sensor=bmp280&state=paused&view=relationship',import.meta.url).href;
  document.body.append(frame);
  const settle=()=>rendered(frame.contentDocument);
  try {
    await until(()=>frame.contentDocument?.documentElement.dataset.reviewReady==='paused','분석 검토 화면을 열지 못했습니다.');
    const doc=frame.contentDocument, win=frame.contentWindow, $=selector=>doc.querySelector(selector);
    const click=async selector=>{const button=$(selector);check(button&&!button.disabled,'조작할 수 없습니다: '+selector);button.click();await settle();};
    const points=()=>JSON.stringify(win.Chart.getChart($('#analysis-chart')).data.datasets[0].data);
    const original=points();
    await click('#add-right-axis'); await click('#trend-enabled'); await click('#right-trend-enabled');
    for (const [width,height] of [[2560,1440],[1920,1080],[1366,768],[1280,1039],[1024,768],[390,844],[320,700]]) {
      frame.style.width=width+'px'; frame.style.height=height+'px'; await settle();
      // All modes at desktop/mobile; other widths check the densest split layout.
      const modes=[1366,390].includes(width)?['table','graph','split']:['split'];
      for (const mode of modes) {
        await click(`[data-relationship-mode="${mode}"]`);
        check(doc.documentElement.scrollWidth<=width+1,`${width}px ${mode} 분석 화면이 페이지 밖으로 넘칩니다.`);
        if(mode!=='table') {
          const pane=$('#analysis-graph-pane');
          check(pane.getBoundingClientRect().width<=1041,'넓은 화면에서 그래프 폭 제한이 적용되지 않았습니다.');
          if(width>=1366) {
            const bottom=$('[data-screen=analysis]').getBoundingClientRect().bottom+win.scrollY+parseFloat(win.getComputedStyle(doc.body).paddingBottom);
            check(bottom<=height+2,width+'×'+height+' '+mode+': 기본 분석 화면이 '+Math.round(bottom-height)+'px 넘칩니다.');
            check($('.graph-stage').clientHeight>=240,'자료 그래프가 읽기 어려운 높이로 축소되었습니다.');
          }
          check($('#right-axis-controls').scrollWidth<=$('#right-axis-controls').clientWidth+1,'추가 축 조작이 가로로 넘칩니다.');
        }
      }
      if(width===1366) {
        const plotHeight=$('.graph-stage').clientHeight;
        frame.style.height=(height+160)+'px'; await settle();
        check($('.graph-stage').clientHeight>plotHeight,'추가된 작업 높이가 그래프에 배분되지 않았습니다.');
        frame.style.height=height+'px'; await settle();
        const chart=win.Chart.getChart($('#analysis-chart')), savedPoints=points();
        await click('#trend-details summary');
        const detail=$('#trend-detail').getBoundingClientRect(),pane=$('#analysis-graph-pane').getBoundingClientRect();
        check(detail.height>0&&detail.bottom<=pane.bottom,'펼친 통계 설명이 그래프 패널 밖에서 잘립니다.');
        check($('.graph-stage').clientHeight>=240,'상세 설명을 펼치자 그래프가 최소 높이보다 작아졌습니다.');
        await click('#trend-details summary');
        doc.documentElement.style.fontSize='200%'; await settle();
        check(doc.documentElement.scrollWidth<=width+1,'확대한 분석 조작이 가로로 넘칩니다.');
        check($('#use-graph-for-reflection').getBoundingClientRect().height>0&&$('.graph-stage').clientHeight>=240,'확대 상태에서 하단 조작이나 그래프가 사라졌습니다.');
        doc.documentElement.style.removeProperty('font-size'); await settle();
        check(points()===savedPoints&&chart===win.Chart.getChart($('#analysis-chart')),'높이 조절이 자료나 차트 인스턴스를 교체했습니다.');
      }
      await click('#tab-overview');
      if(width>=1280) {
        check(doc.documentElement.scrollHeight<=height+2,`${width}×${height}: 원 자료 보기에서 불필요한 페이지 스크롤이 생겼습니다.`);
        check($('#overview-stage').clientHeight>=240,'원 자료 그래프가 읽기 어려운 높이로 축소되었습니다.');
      }
      await click('#tab-relationship');
      await click('#use-graph-for-reflection');
      const answer=$('#reflection-observation');
      if(!answer.value) {
        answer.value='조건을 일정하게 두고 관찰한 결과입니다. '.repeat(20);
        answer.dispatchEvent(new win.Event('input',{bubbles:true}));
      }
      await settle();
      check(doc.documentElement.scrollWidth<=width+1,`${width}px 해석 화면이 페이지 밖으로 넘칩니다.`);
      check(answer.clientWidth>0&&answer.scrollWidth<=answer.clientWidth+1,`${width}px 해석 글이 옆으로 잘립니다.`);
      await click('#reflection-back');
      check(points()===original,'크기·보기 전환으로 그래프의 원자료가 바뀌었습니다.');
    }
    const answer=$('#reflection-observation').value;
    await click('[data-view="saved"]');
    await until(()=>$('#saved-runs button'),'저장한 실험이 목록에 나타나지 않습니다.');
    check(doc.documentElement.scrollWidth<=321,'작은 화면의 저장 목록이 페이지 밖으로 넘칩니다.');
    await click('[data-view="home"]');
    check($('#sensor-cards').children.length===5&&$('#activity-cards').children.length>0,'홈의 센서·활동 탐색이 누락되었습니다.');
    check(doc.documentElement.scrollWidth<=321,'작은 화면의 홈이 페이지 밖으로 넘칩니다.');
    await click('#sensor-cards a');
    check(!$('[data-screen="preview"]').hidden&&!$('#activate-experiment').disabled,'홈에서 준비 안내로 이어지지 않습니다.');
    check(doc.documentElement.scrollWidth<=321,'작은 화면의 활동 소개가 페이지 밖으로 넘칩니다.');
    await click('[data-view="saved"]');
    await until(()=>$('#saved-runs button'),'저장 목록을 다시 열지 못했습니다.');
    await click('#saved-runs button');
    await until(()=>!$('[data-screen="analysis"]').hidden,'저장한 실험을 분석으로 열지 못했습니다.');
    await click('#tab-interpretation');
    check($('#reflection-observation').value===answer,'저장 목록에서 다시 연 실험의 해석 글이 달라졌습니다.');
    check(win.Chart.getChart($('#reflection-chart')).data.datasets[0].data.length===600,'저장한 근거 그래프의 자료가 누락되었습니다.');
    report('새 분석 화면 · 가로형 1366/1920/2560에서 두 추세선·표/그래프 높이 맞춤, 작은 화면 재배치와 자료 보존');
    report('새 홈·저장 목록 · 센서/활동 탐색·미리보기·저장 실험의 근거/글 재열기');
  } finally {
    const cleanup=[...(frame.contentDocument?.querySelectorAll('footer button')??[])].find(button=>button.textContent==='검토 자료 정리');
    if(cleanup){cleanup.click();await until(()=>frame.contentDocument.body.textContent.includes('검토용 자료를 정리했습니다.'),'검토 자료 정리에 실패했습니다.');}
    frame.remove();
  }
}

// Real app + real IndexedDB, fixed simulated input. No duplicate UI or run model.
export async function runLuminousTests(report=()=>{}) {
  let frame;
  const settle=()=>rendered(frame.contentDocument);
  const cases = [['bmp280',1366,768],['bmp280',1024,768],['bmp280',390,844],['magnetometer',1366,768],['light-level',390,844]];
  try {
    for(const [sensor,width,height] of cases) {
      frame=document.createElement('iframe');frame.title='새 측정 화면 검증';frame.style.cssText='display:block;border:0;max-width:none';
      frame.style.width=width+'px';frame.style.height=height+'px';
      frame.src=new URL(`../../dev/design/?sensor=${sensor}&state=recording`,import.meta.url).href;
      document.body.append(frame);frame.scrollIntoView({block:'start'});
      await until(()=>frame.contentDocument?.documentElement.dataset.reviewReady==='recording',`${sensor} ${width}px 모의 측정 검토 화면을 열지 못했습니다.`);
      const doc=frame.contentDocument, $=selector=>doc.querySelector(selector), win=frame.contentWindow;
      try {
        check(doc.documentElement.scrollWidth<=width+1,`${sensor} ${width}px 페이지가 가로로 넘칩니다.`);
        stableText(doc,'.lab-card strong','.lab-card,.lab-chart',['—','0',sensor==='magnetometer'?'-1,000.1':sensor==='light-level'?'255':'1,000.01'],`${sensor} ${width}px 측정값`,{noScroll:true});
        const chart=()=>win.Chart.getChart($('#live-chart'));
        const canvasBox=$('#live-chart').getBoundingClientRect();
        for(const marker of doc.querySelectorAll('.measurement-event-marker button')) {
          const box=marker.getBoundingClientRect();
          check(box.top>=canvasBox.top+chart().scales.x.bottom && box.bottom<=canvasBox.bottom+1,
            `${width}px 사건 표찰이 시간축과 겹치거나 그래프 영역 밖에서 잘립니다.`);
        }
        const colors=chart().data.datasets.filter(item=>item.yAxisID&&item.type!=='scatter').map(item=>item.borderColor);
        const checked=[...doc.querySelectorAll('#display-channels input:checked')];
        const cardColors=checked.map(input=>doc.querySelector(`.lab-card[data-channel="${input.value}"]`).style.getPropertyValue('--channel-color'));
        check(cardColors.every((color,index)=>color===colors[index]),`계기와 그래프의 채널색이 다릅니다: ${cardColors} / ${colors}`);
        const menu=$('.luminous-export'), toggle=menu.querySelector('summary');
        toggle.click();check(menu.open&&!$('#export-json').disabled&&!$('#export-csv').disabled,'기록 자료의 저장 형식 메뉴를 열 수 없습니다.');
        const menuBox=$('.luminous-export-options').getBoundingClientRect();
        check(menuBox.left>=0&&menuBox.right<=width,`${width}px에서 저장 메뉴가 화면 밖으로 나갑니다.`);
        toggle.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        check(!menu.open&&doc.activeElement===toggle,'저장 메뉴의 Escape 닫기·초점 복귀 실패');
        if(width===1366&&sensor==='bmp280') {
          // Pausing may add a display-only null gap; actual sample identities/values stay fixed.
          const samples=()=>JSON.stringify(chart().data.datasets[0].data.filter(point=>point.sampleId));
          const original=samples();
          for (const text of ['같은 시각의 첫 메모','두 번째 메모 · '+ '긴 관찰 내용 '.repeat(25)+'<img src=x>']) {
            $('#event-note').value=text;$('#add-note').click();await settle();
          }
          check($('#lab-events').children.length===3&&!$('#lab-events img'),'조작 메모가 누락되거나 메모를 HTML로 해석했습니다.');
          check($('.measurement-system-events').textContent.includes('기록 시작'),'기록·수신 상태를 보조 목록에 보존하지 않았습니다.');
          const grouped=[...doc.querySelectorAll('.measurement-event-marker button')].find(button=>button.textContent.includes('외 1건'));
          check(grouped,'같은 시각의 사건을 묶지 않았습니다.');grouped.click();
          check($('.measurement-event-dialog').open&&$('.measurement-event-dialog ol').children.length===2,'묶인 사건의 개별 내용·시간을 열지 못했습니다.');
          check($('.measurement-event-dialog').textContent.includes('긴 관찰 내용'),'긴 메모의 상세 내용이 잘렸습니다.');
          $('.measurement-event-dialog > button').click();
          await until(()=>doc.activeElement===grouped,'사건 상세를 닫은 뒤 선택한 표찰로 초점이 돌아오지 않았습니다.');
          check(samples()===original,'사건 추가·상세 조회가 원자료를 바꿨습니다.');
          const eventLine=()=>parseFloat($('.measurement-event-marker i').style.left);
          const expectedRecent=chart().scales.x.getPixelForValue(-36);
          check(Math.abs(eventLine()-expectedRecent)<1,'최근 구간의 사건 표찰이 저장 시각과 다른 위치에 있습니다.');
          $('#live-range summary').click();$('[data-live-range="all"]').click();await settle();
          const firstPoint=chart().data.datasets[0].data.find(point=>point.sampleId);
          const expectedAll=chart().scales.x.getPixelForValue(firstPoint.x+23.9);
          check(Math.abs(eventLine()-expectedAll)<1,'전체 기록의 사건 표찰이 첫 수신 기준과 다릅니다.');
          $('#live-range summary').click();$('[data-live-range="recent"]').click();await settle();
          report('새 화면 · 저장 메뉴 키보드 조작·동시 사건 묶기·긴 메모 상세·시스템 이력과 원자료 보존');
          $('#pause-recording').focus();$('#pause-recording').click();
          await until(()=>doc.activeElement===$('#resume-recording'),'일시정지 뒤 키보드 초점이 재개로 이어지지 않습니다.');
          check(!$('#resume-recording').disabled,'일시정지 뒤 재개할 수 없습니다.');
          $('.luminous-settings').click();check($('#measurement-settings').open,'설정 대화상자를 열 수 없습니다.');
          $('#prepare-device').click();await settle();
          check(!$('#measurement-settings').open&&!$('[data-screen="prepare"]').hidden,'장비 준비로 이동한 뒤 모달이 남았습니다.');
          $('[data-view="measure"]').click();await settle();
          check(samples()===original,'준비 화면 왕복으로 기록 자료가 바뀌었습니다.');
          const pressure=$('#display-channels input[value="pressureHpa"]');pressure.click();await settle();pressure.click();await settle();
          check(samples()===original,'표시 항목 전환으로 측정 자료가 바뀌었습니다.');
          $('#resume-recording').click();await settle();
          const advance=[...doc.querySelectorAll('footer button')].find(button=>button.textContent==='10초 수신');advance.click();await until(()=>$('#sample-count').textContent.includes('700'),'모의 자료 추가 시간 초과');await settle();
          check($('#sample-count').textContent.includes('700'),'재개 후 새 자료가 기존 기록에 이어지지 않았습니다.');
          $('[data-view="analysis"]').click();await settle();$('[data-view="measure"]').click();await settle();
          check($('#sample-count').textContent.includes('700')&&$('#recording-status').textContent==='기록 중','분석 화면 이동으로 기록 상태가 바뀌었습니다.');
          report('새 화면 · 기록 제어·키보드 초점·설정/준비/분석 이동·채널 선택에서 기록 보존');
          const reviewButton=label=>[...doc.querySelectorAll('body > footer button')].find(button=>button.textContent===label);
          reviewButton('저장 실패 시험').click();
          await until(()=>$('[data-screen="measure"]').dataset.storageState==='error','저장 실패 상태 미표시');
          check(!$('#retry-save').hidden,'저장 실패 뒤 다시 저장 버튼이 없습니다.');
          const unsaved=samples();
          reviewButton('저장 정상화').click();
          await until(()=>$('[data-screen="measure"]').dataset.storageState==='clean','저장 재시도 실패');
          check(samples()===unsaved,'저장 재시도 중 원자료가 바뀌었습니다.');
          reviewButton('수신 끊기').click();
          await until(()=>$('[data-screen="measure"]').dataset.connectionState==='disconnected','수신 종료 상태 반영 시간 초과');await settle();
          check($('[data-screen="measure"]').dataset.connectionState==='disconnected'&&samples()===unsaved,'수신 끊김 뒤 자료 또는 연결 표시 오류');
          report('새 화면 · 저장 실패 표시·재시도·연결 종료에서 원자료 보존');
        }
        report(`새 화면 · ${sensor} ${width}×${height} · 숫자 안정성·채널색·가로 넘침 확인`);
      } finally {
        const cleanup=[...doc.querySelectorAll('footer button')].find(button=>button.textContent==='검토 자료 정리');
        cleanup?.click();if(cleanup)await until(()=>doc.querySelector('body > footer')?.textContent==='검토용 자료를 정리했습니다.','검토 자료 정리 실패');
        frame.remove();
      }
    }
  } finally {frame?.remove();}
}
