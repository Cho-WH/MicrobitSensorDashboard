// Adapted from G's grouped guide, contextual viewer and action flow at 59c5c149.
import { getSensorPreparation } from '../catalog/index.js';
import { createGuideProgress } from '../guide/progress.js';
import { getGuideContent } from '../guide/steps.js';
import { createViewerAdapter } from '../guide/viewer-adapter.js';
import { createGuideLayout } from './guide-layout.js';
import { createActionHelp } from './action-help.js';
import { element, findElement } from './dom.js';

const provenance = { 'user-confirmed': '직접 확인했어요', 'device-observed': '장치에서 확인했어요', 'device-reported': '장치가 보정 완료를 알렸어요', simulated: '모의 수신으로 확인했어요' };
/** @param {HTMLElement} host @param {import('../guide/types.js').GuideCallbacks} callbacks */
export function createGuideView(host, callbacks = {}) {
  /** @type {import('../guide/types.js').ExperimentContext} */ let context;
  /** @type {import('../guide/types.js').GuideFacts} */ let facts = {};
  /** @type {ReturnType<typeof createGuideProgress>} */ let progress;
  /** @type {ReturnType<typeof createViewerAdapter>} */ let viewer;
  /** @type {ReturnType<typeof createGuideLayout>} */ let layout;
  /** @type {ReturnType<typeof createActionHelp>} */ let help;
  let preparationView = null, suggestion = '';
  let selectedId = '', mode = '3d', viewerState = 'idle', disposed = false, quick = false;
  let content = getGuideContent(null), contentAbort = new AbortController();
  const abort = new AbortController(), shell = element('section', 'guide');
  shell.innerHTML = `
    <div class="guide-top"><p class="guide-status" role="status"></p><button type="button" class="quiet-button" data-guide-action="quick">이미 장치가 준비되어 있나요?</button></div>
    <ol class="guide-progress" aria-label="장비 준비 단계"></ol>
    <div class="guide-layout">
      <section class="guide-visual" aria-label="현재 단계의 준비 안내">
        <div class="guide-equipment"></div>
        <div class="guide-model" hidden>
          <div class="model-toolbar"><div class="viewer-modes" role="group" aria-label="배선 보기 방식"></div><a class="viewer-large" target="_blank" rel="noopener">크게 보기 ↗</a></div>
          <div class="wiring-view-controls" role="group" aria-label="케이블 종류와 관찰 시점"></div>
          <p class="guide-model-status" role="status"></p>
          <iframe class="guide-frame" title="배선 3D 안내" hidden></iframe>
          <div class="guide-table-panel" hidden><table class="guide-wiring"><caption></caption><thead><tr><th scope="col">역할</th><th scope="col" data-wiring-board></th><th scope="col" data-wiring-sensor></th></tr></thead><tbody></tbody></table><p>보드의 단자 이름을 비교하세요. 전원을 분리한 상태에서 배선합니다.</p></div>
        </div>
        <figure class="guide-placement" hidden><img alt=""><figcaption></figcaption></figure>
        <div class="guide-device-visual" hidden></div>
        <div class="guide-sensor-preparation" hidden></div>
        <div class="guide-reception" hidden><p class="eyebrow">지금 들어오는 값</p><div class="guide-values"></div><p class="guide-last-received"></p><ol class="guide-checks"></ol><ol class="calibration-instructions" hidden></ol></div>
        <div class="guide-summary" hidden><p class="eyebrow">기록 전 마지막 확인</p><h3>준비 상태를 한눈에 확인해요</h3><ul></ul></div>
      </section>
      <section class="step-panel" aria-label="단계 설명과 확인">
        <ol class="guide-substeps" aria-label="현재 단계의 세부 순서"></ol>
        <div class="step-content"><p class="step-counter"></p><h3 class="step-title" tabindex="-1"></h3><p class="step-description"></p></div>
        <p class="guide-evidence"></p>
        <div class="guide-quick" hidden><p>실제로 준비한 항목만 확인해 주세요. 연결·수신·보정은 이어서 검사합니다.</p><div></div></div>
        <div class="guide-program" hidden><strong>프로그램 설치</strong><p class="guide-device-status" role="status"></p><progress max="100" aria-label="프로그램 설치 진행률" hidden></progress><div class="guide-program-actions"></div></div>
        <p class="guide-connection-status" role="status"></p>
        <div class="guide-device-actions"></div><div class="step-actions"></div><p class="guide-note"></p>
        <details class="wiring-note" hidden><summary></summary><p></p></details>
      </section>
    </div>`;
  host.replaceChildren(shell);
  const status = findElement(shell,'p','.guide-status'), nav = findElement(shell,'ol','.guide-progress');
  const subnav = findElement(shell,'ol','.guide-substeps'), copy = findElement(shell,'div','.step-content');
  const title = findElement(shell,'h3','.step-title'), description = findElement(shell,'p','.step-description');
  const evidence = findElement(shell,'p','.guide-evidence'), note = findElement(shell,'p','.guide-note');
  const equipment = findElement(shell,'div','.guide-equipment'), model = findElement(shell,'div','.guide-model');
  const modelStatus = findElement(shell,'p','.guide-model-status'), frame = findElement(shell,'iframe','iframe');
  const tablePanel = findElement(shell,'div','.guide-table-panel'), tableBody = findElement(shell,'tbody','.guide-wiring tbody');
  const placement = findElement(shell,'figure','.guide-placement'), deviceVisual = findElement(shell,'div','.guide-device-visual');
  const preparationHost = findElement(shell,'div','.guide-sensor-preparation');
  const reception = findElement(shell,'div','.guide-reception'), values = findElement(shell,'div','.guide-values');
  const summary = findElement(shell,'div','.guide-summary'), quickPanel = findElement(shell,'div','.guide-quick');
  const program = findElement(shell,'div','.guide-program'), deviceNotice = findElement(shell,'p','.guide-device-status');
  const connectionNotice = findElement(shell,'p','.guide-connection-status'), bar = findElement(shell,'progress','progress');
  const wiringNote = findElement(shell,'details','.wiring-note'), controls = findElement(shell,'div','.wiring-view-controls');
  /** @type {Map<string,HTMLButtonElement>} */ const buttons = new Map(), stepButtons = new Map(), groupButtons = new Map();
  /** @type {Map<string,HTMLInputElement>} */ const quickChecks = new Map();
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const locked = () => Boolean(facts.busy || facts.recording || facts.programmerState?.busy);
  const currentStep = () => progress?.getState().steps.find(step => step.id === selectedId);
  const changed = () => { paint(); callbacks.onChange?.(progress.getState()); };
  function run(action) {
    try { Promise.resolve(action()).catch(error => callbacks.onError?.(error.message ?? String(error))); }
    catch (error) { callbacks.onError?.(error.message ?? String(error)); }
  }
  function button(id, text, action, parent, className = '') {
    const node = element('button',className,text); node.type='button'; node.dataset.guideAction=id;
    node.addEventListener('click',()=>{ if (!disposed && !node.disabled) run(action); },{signal:abort.signal});
    parent.append(node); buttons.set(id,node); return node;
  }
  function select(id, focus = true) {
    if (facts.programmerState?.busy) return;
    quick=false; selectedId=id; paint();
    if (focus) title.focus({preventScroll:true});
    layout?.transition(id); layout?.syncProgress();
  }
  function next() {
    const steps=progress.getState().steps, index=steps.findIndex(step=>step.id===selectedId);
    select(steps[index+1]?.id ?? 'summary');
  }
  const actions=findElement(shell,'div','.step-actions'), deviceActions=findElement(shell,'div','.guide-device-actions');
  button('previous','← 이전',()=>{
    const steps=progress.getState().steps, index=steps.findIndex(step=>step.id===selectedId);
    select(steps[index<0 ? steps.length-1 : Math.max(0,index-1)].id);
  },actions);
  button('confirm','확인했어요',()=>{ if (!locked() && progress.confirm(selectedId)) {callbacks.onChange?.(progress.getState()); next();} },actions,'primary');
  button('next','다음 단계 →',next,actions,'primary');
  button('measure','측정 화면으로 →',()=>callbacks.onMeasure?.(),actions,'primary');
  button('quick-confirm','확인하고 연결하기 →',()=>{
    if (locked() || [...quickChecks.values()].some(input=>!input.checked)) return;
    for (const id of quickChecks.keys()) progress.confirm(id);
    callbacks.onChange?.(progress.getState()); select('connection');
  },actions,'primary');
  const programActions=findElement(shell,'div','.guide-program-actions');
  button('install','USB로 프로그램 설치',()=>callbacks.onInstall?.(),programActions,'primary');
  button('program-confirm','이미 올바른 프로그램이 있어요',()=>{
    if (!locked() && progress.confirm('program')) {callbacks.onChange?.(progress.getState()); next();}
  },programActions,'quiet-button');
  button('connect','micro:bit 연결',()=>callbacks.onConnect?.({reuseDevice:false}),deviceActions,'primary');
  button('reconnect','이전 장치에 다시 연결',()=>callbacks.onConnect?.({reuseDevice:true}),deviceActions,'primary');
  button('disconnect','연결 해제',()=>callbacks.onDisconnect?.(),deviceActions);
  button('battery','USB를 분리했어요 · 수신 검사',()=>{if (!locked() && progress.beginBatteryCheck()) changed();},deviceActions,'primary');
  const modes=findElement(shell,'div','.viewer-modes');
  button('model','3D 보기',()=>{mode='3d'; loadViewer(); paintViewer();},modes);
  button('table','배선표 보기',()=>{mode='table'; paintViewer();},modes);
  button('retry-model','3D 다시 열기',()=>{viewer?.dispose(); viewer=null; frame.removeAttribute('src'); delete frame.dataset.step; mode='3d'; loadViewer(); paintViewer();},modes);
  button('left','수–암',()=>viewer?.setCableSide('left'),controls);
  button('right','암–암',()=>viewer?.setCableSide('right'),controls);
  button('detail','단자 자세히',()=>viewer?.toggleDetail(),controls);
  button('restore','↺ 시점 복귀',()=>viewer?.restoreStep(),controls);
  const cableHelp=element('button','help-trigger','?'); cableHelp.type='button'; cableHelp.dataset.actionHelp='cable'; cableHelp.setAttribute('aria-label','케이블 끝 모양 도움말'); controls.append(cableHelp);
  const quickButton=findElement(shell,'button','[data-guide-action="quick"]');
  quickButton.addEventListener('click',()=>{if (!locked()) {quick=!quick; selectedId=quick?'quick':'equipment'; paint(); title.focus({preventScroll:true});}},{signal:abort.signal});
  function loadViewer() {
    const step=currentStep(); if (!step?.model || model.hidden || !content.viewer) return;
    if (!viewer) viewer=createViewerAdapter(frame,(state,detail)=>{
      viewerState=state; model.dataset.viewerState=state;
      buttons.get('detail').setAttribute('aria-pressed',String(detail.detail));
      buttons.get('detail').textContent=detail.detail?'전체 보기':'단자 자세히';
      for (const side of ['left','right']) buttons.get(side).setAttribute('aria-pressed',String(detail.side===side));
      if (state==='unavailable') mode='table';
      paintViewer();
    },{url:content.viewer.url,...callbacks.viewerOptions});
    if (frame.dataset.step!==step.id || viewerState==='idle') {frame.dataset.step=step.id; viewer.applyStep(step);}
  }
  function paintViewer() {
    const wire=currentStep()?.model?.wire, fallback=mode==='table';
    frame.hidden=fallback; tablePanel.hidden=!fallback;
    buttons.get('model').setAttribute('aria-pressed',String(!fallback));
    buttons.get('table').setAttribute('aria-pressed',String(fallback));
    buttons.get('model').disabled=viewerState==='unavailable';
    buttons.get('retry-model').hidden=viewerState!=='unavailable'; controls.hidden=fallback;
    for (const id of ['left','right','detail']) buttons.get(id).hidden=!wire;
    for (const id of ['left','right','detail','restore']) buttons.get(id).disabled=viewerState!=='applied';
    modelStatus.hidden=viewerState==='applied'||viewerState==='idle';
    setText(modelStatus,viewerState==='unavailable'?'3D를 열지 못했어요. 배선표로 계속 준비할 수 있어요.':'3D 안내를 불러오는 중…');
    for (const row of tableBody.querySelectorAll('tr')) {
      row.classList.toggle('is-current',row.dataset.wire===wire); row.querySelector('small').hidden=row.dataset.wire!==wire;
    }
  }
  function buildContent() {
    preparationView?.dispose(); suggestion=''; preparationHost.hidden=true;
    preparationView=getSensorPreparation(context)?.createView(preparationHost,{onAction:action=>run(()=>callbacks.onDeviceAction?.(action))})??null;
    help?.dispose(); layout?.dispose(); contentAbort.abort(); contentAbort=new AbortController();
    const signal=contentAbort.signal, steps=progress.getState().steps;
    stepButtons.clear(); groupButtons.clear(); quickChecks.clear(); nav.replaceChildren(); subnav.replaceChildren();
    delete summary.dataset.signature;
    frame.title=content.viewer?.title??'배선 3D 안내';
    const large=findElement(shell,'a','.viewer-large');
    if (content.viewer) {const url=new URL(content.viewer.url); url.searchParams.delete('embed'); large.href=url.href;} else large.removeAttribute('href');
    findElement(shell,'caption','.guide-wiring caption').textContent=content.viewer?.tableCaption??'배선표';
    findElement(shell,'th','[data-wiring-board]').textContent=content.viewer?.boardLabel??'보드';
    findElement(shell,'th','[data-wiring-sensor]').textContent=content.viewer?.sensorLabel??'센서';
    findElement(wiringNote,'summary','summary').textContent=content.viewer?.noteTitle??'';
    findElement(wiringNote,'p','p').textContent=content.viewer?.note??'';
    for (const step of steps) {
      if (!groupButtons.has(step.group)) {
        const item=element('li'), node=element('button'); node.type='button'; node.dataset.guideGroup=step.group;
        node.textContent=`${groupButtons.size+1} ${step.groupLabel}`;
        node.addEventListener('click',()=>select(step.id),{signal}); item.append(node); nav.append(item); groupButtons.set(step.group,node);
      }
      const item=element('li'), node=element('button'); node.type='button'; node.dataset.guideStep=step.id;
      node.textContent=step.model?.wire ? content.wiring.find(wire=>wire.id===step.id)?.role : ({usb:'USB 연결',program:'설치',connection:'연결',reception:'수신 확인',calibration:'보정 확인'}[step.id]??step.groupLabel);
      node.addEventListener('click',()=>select(step.id),{signal}); item.append(node); subnav.append(item); stepButtons.set(step.id,node);
    }
    for (const track of [nav,subnav]) track.addEventListener('keydown',event=>{
      const items=[...track.querySelectorAll('button')].filter(node=>!node.disabled&&!node.parentElement.hidden);
      const current=items.indexOf(/** @type {HTMLButtonElement} */(document.activeElement));
      const index=event.key==='ArrowRight'?(current+1)%items.length:event.key==='ArrowLeft'?(current-1+items.length)%items.length:event.key==='Home'?0:event.key==='End'?items.length-1:null;
      if(index===null||current<0)return;event.preventDefault();items[index].click();items[index].focus();items[index].scrollIntoView({block:'nearest',inline:'nearest'});
    },{signal});
    const messages={}; equipment.replaceChildren();
    for (const {label,items} of [{label:'측정 장치',items:content.equipment},{label:'실험 도구',items:content.activityEquipment}]) {
      if (!items.length) continue;
      const section=element('section','equipment-section'); section.append(element('h4','',label));
      const list=element('ul','equipment-list');
      for (const item of items) {
        const li=element('li'), name=element('span','',item.name), helpButton=element('button','help-trigger','?');
        const key='equipment-'+item.id; messages[key]={label:item.name,text:item.help};
        helpButton.type='button'; helpButton.dataset.actionHelp=key; helpButton.setAttribute('aria-label',item.name+' 준비 안내');
        li.append(name,helpButton); list.append(li);
      }
      section.append(list); equipment.append(section);
    }
    tableBody.replaceChildren();
    for (const wire of content.wiring) {
      const row=element('tr'); row.dataset.wire=wire.id;
      const heading=element('th','',wire.role); heading.scope='row'; heading.append(element('small','','현재 단계'));
      row.append(heading,element('td','',wire.board),element('td','',wire.sensor)); tableBody.append(row);
    }
    if (content.setupImage) {
      const img=findElement(placement,'img','img'); img.src=content.setupImage.src; img.alt=content.setupImage.alt;
      findElement(placement,'figcaption','figcaption').textContent=content.setupImage.caption;
    } else findElement(placement,'img','img').removeAttribute('src');
    values.replaceChildren(...context.channels.map(channel=>{
      const card=element('div','guide-value'), value=element('strong','','—'); value.dataset.channel=channel.id;
      card.append(element('span','',channel.name),value,element('small','',channel.unit??'')); return card;
    }));
    findElement(reception,'ol','.calibration-instructions').replaceChildren(...content.calibrationInstructions.map(text=>element('li','',text)));
    const quickFields=findElement(quickPanel,'div','div'); quickFields.replaceChildren();
    for (const step of steps.filter(item=>item.quickConfirm)) {
      const label=element('label'), input=element('input'); input.type='checkbox'; input.dataset.quickConfirm=step.id; input.checked=step.complete;
      input.addEventListener('change',paint,{signal}); label.append(input,element('span','',step.id==='program'?'이 센서에 맞는 프로그램이 설치되어 있어요':step.title)); quickFields.append(label); quickChecks.set(step.id,input);
    }
    messages.cable={label:'케이블 끝 모양',text:content.cableHelp};
    help=createActionHelp(shell,{messages});
    layout=createGuideLayout({content:copy,progress:nav,steps,measureSteps:steps.filter(step=>step.group==='wiring'),createMeasurement(step){
      const measurement=element('div','step-content'); measurement.append(element('p','step-counter','02 · 배선'),element('h3','step-title',step.title),element('p','step-description',step.description)); return measurement;
    }});
  }
  function paint() {
    if (!progress || disposed) return;
    const presentation=preparationView?.describe(facts);
    const nextSuggestion=presentation ? facts.attemptId+':'+presentation.stepId : '';
    if(nextSuggestion!==suggestion) {
      suggestion=nextSuggestion;
      if(!quick&&preparationView?.supports(currentStep())) selectedId=presentation.stepId;
    }
    const state=progress.getState(), steps=state.steps, step=currentStep(), isSummary=selectedId==='summary';
    const managed=!quick&&!isSummary&&preparationView?.supports(step);
    const leavingPanel=managed&&!presentation.hideValues&&preparationHost.contains(document.activeElement);
    preparationView?.render(facts,managed);
    const index=steps.findIndex(item=>item.id===selectedId), required=steps.filter(item=>item.required), completed=required.filter(item=>item.complete).length;
    setText(status,`${facts.mock?'모의 장치 · ':''}${state.ready?'준비 완료':state.canMeasure?'수신 확인 · 측정 가능':'준비 확인 '+completed+' / '+required.length}`);
    shell.dataset.mode=quick?'quick':isSummary?'summary':step?.group??'';
    quickButton.hidden=isSummary; quickButton.disabled=locked(); quickButton.textContent=quick?'처음부터 준비하기':'이미 장치가 준비되어 있나요?';
    for (const [group,node] of groupButtons) {
      const members=steps.filter(item=>item.group===group&&item.required), done=members.every(item=>item.complete);
      node.dataset.complete=String(done); node.classList.toggle('completed',done); node.disabled=Boolean(facts.programmerState?.busy);
      node.setAttribute('aria-label',`${members[0]?.groupLabel??group}${done?', 완료':''}`);
      if (group===step?.group) node.setAttribute('aria-current','step'); else node.removeAttribute('aria-current');
    }
    for (const item of steps) {
      const node=stepButtons.get(item.id); node.parentElement.hidden=item.group!==step?.group;
      node.dataset.complete=String(item.complete); node.disabled=Boolean(facts.programmerState?.busy);
      if (item.id===selectedId) node.setAttribute('aria-current','step'); else node.removeAttribute('aria-current');
    }
    subnav.hidden=quick||isSummary||steps.filter(item=>item.group===step?.group).length<2;
    setText(title,quick?'준비된 장치를 확인해요':isSummary?state.canMeasure?'이제 측정을 시작해 볼까요?':'연결과 수신을 확인해요':(managed?presentation.title:step?.title)??'장비 준비');
    setText(description,quick?'현재 장치의 준비 상태를 확인하고 연결하세요.':isSummary?'측정 화면에서 기록 시작을 눌러야 실험 자료가 저장됩니다.':(managed?presentation.description:step?.description)??'');
    if(leavingPanel)title.focus({preventScroll:true});
    const groupIndex=[...groupButtons.keys()].indexOf(step?.group);
    setText(findElement(copy,'p','.step-counter'),quick?'준비된 장치':isSummary?'준비 결과':`${String(groupIndex+1).padStart(2,'0')} / ${String(groupButtons.size).padStart(2,'0')} · ${step?.groupLabel}`);
    setText(evidence,step?.complete?'✓ '+(provenance[step.evidence]??'확인했어요'):'');
    equipment.hidden=!quick&&step?.id!=='equipment';
    model.hidden=quick||isSummary||!content.viewer||!content.wiring.length||step?.group!=='wiring';
    placement.hidden=quick||step?.id!=='placement'||!content.setupImage;
    const connectionStep=!quick&&!isSummary&&['connection','calibration','reception','battery'].includes(step?.kind);
    reception.hidden=!connectionStep||Boolean(managed&&presentation.hideValues);
    deviceVisual.hidden=quick||isSummary||!model.hidden||!['usb','program'].includes(step?.id);
    if (!deviceVisual.hidden&&!deviceVisual.childElementCount) deviceVisual.innerHTML='<p class="eyebrow">프로그램을 넣을 때</p>'+'<div class="usb-diagram"><span>컴퓨터</span><span aria-hidden="true">⟷</span><strong>micro:bit V2</strong></div><h4>USB 데이터 케이블로 연결해요</h4><p>충전 전용 케이블로는 설치할 수 없어요.<br>설치가 끝날 때까지 케이블을 꽂아 두세요.</p><small>측정값은 다음 단계에서 Bluetooth로 받습니다.</small>';
    if (!model.hidden&&mode==='3d') loadViewer(); paintViewer();
    if (!reception.hidden) {
      for (const channel of context.channels) {
        const value=facts.latest?.values[channel.id], valid=facts.latest?.validity[channel.id]==='valid';
        setText(values.querySelector(`[data-channel="${channel.id}"]`),valid&&Number.isFinite(value)?value.toLocaleString('ko-KR',{maximumFractionDigits:channel.digits??2}):'—');
      }
      reception.dataset.fresh=String(facts.receptionReady===true);
      setText(findElement(reception,'p','.guide-last-received'),facts.receivedAt?`${facts.receptionReady?'새 값 수신 중':'수신 확인 필요'} · 마지막 수신 ${new Date(facts.receivedAt).toLocaleTimeString('ko-KR',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'아직 받은 값이 없어요.');
      const checks=findElement(reception,'ol','.guide-checks'), checksText=[['무선 연결',Boolean(facts.connected)],['새 값 연속 수신',Boolean(facts.receptionReady)],...(content.calibrationInstructions.length?[['보정 직접 확인',state.observations.calibration!=='unknown']]:[]),...(step?.kind==='battery'?[['USB 분리 후 수신',step.complete]]:[])];
      const signature=JSON.stringify(checksText);
      if (checks.dataset.signature!==signature) {checks.dataset.signature=signature; checks.replaceChildren(...checksText.map(([label,done])=>element('li',done?'complete':'',`${done?'✓':'○'} ${label}`)));}
      findElement(reception,'ol','.calibration-instructions').hidden=!['calibration','reception'].includes(step?.kind)||!content.calibrationInstructions.length;
    }
    summary.hidden=!isSummary;
    const summarySignature=JSON.stringify(steps.map(item=>[item.id,item.complete]));
    if (isSummary&&summary.dataset.signature!==summarySignature) {
      summary.dataset.signature=summarySignature;
      findElement(summary,'ul','ul').replaceChildren(...steps.filter(item=>item.required).map(item=>{
        const li=element('li'), label=element('span','',`${item.complete?'✓':'○'} ${item.title}`), change=element('button','quiet-button',item.complete?'다시 보기':'확인하기');
        change.type='button'; change.addEventListener('click',()=>select(item.id),{signal:contentAbort.signal}); li.append(label,change); return li;
      }));
    }
    quickPanel.hidden=!quick; for (const check of quickChecks.values()) check.disabled=locked();
    program.hidden=quick||step?.kind!=='program'; const programmer=facts.programmerState??{};
    setText(deviceNotice,[programmer.message,Number.isFinite(programmer.progress)?`${Math.round(programmer.progress)}%`:'',programmer.deviceName].filter(Boolean).join(' · '));
    bar.hidden=programmer.status!=='flashing'; if (programmer.progress==null) bar.removeAttribute('value'); else bar.value=programmer.progress;
    const deviceText=connectionStep?(facts.unsupported?'이 브라우저에서는 Bluetooth 연결을 사용할 수 없어요. 지원하는 브라우저에서 연결하거나 실험 파일을 열어 분석할 수 있어요.':facts.deviceMessage??''):'';
    setText(connectionNotice,deviceText); connectionNotice.hidden=!deviceText||Boolean(managed&&facts.connected&&presentation.hideValues);
    const show=new Set(['previous']);
    if (quick) show.add('quick-confirm'); else if (isSummary) show.add('measure'); else if (!preparationView?.handlesProgression(step?.id)) {
      show.add(['manual','calibration'].includes(step?.kind) ? 'confirm' : 'next');
    }
    if (connectionStep && state.canMeasure) show.add('measure');
    if (step?.kind==='program'&&!quick) {show.add('install'); show.add('program-confirm');}
    if (connectionStep) {if (facts.connected||facts.connecting) show.add('disconnect'); else {show.add('connect'); if (facts.canReconnect) show.add('reconnect');} if (step?.kind==='battery') show.add('battery');}
    for (const id of ['previous','confirm','next','measure','quick-confirm','install','program-confirm','connect','reconnect','disconnect','battery']) {const node=buttons.get(id); node.hidden=!show.has(id); node.disabled=locked();}
    buttons.get('previous').disabled=Boolean(facts.programmerState?.busy)||(!quick&&index===0); buttons.get('previous').hidden=quick;
    buttons.get('confirm').textContent=step?.action??'확인했어요'; buttons.get('confirm').disabled ||= step?.kind==='calibration'&&!facts.connected;
    buttons.get('next').disabled=locked()||!step?.complete; buttons.get('next').textContent=index===steps.length-1?'준비 결과 보기 →':'확인했어요 · 다음 →';
    buttons.get('next').classList.toggle('primary',!show.has('measure'));
    buttons.get('measure').disabled=locked()||!state.canMeasure;
    buttons.get('quick-confirm').disabled ||= [...quickChecks.values()].some(check=>!check.checked);
    buttons.get('install').disabled ||= facts.canInstall===false||facts.mock===true||programmer.status==='unavailable';
    buttons.get('install').textContent=programmer.busy?'프로그램 설치 중…':['error','cancelled'].includes(programmer.status)?'USB 설치 다시 시도':programmer.status==='success'?'프로그램 다시 설치':'USB로 프로그램 설치';
    buttons.get('connect').disabled ||= facts.canConnect===false; buttons.get('connect').textContent=facts.canReconnect?'다른 장치 선택':facts.mock?'모의 장치 연결':'micro:bit 연결';
    buttons.get('reconnect').disabled ||= facts.canConnect===false;
    buttons.get('disconnect').textContent=facts.connecting?'연결 취소':'연결 해제'; buttons.get('disconnect').disabled=Boolean(facts.programmerState?.busy);
    buttons.get('battery').disabled ||= !facts.connected; deviceActions.hidden=!connectionStep; wiringNote.hidden=step?.group!=='wiring'||!content.viewer?.note;
    const noteText=facts.recording?'다시 연결하려면 기록을 먼저 일시정지하세요.':facts.mock&&step?.kind==='program'?'모의 실험에서는 설치 없이 다음 단계로 넘어가세요.':step?.kind==='program'?'':step?.kind==='battery'&&state.observations.battery.startedAt!==null?step.complete?'USB 분리 후 수신을 확인했어요.':'USB 분리 후 수신을 확인하고 있어요.':step?.kind==='calibration'&&!managed?'숫자가 들어오는 것만으로 보정 완료를 판단하지 않아요.':'';
    setText(note,noteText); note.hidden=!noteText;
    copy.dataset.group=step?.group??''; layout?.measure(); layout?.syncProgress();
  }
  return {
    /** @param {import('../guide/types.js').ExperimentContext} nextContext */
    open(nextContext,{reset=false,prepared=false}={}) {
      if (disposed) return;
      if (reset||context?.sensor?.id!==nextContext.sensor.id||context?.sensor?.version!==nextContext.sensor.version) {viewer?.dispose(); viewer=null; viewerState='idle'; mode='3d'; frame.removeAttribute('src'); delete frame.dataset.step; delete model.dataset.viewerState;}
      context=structuredClone(nextContext); content=getGuideContent(context);
      if (!progress||reset) {progress=createGuideProgress(context); facts={}; selectedId='equipment';} else progress.setContext(context);
      quick=prepared; if (quick) selectedId='quick'; else if (!currentStep()) selectedId='equipment'; buildContent(); paint();
    },
    /** @param {import('../guide/types.js').GuideFacts} nextFacts */
    render(nextFacts) {if (!progress||disposed) return; facts={...nextFacts}; progress.setAttempt(facts.attemptId); progress.observe(facts); paint();},
    showPrepared() {if (!locked()) {quick=true; selectedId='quick'; paint();}},
    getProgress() {return progress?.getState()??{ready:false,canMeasure:false,steps:[],setup:{}};},
    dispose() {disposed=true; preparationView?.dispose(); viewer?.dispose(); layout?.dispose(); help?.dispose(); contentAbort.abort(); abort.abort(); host.replaceChildren();},
  };
}
