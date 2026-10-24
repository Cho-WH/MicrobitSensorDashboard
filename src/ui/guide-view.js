// Adapted from G's grouped guide, contextual viewer and action flow at 59c5c149.
import { getSensorPreparation } from '../catalog/index.js';
import { createGuideProgress } from '../guide/progress.js';
import { getGuideContent } from '../guide/steps.js';
import { createViewerAdapter } from '../guide/viewer-adapter.js';
import { createGuideLayout } from './guide-layout.js';
import { createActionHelp } from './action-help.js';
import { element, findElement } from './dom.js';
import { getLabCopy, applyLabCopy, formatCopy } from './lab-copy.js';

/** @param {HTMLElement} host @param {import('../guide/types.js').GuideCallbacks} callbacks */
export function createGuideView(host, callbacks = {}) {
  let labels = getLabCopy(null);
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
    <div class="guide-top"><p class="guide-status" role="status"></p><button type="button" class="quiet-button" data-guide-action="quick" data-copy="guide.quick"></button></div>
    <ol class="guide-progress" data-copy-aria-label="accessibility.guideSteps"></ol>
    <div class="guide-layout">
      <section class="guide-visual" data-copy-aria-label="accessibility.guideVisual">
        <div class="guide-equipment"></div>
        <div class="guide-model" hidden>
          <div class="model-toolbar"><div class="viewer-modes" role="group" data-copy-aria-label="accessibility.wiringModes"></div><a class="viewer-large" target="_blank" rel="noopener" data-copy="guide.large"></a></div>
          <div class="wiring-view-controls" role="group" data-copy-aria-label="accessibility.wiringControls"></div>
          <p class="guide-model-status" role="status"></p>
          <iframe class="guide-frame viewer-pending" title="배선 3D 안내" hidden></iframe>
          <div class="guide-table-panel" hidden><table class="guide-wiring"><caption></caption><thead><tr><th scope="col" data-copy="guide.wireRole"></th><th scope="col" data-wiring-board></th><th scope="col" data-wiring-sensor></th></tr></thead><tbody></tbody></table><p data-copy="guide.wiringNote"></p></div>
        </div>
        <figure class="guide-placement" hidden><img alt=""><figcaption></figcaption></figure>
        <div class="guide-device-visual" hidden></div>
        <div class="guide-sensor-preparation" hidden></div>
        <div class="guide-reception" hidden><p class="eyebrow" data-copy="guide.incoming"></p><div class="guide-values"></div><p class="guide-last-received"></p><ol class="guide-checks"></ol><ol class="calibration-instructions" hidden></ol></div>
        <details class="guide-power" hidden><summary data-copy="guide.powerHeading"></summary><figure class="guide-device-image"><img alt="" loading="lazy" decoding="async" width="1440" height="900"><figcaption data-copy="guide.powerNote"></figcaption></figure></details>
        <div class="guide-summary" hidden><p class="eyebrow" data-copy="guide.lastCheck"></p><h3 data-copy="guide.summaryTitle"></h3><ul></ul></div>
      </section>
      <section class="step-panel" data-copy-aria-label="accessibility.guideDescription">
        <ol class="guide-substeps" data-copy-aria-label="accessibility.guideSubsteps"></ol>
        <div class="step-content"><p class="step-counter"></p><h3 class="step-title" tabindex="-1"></h3><p class="step-description"></p></div>
        <p class="guide-evidence"></p>
        <div class="guide-quick" hidden><p data-copy="guide.quickNote"></p><div></div></div>
        <div class="guide-program" hidden><strong data-copy="guide.program"></strong><p class="guide-device-status" role="status"></p><progress max="100" data-copy-aria-label="accessibility.installProgress" hidden></progress><div class="guide-program-actions"></div></div>
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
  const power = findElement(shell,'details','.guide-power');
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
  button('previous',labels.guide.previous,()=>{
    const steps=progress.getState().steps, index=steps.findIndex(step=>step.id===selectedId);
    select(steps[index<0 ? steps.length-1 : Math.max(0,index-1)].id);
  },actions);
  button('confirm',labels.guide.confirm,()=>{ if (!locked() && progress.confirm(selectedId)) {callbacks.onChange?.(progress.getState()); next();} },actions,'primary');
  button('next',labels.guide.next,next,actions,'primary');
  button('measure',labels.guide.measure,()=>callbacks.onMeasure?.(),actions,'primary');
  button('quick-confirm',labels.guide.quickConfirm,()=>{
    if (locked() || [...quickChecks.values()].some(input=>!input.checked)) return;
    for (const id of quickChecks.keys()) progress.confirm(id);
    callbacks.onChange?.(progress.getState()); select('connection');
  },actions,'primary');
  const programActions=findElement(shell,'div','.guide-program-actions');
  button('install',labels.guide.install,()=>callbacks.onInstall?.(),programActions,'primary');
  button('program-confirm',labels.guide.programConfirm,()=>{
    if (!locked() && progress.confirm('program')) {callbacks.onChange?.(progress.getState()); next();}
  },programActions,'quiet-button');
  button('connect',labels.common.connect,()=>callbacks.onConnect?.({reuseDevice:false}),deviceActions,'primary');
  button('reconnect',labels.common.reconnect,()=>callbacks.onConnect?.({reuseDevice:true}),deviceActions,'primary');
  button('disconnect',labels.common.disconnect,()=>callbacks.onDisconnect?.(),deviceActions);
  button('battery',labels.guide.battery,()=>{if (!locked() && progress.beginBatteryCheck()) changed();},deviceActions,'primary');
  const modes=findElement(shell,'div','.viewer-modes');
  button('model',labels.guide.model,()=>{mode='3d'; loadViewer(); paintViewer();},modes);
  button('table',labels.guide.table,()=>{mode='table'; paintViewer();},modes);
  button('retry-model',labels.guide.retryModel,()=>{viewer?.dispose(); viewer=null; frame.removeAttribute('src'); delete frame.dataset.step; mode='3d'; loadViewer(); paintViewer();},modes);
  button('left',labels.guide.cableLeft,()=>viewer?.setCableSide('left'),controls);
  button('right',labels.guide.cableRight,()=>viewer?.setCableSide('right'),controls);
  button('detail',labels.guide.detail,()=>viewer?.toggleDetail(),controls);
  button('restore',labels.guide.restore,()=>viewer?.restoreStep(),controls);
  const cableHelp=element('button','help-trigger','?'); cableHelp.type='button'; cableHelp.dataset.actionHelp='cable'; cableHelp.setAttribute('aria-label','케이블 끝 모양 도움말'); controls.append(cableHelp);
  const quickButton=findElement(shell,'button','[data-guide-action="quick"]');
  quickButton.addEventListener('click',()=>{if (!locked()) {quick=!quick; selectedId=quick?'quick':'equipment'; paint(); title.focus({preventScroll:true});}},{signal:abort.signal});
  function loadViewer() {
    const step=currentStep(); if (!step?.model || model.hidden || !content.viewer) return;
    if (!viewer) viewer=createViewerAdapter(frame,(state,detail)=>{
      viewerState=state; model.dataset.viewerState=state;
      frame.classList.toggle('viewer-pending',!detail.hasAppliedState);
      buttons.get('detail').setAttribute('aria-pressed',String(detail.detail));
      buttons.get('detail').textContent=detail.detail?labels.guide.whole:labels.guide.detail;
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
    setText(modelStatus,viewerState==='unavailable'?labels.guide.modelUnavailable:labels.guide.modelLoading);
    for (const row of tableBody.querySelectorAll('tr')) {
      row.classList.toggle('is-current',row.dataset.wire===wire); row.querySelector('small').hidden=row.dataset.wire!==wire;
    }
  }
  function buildContent() {
    applyLabCopy(shell, labels);
    const buttonLabels = {previous:labels.guide.previous,confirm:labels.guide.confirm,next:labels.guide.next,measure:labels.guide.measure,
      'quick-confirm':labels.guide.quickConfirm,install:labels.guide.install,'program-confirm':labels.guide.programConfirm,
      connect:labels.common.connect,reconnect:labels.common.reconnect,disconnect:labels.common.disconnect,battery:labels.guide.battery,
      model:labels.guide.model,table:labels.guide.table,'retry-model':labels.guide.retryModel,left:labels.guide.cableLeft,right:labels.guide.cableRight,detail:labels.guide.detail,restore:labels.guide.restore};
    for (const [id, label] of Object.entries(buttonLabels)) setText(buttons.get(id), label);
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
      node.textContent=step.model?.wire ? content.wiring.find(wire=>wire.id===step.id)?.role : ({usb:labels.guide.usbLabel,program:labels.guide.programLabel,connection:labels.guide.connectionLabel,reception:labels.guide.receptionLabel,calibration:labels.guide.calibrationLabel}[step.id]??step.groupLabel);
      node.addEventListener('click',()=>select(step.id),{signal}); item.append(node); subnav.append(item); stepButtons.set(step.id,node);
    }
    for (const track of [nav,subnav]) track.addEventListener('keydown',event=>{
      const items=[...track.querySelectorAll('button')].filter(node=>!node.disabled&&!node.parentElement.hidden);
      const current=items.indexOf(/** @type {HTMLButtonElement} */(document.activeElement));
      const index=event.key==='ArrowRight'?(current+1)%items.length:event.key==='ArrowLeft'?(current-1+items.length)%items.length:event.key==='Home'?0:event.key==='End'?items.length-1:null;
      if(index===null||current<0)return;event.preventDefault();items[index].click();items[index].focus();items[index].scrollIntoView({block:'nearest',inline:'nearest'});
    },{signal});
    const messages={}; equipment.replaceChildren();
    deviceVisual.replaceChildren(); power.open=false;
    const powerImage=findElement(power,'img','img');
    if(content.illustrations){powerImage.src=content.illustrations.battery.src;powerImage.alt=content.illustrations.battery.alt;}
    else {powerImage.removeAttribute('src');powerImage.alt='';}
    for (const {label,items} of [{label:labels.guide.deviceEquipment,items:content.equipment},{label:labels.guide.activityEquipment,items:content.activityEquipment}]) {
      if (!items.length) continue;
      const section=element('section','equipment-section'); section.append(element('h4','',label));
      const list=element('ul','equipment-list');
      for (const item of items) {
        const li=element('li'), name=element('span','',item.name), helpButton=element('button','help-trigger','?');
        const illustration=items===content.equipment?content.illustrations?.equipment[item.id]:null;
        if(illustration){
          const img=element('img');img.src=illustration.src;img.alt=illustration.alt;img.width=1440;img.height=900;img.decoding='async';
          li.classList.add('equipment-illustrated');li.append(img);
        }
        const key='equipment-'+item.id; messages[key]={label:item.name,text:item.help};
        helpButton.type='button'; helpButton.dataset.actionHelp=key; helpButton.setAttribute('aria-label',item.name+' 준비 안내');
        li.append(name,helpButton); list.append(li);
      }
      section.append(list); equipment.append(section);
    }
    tableBody.replaceChildren();
    for (const wire of content.wiring) {
      const row=element('tr'); row.dataset.wire=wire.id;
      const heading=element('th','',wire.role); heading.scope='row'; heading.append(element('small','',labels.guide.currentStep));
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
      input.addEventListener('change',paint,{signal}); label.append(input,element('span','',step.id==='program'?labels.guide.installed:step.title)); quickFields.append(label); quickChecks.set(step.id,input);
    }
    messages.cable={label:'케이블 끝 모양',text:content.cableHelp};
    help=createActionHelp(shell,{messages});
    layout=createGuideLayout({content:copy,progress:nav,equipment,steps,measureSteps:steps.filter(step=>step.group==='wiring'),createMeasurement(step){
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
    setText(status,`${facts.mock?labels.guide.mockPrefix:''}${state.ready?labels.guide.ready:state.canMeasure?labels.guide.canMeasure:formatCopy(labels.guide.progress,{count:completed,total:required.length})}`);
    shell.dataset.mode=quick?'quick':isSummary?'summary':step?.group??'';
    quickButton.hidden=isSummary; quickButton.disabled=locked(); quickButton.textContent=quick?labels.guide.restart:labels.guide.quick;
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
    setText(title,quick?labels.guide.quickTitle:isSummary?state.canMeasure?labels.guide.readyTitle:labels.guide.receptionTitle:(managed?presentation.title:step?.title)??labels.navigation.prepare);
    setText(description,quick?labels.guide.quickDescription:isSummary?labels.guide.summaryDescription:(managed?presentation.description:step?.description)??'');
    if(leavingPanel)title.focus({preventScroll:true});
    const groupIndex=[...groupButtons.keys()].indexOf(step?.group);
    setText(findElement(copy,'p','.step-counter'),quick?labels.guide.quickCounter:isSummary?labels.guide.summaryCounter:`${String(groupIndex+1).padStart(2,'0')} / ${String(groupButtons.size).padStart(2,'0')} · ${step?.groupLabel}`);
    const provenance = { 'user-confirmed': labels.guide.userConfirmed, 'device-observed': labels.guide.deviceObserved, 'device-reported': labels.guide.deviceReported, simulated: labels.guide.simulated };
    setText(evidence,step?.complete?'✓ '+(provenance[step.evidence]??labels.guide.confirm):'');
    equipment.hidden=!quick&&step?.id!=='equipment';
    model.hidden=quick||isSummary||!content.viewer||!content.wiring.length||step?.group!=='wiring';
    placement.hidden=quick||step?.id!=='placement'||!content.setupImage;
    const connectionStep=!quick&&!isSummary&&['connection','calibration','reception','battery'].includes(step?.kind);
    reception.hidden=!connectionStep||Boolean(managed&&presentation.hideValues);
    power.hidden=!content.illustrations||quick||isSummary||!['connection','reception','battery'].includes(step?.kind);
    deviceVisual.hidden=quick||isSummary||!model.hidden||!['usb','program'].includes(step?.id);
    if (!deviceVisual.hidden&&!deviceVisual.childElementCount) {
      deviceVisual.innerHTML='<p class="eyebrow" data-copy="guide.usbEyebrow"></p><div class="usb-diagram"><span data-copy="guide.computer"></span><span aria-hidden="true">⟷</span><strong>micro:bit V2</strong></div><h4 data-copy="guide.usbHeading"></h4><p data-copy="guide.usbNote"></p><small data-copy="guide.usbWireless"></small>';
      applyLabCopy(deviceVisual, labels);
      if(content.illustrations){
        const img=element('img','guide-usb-image');img.src=content.illustrations.usb.src;img.alt=content.illustrations.usb.alt;img.width=1440;img.height=900;img.decoding='async';
        if (shell.ownerDocument.documentElement.dataset.visualTheme === 'luminous') {
          img.src=new URL('../../public/assets/design/luminous-usb.png',import.meta.url).href;
          img.width=1200;img.height=1000;
        }
        deviceVisual.querySelector('.usb-diagram').replaceWith(img);
      }
    }
    if (!model.hidden&&mode==='3d') loadViewer(); paintViewer();
    if (!reception.hidden) {
      for (const channel of context.channels) {
        const value=facts.latest?.values[channel.id], valid=facts.latest?.validity[channel.id]==='valid';
        setText(values.querySelector(`[data-channel="${channel.id}"]`),valid&&Number.isFinite(value)?value.toLocaleString('ko-KR',{maximumFractionDigits:channel.digits??2}):'—');
      }
      reception.dataset.fresh=String(facts.receptionReady===true);
      setText(findElement(reception,'p','.guide-last-received'),facts.receivedAt?`${facts.receptionReady?labels.common.fresh:labels.common.checkReception} · ${formatCopy(labels.common.lastReceived,{time:new Date(facts.receivedAt).toLocaleTimeString('ko-KR',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})})}`:labels.guide.noReading);
      const checks=findElement(reception,'ol','.guide-checks'), checksText=[[labels.guide.wireless,Boolean(facts.connected)],[labels.guide.continuous,Boolean(facts.receptionReady)],...(content.calibrationInstructions.length?[[labels.guide.calibration,state.observations.calibration!=='unknown']]:[]),...(step?.kind==='battery'?[[labels.guide.batteryCheck,step.complete]]:[])];
      const signature=JSON.stringify(checksText);
      if (checks.dataset.signature!==signature) {checks.dataset.signature=signature; checks.replaceChildren(...checksText.map(([label,done])=>element('li',done?'complete':'',`${done?'✓':'○'} ${label}`)));}
      findElement(reception,'ol','.calibration-instructions').hidden=!['calibration','reception'].includes(step?.kind)||!content.calibrationInstructions.length;
    }
    summary.hidden=!isSummary;
    const summarySignature=JSON.stringify(steps.map(item=>[item.id,item.complete]));
    if (isSummary&&summary.dataset.signature!==summarySignature) {
      summary.dataset.signature=summarySignature;
      findElement(summary,'ul','ul').replaceChildren(...steps.filter(item=>item.required).map(item=>{
        const li=element('li'), label=element('span','',`${item.complete?'✓':'○'} ${item.title}`), change=element('button','quiet-button',item.complete?labels.guide.review:labels.guide.check);
        change.type='button'; change.addEventListener('click',()=>select(item.id),{signal:contentAbort.signal}); li.append(label,change); return li;
      }));
    }
    quickPanel.hidden=!quick; for (const check of quickChecks.values()) check.disabled=locked();
    program.hidden=quick||step?.kind!=='program'; const programmer=facts.programmerState??{};
    setText(deviceNotice,[programmer.message,Number.isFinite(programmer.progress)?`${Math.round(programmer.progress)}%`:'',programmer.deviceName].filter(Boolean).join(' · '));
    bar.hidden=programmer.status!=='flashing'; if (programmer.progress==null) bar.removeAttribute('value'); else bar.value=programmer.progress;
    const deviceText=connectionStep?(facts.unsupported?labels.guide.unsupported:facts.deviceMessage??''):'';
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
    buttons.get('confirm').textContent=step?.action??labels.guide.confirm; buttons.get('confirm').disabled ||= step?.kind==='calibration'&&!facts.connected;
    buttons.get('next').disabled=locked()||!step?.complete; buttons.get('next').textContent=index===steps.length-1?labels.guide.nextSummary:labels.guide.nextConfirmed;
    buttons.get('next').classList.toggle('primary',!show.has('measure'));
    buttons.get('measure').disabled=locked()||!state.canMeasure;
    buttons.get('quick-confirm').disabled ||= [...quickChecks.values()].some(check=>!check.checked);
    buttons.get('install').disabled ||= facts.canInstall===false||facts.mock===true||programmer.status==='unavailable';
    buttons.get('install').textContent=programmer.busy?labels.guide.installing:['error','cancelled'].includes(programmer.status)?labels.guide.retryInstall:programmer.status==='success'?labels.guide.reinstall:labels.guide.install;
    buttons.get('connect').disabled ||= facts.canConnect===false; buttons.get('connect').textContent=facts.canReconnect?labels.common.chooseDevice:facts.mock?labels.common.mockConnect:labels.common.connect;
    buttons.get('reconnect').disabled ||= facts.canConnect===false;
    buttons.get('disconnect').textContent=facts.connecting?labels.common.cancelConnection:labels.common.disconnect; buttons.get('disconnect').disabled=Boolean(facts.programmerState?.busy);
    buttons.get('battery').disabled ||= !facts.connected; deviceActions.hidden=!connectionStep; wiringNote.hidden=step?.group!=='wiring'||!content.viewer?.note;
    const noteText=facts.recording?labels.guide.reconnectNote:facts.mock&&step?.kind==='program'?labels.guide.mockProgramNote:step?.kind==='program'?'':step?.kind==='battery'&&state.observations.battery.startedAt!==null?step.complete?labels.guide.batterySeen:labels.guide.batteryWaiting:step?.kind==='calibration'&&!managed?labels.guide.calibrationNote:'';
    setText(note,noteText); note.hidden=!noteText;
    copy.dataset.group=step?.group??''; layout?.measure(); layout?.syncProgress();
  }
  return {
    /** @param {import('../guide/types.js').ExperimentContext} nextContext */
    open(nextContext,{reset=false,prepared=false}={}) {
      if (disposed) return;
      shell.hidden=false;
      if (reset||context?.sensor?.id!==nextContext.sensor.id||context?.sensor?.version!==nextContext.sensor.version) {viewer?.dispose(); viewer=null; viewerState='idle'; mode='3d'; frame.removeAttribute('src'); delete frame.dataset.step; delete model.dataset.viewerState;}
      context=structuredClone(nextContext); content=getGuideContent(context); labels=getLabCopy(context);
      if (!progress||reset) {progress=createGuideProgress(context); facts={}; selectedId='equipment';} else progress.setContext(context);
      quick=prepared; if (quick) selectedId='quick'; else if (!currentStep()) selectedId='equipment'; buildContent(); paint();
    },
    /** @param {import('../guide/types.js').GuideFacts} nextFacts */
    render(nextFacts) {if (!progress||disposed) return; facts={...nextFacts}; progress.setAttempt(facts.attemptId); progress.observe(facts); paint();},
    showPrepared() {if (!locked()) {quick=true; selectedId='quick'; paint();}},
    close() {
      preparationView?.dispose(); preparationView=null; viewer?.dispose(); viewer=null;
      layout?.dispose(); layout=null; help?.dispose(); help=null; contentAbort.abort();
      progress=null; context=null; facts={}; selectedId=''; quick=false; shell.hidden=true;
      viewerState='idle'; frame.removeAttribute('src'); delete frame.dataset.step;
    },
    getProgress() {return progress?.getState()??{ready:false,canMeasure:false,steps:[],setup:{}};},
    dispose() {disposed=true; preparationView?.dispose(); viewer?.dispose(); layout?.dispose(); help?.dispose(); contentAbort.abort(); abort.abort(); host.replaceChildren();},
  };
}
