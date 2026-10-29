import { rendered, until } from './render.js';
import { mountLabFixture, clickVisible } from './lab-fixture.js';
import { createGuideView } from '../../src/ui/guide-view.js';
import { getExperiment } from '../../src/catalog/index.js';
import gas from '../../src/catalog/activities/gay-lussac/index.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const waitFor = async predicate => {
  const deadline = performance.now() + 12000;
  while (!predicate() && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  check(predicate(), '3D 안내의 준비 또는 복구 응답을 받지 못했습니다.');
};

// Actual UI, controller facts injected explicitly. This does not claim physical USB/BLE verification.
export async function runGuideTests(report = (_message) => {}) {
  const fixture=await mountLabFixture({component:true});fixture.showScreen('prepare');
  const host=fixture.host.querySelector('#guide-host');
  const errors = [], changes = [], connections=[],deviceActions=[]; let disconnects = 0, installs = 0, measurements = 0;
  const view = createGuideView(host, { onChange: value => changes.push(value), onError: error => errors.push(error),
    onDisconnect: () => disconnects++, onInstall: () => installs++, onConnect: options=>connections.push(options), onMeasure:()=>measurements++,onDeviceAction:action=>deviceActions.push(action) });
  const $ = selector => host.querySelector(selector);
  const step = id => { const item=view.getProgress().steps.find(item=>item.id===id);check(item,`준비 단계 ${id} 없음`);clickVisible($(`[data-guide-group="${item.group}"]`));const node=$(`[data-guide-step="${id}"]`);if(node.getClientRects().length)clickVisible(node); };
  const click = id => { const node = $(`[data-guide-action="${id}"]`); check(node && !node.hidden && !node.disabled, `${id} 조작을 실행할 수 없음`); clickVisible(node); };
  try {
    for(const sensor of ['magnetometer','temperature','light-level','accelerometer']){
      view.open(getExperiment(sensor),{reset:true});
      const images=[...host.querySelectorAll('.equipment-illustrated img')];
      check(images.length>0,`${sensor}: 준비물 이미지 누락`);
      await Promise.all(images.map(image=>image.decode()));
      check(images.every(image=>image.naturalWidth>0&&image.alt),`${sensor}: 장치 이미지 또는 대체 설명 누락`);
      click('confirm');
      check(!$('.guide-program').hidden&&$('[data-guide-step="program"]').getAttribute('aria-current')==='step','준비물 확인 후 USB 확인을 거치지 않고 설치 화면에 진입해야 합니다.');
      check(!$('[data-guide-step="usb"]')&&$('[data-guide-action="install"]').checkVisibility()&&$('[data-guide-action="program-confirm"]').checkVisibility(),'통합 설치 화면의 설치·기설치 조작이 누락되었습니다.');
      const usbImage=$('.guide-usb-image');await usbImage.decode();
      check(usbImage.checkVisibility()&&usbImage.naturalWidth>0&&usbImage.alt,'기본 준비 화면의 USB 안내 그림 또는 대체 설명 누락');
      step('connection');check(!$('.guide-power').hidden,'연결 단계의 배터리 안내 누락');
      clickVisible($('.guide-power summary'));check($('.guide-power').open,'배터리 안내를 펼칠 수 없습니다.');
      check(!$('canvas')&&!$('iframe').getAttribute('src'),'정지 이미지 안내에서 3D가 실행됩니다.');
    }
    report('내장 센서 4종 · 공통 준비물·배터리와 기본 USB 안내 그림 로딩');
    view.open(getExperiment('magnetometer'),{reset:true});
    const facts={attemptId:'mag-1',connected:true,canInstall:true,canConnect:true};
    const showPhase=(phase,calibration='unknown',receptionReady=false)=>view.render({...facts,calibration,receptionReady,devicePreparation:{phase,calibration,allowReadings:phase==='receiving'}});
    showPhase('handshake');step('connection');
    check($('[data-guide-action="next"]').hidden,'장치 응답으로 자동 진행되는 연결 단계에 다음 버튼이 남았습니다.');
    check(!$('[data-guide-step="vcc"]')&&!$('iframe').getAttribute('src'),'내장 센서에 외장 배선 자원이 나타났습니다.');
    check($('.guide-reception').hidden&&!$('.guide-sensor-preparation').hidden,'응답 대기에 빈 수치 칸이 나타납니다.');
    showPhase('choice');check($('[data-guide-step="calibration"]').getAttribute('aria-current')==='step','선택 안내 자동 전환 실패');
    check($('[data-guide-action="confirm"]').hidden,'장치 보정을 직접 완료 처리하는 버튼이 남았습니다.');
    $('[data-device-action="calibrate"]').focus();clickVisible($('[data-device-action="calibrate"]'));
    check(deviceActions.at(-1)==='calibrate','보정 명령 콜백 누락');
    showPhase('starting');showPhase('calibrating');
    check($('.guide-reception').hidden&&$('.magnetic-actions').hidden,'보정 중 수치/선택 버튼이 노출됩니다.');
    check($('[data-guide-action="next"]').hidden,'보정 완료 응답으로 자동 진행되는 단계에 다음 버튼이 남았습니다.');
    check(document.activeElement===$('.magnetic-preparation h4'),'보정 선택 후 초점이 사라집니다.');
    showPhase('receiving','device-reported');
    check($('[data-guide-step="reception"]').getAttribute('aria-current')==='step'&&!$('.guide-reception').hidden,'완료 후 수신 안내 자동 전환 실패');
    check(document.activeElement===$('.step-title'),'완료 후 숨겨진 보정 패널에 초점이 남았습니다.');
    check(!view.getProgress().canMeasure,'완료 신호만으로 수신 검사를 통과했습니다.');
    showPhase('receiving','device-reported',true);click('measure');
    check(measurements===1&&!view.getProgress().ready,'준비 체크와 수신에 따른 측정 허용이 분리되지 않았습니다.');
    for(const id of ['equipment','program']){step(id);click(id==='program'?'program-confirm':'confirm');}
    check(view.getProgress().ready&&view.getProgress().setup.calibration==='device-reported','장치 보정 근거가 반영되지 않았습니다.');
    facts.attemptId='mag-skip';showPhase('choice');step('calibration');clickVisible($('[data-device-action="skip"]'));
    check(deviceActions.at(-1)==='skip','생략 명령 콜백 누락');showPhase('skipping');showPhase('receiving','skipped',true);
    check(view.getProgress().canMeasure&&!view.getProgress().steps.find(step=>step.id==='calibration').complete,'생략이 완료로 둔갑하거나 측정을 차단했습니다.');
    check(view.getProgress().setup.calibration==='skipped'&&$('.step-description').textContent.includes('생략'),'생략 이력 또는 안내 누락');
    check($('.guide-checks .skipped')&&!$('.guide-checks .skipped').classList.contains('complete'),'수신 확인에 보정 생략이 완료로 표시됩니다.');
    click('next');check($('.guide-summary .skipped')&&!$('.guide-summary .skipped').textContent.includes('✓'),'준비 결과에 보정 생략 표시 누락');
    view.render({ attemptId: 'mag-2', connected: false, receptionReady: false, connecting: true, busy: true, deviceMessage: 'micro:bit를 연결하는 중…' });
    check(!view.getProgress().ready, '새 연결 시도가 이전 보정·수신 확인을 재사용했습니다.');
    step('connection'); click('disconnect'); check(disconnects === 1, '연결 중 취소를 실행하지 못했습니다.');
    check($('.guide-connection-status').textContent.includes('연결하는 중'), '실제 연결 상태를 표시하지 않았습니다.');
    view.render({attemptId:'mag-timeout',connected:false,canConnect:true,canReconnect:true,
      deviceMessage:'자기장 프로그램의 응답이 없어요. 최신 프로그램을 설치하고 다시 연결하세요.'});
    check(!$('.guide-connection-status').hidden&&$('.guide-connection-status').textContent.includes('응답이 없어요'),'응답 시간 초과의 복구 안내가 숨겨졌습니다.');
    check($('.guide-reception').hidden&&$('.magnetic-actions').hidden&&!view.getProgress().canMeasure,'응답 실패 뒤 수치·보정 선택·측정 허용이 남았습니다.');
    click('reconnect');check(connections.at(-1).reuseDevice===true&&connections.at(-1).reconnecting===true,'이전 장치 재연결의 장치 선택 또는 사용자 목적이 누락되었습니다.');
    click('connect');check(connections.at(-1).reuseDevice===false,'다른 장치 선택이 이전 장치를 재사용했습니다.');
    report('실제 준비 UI · 자기장 보정 근거·새 연결 무효화·연결 취소·응답 시간 초과 안내와 재연결');

    view.open(getExperiment('bmp280'), { reset: true });
    const bmpImages=[...host.querySelectorAll('.equipment-illustrated img')];
    await Promise.all(bmpImages.map(image=>image.decode()));
    check(bmpImages.length>0&&bmpImages.every(image=>image.naturalWidth>0&&image.alt),
      'BMP280 준비물 그림 또는 대체 설명이 누락되었습니다.');
    check($('.guide-power').hidden&&!$('iframe').getAttribute('src'),'BMP280 준비물에서 연결 안내 또는 3D가 실행됩니다.');
    view.render({ attemptId: 'bmp-1', connected: false, receptionReady: false, canInstall: true,
      programmerState: { status: 'error', message: 'USB 전송을 마치지 못했어요.', progress: null } });
    check(!view.getProgress().observations.programUserConfirmed, '새 준비가 이전 프로그램 확인을 복원했습니다.');
    step('program'); check($('.guide-device-status').textContent.includes('마치지'), 'USB 실패 원인을 표시하지 않았습니다.');
    click('install'); check(installs === 1, 'USB 재시도 콜백이 실행되지 않았습니다.');
    view.render({ attemptId: 'bmp-1', connected: false, busy: true, programmerState: { status: 'flashing', progress: 42, message: '프로그램 설치 중', deviceName: 'micro:bit V2' } });
    check($('.guide-program progress').value===42&&!$('.guide-program progress').hidden, 'USB 진행률을 표시하지 않았습니다.');
    check($('[data-guide-action="program-confirm"]').disabled, '설치 중에 수동 프로그램 확인을 허용했습니다.');
    check($('.guide-program').getAttribute('aria-busy')==='true','설치 진행 상태가 접근성 트리에 반영되지 않습니다.');
    view.render({attemptId:'bmp-1',connected:false,firmwareInstalled:getExperiment('bmp280').firmware,programmerState:{status:'success'}});
    check(!view.getProgress().canMeasure&&$('.guide-program').dataset.state==='success','USB 설치만으로 측정 준비를 완료했습니다.');
    step('connection');
    const latest={values:{temperatureC:22,pressureHpa:1001},validity:{temperatureC:'valid',pressureHpa:'valid'}};
    view.render({attemptId:'bmp-1',connected:true,receptionReady:true,receivedAt:10000,latest});

    check($('.guide-reception').dataset.state==='receiving','새 수신 상태 누락');
    view.render({attemptId:'bmp-1',connected:true,receptionReady:false,receivedAt:10000,latest});
    check($('.guide-reception').dataset.fresh==='false'&&$('[data-guide-action="measure"]').hidden,'수신 중단 후 측정 행동이 남았습니다.');
    check($('.guide-value strong').textContent==='22','상태 갱신이 마지막 수신값을 버렸습니다.');
    view.render({attemptId:'bmp-1',connected:false,receivedAt:10000,latest});
    check($('.guide-reception').dataset.state==='disconnected','연결 해제 상태 누락');
    report('실제 준비 UI · USB 실패·진행률·재시도 표시');

    check(!$('iframe').getAttribute('src'), '배선 안내를 열기 전에 3D 자원을 요청했습니다.');
    view.render({ attemptId: 'bmp-1', connected: false, busy: false }); step('vcc');
    check($('iframe').getAttribute('src').includes('/public/viewers/bmp280/index.html'), '로컬 3D 주소가 잘못되었습니다.');
    check(getComputedStyle($('iframe')).visibility==='hidden'&&$('iframe').getBoundingClientRect().height>0,'첫 장면 적용 전에 3D가 보이거나 화면 공간이 사라집니다.');
    await waitFor(() => ['applied', 'unavailable'].includes($('.guide-model').dataset.viewerState));
    const viewerState = $('.guide-model').dataset.viewerState;
    check($('iframe').contentDocument?.querySelector('#viewport'), '원본 3D 문서를 로드하지 못했습니다.');
    if (viewerState === 'applied') {
      check($('iframe').contentDocument.querySelector('#viewport canvas'), '3D 적용 응답에 실제 canvas가 없습니다.');
      const frame=$('iframe'), model=$('.guide-model');
      check(getComputedStyle(frame).visibility==='visible','첫 적용 완료 후 3D가 보이지 않습니다.');
      for(const id of ['gnd','scl','sda','vcc']) {
        const before=frame.getBoundingClientRect(), samples=[];
        const sample=()=>{const r=frame.getBoundingClientRect();samples.push([r.x,r.y,r.width,r.height,getComputedStyle(frame).visibility]);};
        const observer=new MutationObserver(sample);observer.observe(model,{attributes:true,subtree:true,childList:true});
        try {
          clickVisible($(`[data-guide-step="${id}"]`));
          check(model.dataset.viewerState==='loading','단계 적용 대기 상태를 검사하지 못했습니다.');
          sample();await waitFor(()=>model.dataset.viewerState==='applied');sample();
          check(samples.every(r=>r.slice(0,4).every((v,i)=>Math.abs(v-[before.x,before.y,before.width,before.height][i])<1)&&r[4]==='visible'),`${id}: 단계 적용 도중 3D 위치·크기·표시가 흔들립니다.`);
        } finally { observer.disconnect(); }
      }
      click('right'); await waitFor(() => $('.guide-model').dataset.viewerState === 'applied');
      click('detail'); await waitFor(() => $('.guide-model').dataset.viewerState === 'applied');
    }
    $('iframe').dispatchEvent(new Event('error'));
    check($('.guide-model').dataset.viewerState === 'unavailable', '3D 실패 상태를 표시하지 않았습니다.');
    check($('.guide-wiring tbody').rows.length === 4 && !$('.guide-model').hidden, '3D 실패 시 배선 표가 사라졌습니다.');
    click('confirm'); check(view.getProgress().steps.find(item => item.id === 'vcc').complete, '3D 실패 후 배선 확인을 계속하지 못했습니다.');
    check($('[data-guide-step="gnd"]').getAttribute('aria-current')==='step'&&document.activeElement===$('.step-title'),'확인 후 다음 단계/제목 초점 이동 실패');
    click('previous');check(!view.getProgress().steps.find(item=>item.id==='gnd').complete,'이전/탐색만으로 준비 완료');
    click('retry-model');
    check(getComputedStyle($('iframe')).visibility==='hidden'&&$('iframe').getBoundingClientRect().height>0,'재시도 첫 장면의 표시 보호 또는 공간 유지가 누락되었습니다.');
    await waitFor(()=>['applied','unavailable'].includes($('.guide-model').dataset.viewerState));
    if($('.guide-model').dataset.viewerState==='applied')check(getComputedStyle($('iframe')).visibility==='visible','재시도 완료 후 3D가 숨겨져 있습니다.');
    report(`실제 준비 UI · 원본 3D 지연 로드(${viewerState === 'applied' ? 'WebGL 적용·네 배선 전환 중 위치 유지' : '배선 표 복구'})·첫 표시 보호·실패 후 준비 계속·재시도`);

    view.open(getExperiment('bmp280','gay-lussac'),{reset:true,prepared:true});
    view.render({attemptId:'activity',connected:false});
    check($('[data-guide-action="quick-confirm"]').disabled,'준비된 장치 확인을 생략했습니다.');
    for(const checkbox of host.querySelectorAll('[data-quick-confirm]')){checkbox.checked=true;checkbox.dispatchEvent(new Event('change'));}
    click('quick-confirm');check(!view.getProgress().ready,'빠른 준비만으로 수신/배터리/배치까지 통과했습니다.');
    step('placement');check(!$('.guide-step-image').hidden&&$('.guide-model').hidden,'용기 배치에 배선 모델이 표시되었습니다.');
    click('confirm');check($('[data-guide-action="measure"]').disabled,'새 수신 없이 준비 결과에서 측정 이동을 허용했습니다.');
    view.render({attemptId:'activity',connected:true,receptionReady:true});
    click('measure');check(measurements===2&&!view.getProgress().steps.find(item=>item.id==='battery').complete,'수신 후 측정 이동이 배터리 확인에 막히거나 확인 이력을 조작했습니다.');
    view.render({attemptId:'activity',connected:true,receptionReady:false});
    check($('[data-guide-action="measure"]').disabled,'수신이 멈춰도 측정 이동이 활성화되어 있습니다.');
    step('battery');view.render({attemptId:'activity',connected:false,canConnect:true,canReconnect:true});
    check(!$('[data-guide-action="reconnect"]').hidden,'배터리 검사 중 끊긴 장치의 복구 경로 누락');
    report('실제 준비 UI · 체크 이력과 측정 가능 분리·수신 중단 차단·활동 배치·배터리 복구');
    const originalSteps = gas.guide.afterReception;
    try {
      gas.guide.afterReception = originalSteps.map(item => item.image ? {...item,id:'test-arrangement',image:{...item.image,caption:'검사용 단계 그림'}} : item);
      view.open(getExperiment('bmp280','gay-lussac'),{reset:true});
      step('test-arrangement');
      const figure = $('.guide-step-image');
      check(!figure.hidden && figure.querySelector('figcaption').textContent==='검사용 단계 그림','단계 이름이 바뀌면 지정한 그림이 사라집니다.');
      check(figure.querySelector('img').getAttribute('src')===gas.guide.afterReception.find(item=>item.image).image.src,'단계가 지정한 그림 대신 다른 자원을 표시했습니다.');
      step('battery');check(figure.hidden,'그림이 없는 단계에 이전 단계의 그림이 남았습니다.');
    } finally { gas.guide.afterReception = originalSteps; }
    check(errors.length === 0, errors.join('\n'));
  } finally { view.dispose(); fixture.dispose(); }
}

// Real app, isolated review DB and existing mock transport. Resize the same
// document so this protects focus/viewer lifetime as well as small-screen fit.
export async function runPreparationTests(report=()=>{}) {
  const frame=document.createElement('iframe'); frame.title='준비 B안 동작과 화면 크기 검증';
  frame.style.cssText='display:block;border:0;max-width:none;width:1366px;height:768px'; document.body.append(frame);
  const settle=()=>rendered(frame.contentDocument);
  try {
    for(const entry of ['activity=gay-lussac','sensor=magnetometer']) {
      frame.style.width='1366px';frame.style.height='768px';
      const url=new URL(`../../dev/design/preparation.html?${entry}`,import.meta.url).href;
      frame.src=url;
      await until(()=>frame.contentDocument?.URL===url&&frame.contentDocument.documentElement?.dataset.preparationReviewReady==='true',entry+': 준비 화면 로딩 실패');
      const doc=frame.contentDocument, $=selector=>doc.querySelector(selector);
      try {
        $('[data-guide-action="confirm"]').click();
        const first=$('[data-guide-group="equipment"]');
        check(first.dataset.complete==='true',entry+': 준비물 확인 누락');
        let viewerDocument;
        for(const width of [1366,390]) {
          frame.style.width=width+'px';frame.style.height=(width===390?844:768)+'px';await settle();
          for(const group of doc.querySelectorAll('[data-guide-group]')) {
            group.click();await settle();
            check(doc.documentElement.scrollWidth<=width+1,`${entry} ${width}px: 준비 단계 가로 넘침`);
            check($('[data-guide-action="previous"]').getBoundingClientRect().right<=width,entry+': 이전 버튼이 화면 밖에 있습니다.');
            if(group.dataset.guideGroup==='wiring') {
              await until(()=>['applied','unavailable'].includes($('.guide-model').dataset.viewerState),entry+': 배선 응답 없음');
              const current=$('.guide-frame').contentDocument;
              if(viewerDocument)check(viewerDocument===current,entry+': 크기 변경이 배선 뷰어를 다시 만들었습니다.');
              viewerDocument=current;
            }
          }
          $('[data-guide-group="equipment"]').click();
          const help=$('.equipment-list [data-action-help]');help.focus();help.click();await settle();
          const tooltip=doc.getElementById(help.getAttribute('aria-describedby'));
          check(tooltip?.matches(':popover-open'),entry+': 준비물 도움말이 열리지 않습니다.');
          const bounds=tooltip.getBoundingClientRect();
          check(bounds.left>=0&&bounds.right<=width+1,entry+': 도움말 가로 넘침');
          help.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
          check(doc.activeElement===help,entry+': 도움말 닫기 후 초점 손실');
          $('[data-guide-group="connection"]').click();
        }
        $('[data-guide-action="connect"]').click();
        if(entry==='sensor=magnetometer') {
          await until(()=>$('.magnetic-preparation').dataset.phase==='choice',entry+': 보정 선택 없음');
          $('[data-device-action="skip"]').click();
        }
        await until(()=>!$('[data-guide-action="measure"]').hidden&&!$('[data-guide-action="measure"]').disabled,entry+': 모의 연속 수신 확인 실패');
        check(first.dataset.complete==='true',entry+': 단계 이동이나 크기 변경이 준비 이력을 잃었습니다.');
        const measure=$('[data-guide-action="measure"]');measure.focus();frame.style.width='1366px';await settle();
        check(doc.activeElement===measure&&!measure.disabled,entry+': 크기 변경으로 초점이나 측정 가능 상태를 잃었습니다.');
        if(entry==='sensor=magnetometer')check($('.guide-checks .skipped'),'보정 생략 상태 표시 누락');
        report(`준비 B · ${entry} · 1366/390px 단계·도움말·모의 수신과 상태/초점 유지`);
      } finally {
        $('.preparation-review-cleanup').click();
        await until(()=>$('.preparation-review-cleanup').textContent.includes('정리했습니다'),entry+': 검토용 자료 정리 실패');
      }
    }
  } finally {frame.remove();}
}
