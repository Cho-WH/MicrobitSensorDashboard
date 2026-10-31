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
  /** @type {string|null} */ let renderedStep = null;
  /** @type {string|null} */ let renderedProgram = null;
  let content = getGuideContent(null), contentAbort = new AbortController();
  const abort = new AbortController(), shell = element('section', 'guide');
  const compact=matchMedia('(max-width: 850px)');
  compact.addEventListener('change',()=>paint(),{signal:abort.signal});
  shell.innerHTML = `
    <div class="guide-top"><p class="guide-status" role="status"></p><button type="button" class="quiet-button" data-guide-action="quick" data-copy="guide.quick"></button></div>
    <ol class="guide-progress" data-copy-aria-label="accessibility.guideSteps"></ol>
    <div class="guide-layout">
      <section class="guide-visual" data-ui-height data-copy-aria-label="accessibility.guideVisual">
        <div class="guide-equipment"></div>
        <div class="guide-model" hidden>
          <div class="model-toolbar"><div class="viewer-modes" role="group" data-copy-aria-label="accessibility.wiringModes"></div><a class="viewer-large" target="_blank" rel="noopener" data-copy="guide.large"></a></div>
          <div class="wiring-view-controls" role="group" data-copy-aria-label="accessibility.wiringControls"></div>
          <p class="guide-model-status" role="status"></p>
          <iframe class="guide-frame viewer-pending" title="배선 3D 안내" hidden></iframe>
          <div class="guide-table-panel" hidden><table class="guide-wiring"><caption></caption><thead><tr><th scope="col" data-copy="guide.wireRole"></th><th scope="col" data-wiring-board></th><th scope="col" data-wiring-sensor></th></tr></thead><tbody></tbody></table><p data-copy="guide.wiringNote"></p></div>
        </div>
        <figure class="guide-step-image" hidden><img alt=""><figcaption></figcaption></figure>
        <div class="guide-device-visual" hidden></div>
        <div class="guide-sensor-preparation" hidden></div>
        <div class="guide-reception" hidden><div class="guide-reception-state" role="status"><strong></strong><p></p></div><p class="eyebrow" data-copy="guide.incoming"></p><div class="guide-values"></div><p class="guide-last-received"></p><p class="guide-reading-note" data-copy="guide.receptionNote"></p><ol class="guide-checks"></ol><ol class="calibration-instructions" hidden></ol></div>
        <details class="guide-power" hidden><summary data-copy="guide.powerHeading"></summary><figure class="guide-device-image"><img alt="" loading="lazy" decoding="async" width="1440" height="900"><figcaption data-copy="guide.powerNote"></figcaption></figure></details>
        <div class="guide-summary" hidden><p class="eyebrow" data-copy="guide.lastCheck"></p><h3 data-copy="guide.summaryTitle"></h3><ul></ul></div>
      </section>
      <section class="step-panel" data-ui-height data-copy-aria-label="accessibility.guideDescription">
        <ol class="guide-substeps" data-copy-aria-label="accessibility.guideSubsteps"></ol>
        <div class="step-content"><p class="step-counter"></p><h3 class="step-title" tabindex="-1"></h3><p class="step-description"></p><ol class="step-instructions" hidden></ol></div>
        <div class="guide-activity-equipment" hidden></div>
        <p class="guide-evidence"></p>
        <div class="guide-quick" hidden><p data-copy="guide.quickNote"></p><div></div></div>
        <div class="guide-program" hidden><span class="guide-program-label" data-copy="guide.programTarget"></span><strong class="guide-program-target"></strong><div class="guide-install-notice" role="status" aria-atomic="true"><strong class="guide-install-heading" hidden></strong><p class="guide-device-status"></p></div><p class="guide-install-detail" hidden></p><progress max="100" data-copy-aria-label="accessibility.installProgress" hidden></progress><div class="guide-program-actions"></div></div><div class="guide-install-mode" hidden><p></p></div>
        <p class="guide-connection-status" role="status"></p>
        <div class="guide-device-actions"></div><div class="step-actions"></div><p class="guide-note"></p>
        <details class="wiring-note" hidden><summary></summary><p></p></details>
      </section>
    </div>`;
  host.replaceChildren(shell);
  const status = findElement(shell,'p','.guide-status'), nav = findElement(shell,'ol','.guide-progress');
  const subnav = findElement(shell,'ol','.guide-substeps'), copy = findElement(shell,'div','.step-content');
  const stepPanels = [findElement(shell,'section','.step-panel'), findElement(shell,'section','.guide-visual')];
  const title = findElement(shell,'h3','.step-title'), description = findElement(shell,'p','.step-description');
  const instructions = findElement(shell,'ol','.step-instructions');
  const evidence = findElement(shell,'p','.guide-evidence'), note = findElement(shell,'p','.guide-note');
  const equipment = findElement(shell,'div','.guide-equipment'), model = findElement(shell,'div','.guide-model');
  const activityEquipment = findElement(shell,'div','.guide-activity-equipment');
  const modelStatus = findElement(shell,'p','.guide-model-status'), frame = findElement(shell,'iframe','iframe');
  const tablePanel = findElement(shell,'div','.guide-table-panel'), tableBody = findElement(shell,'tbody','.guide-wiring tbody');
  const stepFigure = findElement(shell,'figure','.guide-step-image'), deviceVisual = findElement(shell,'div','.guide-device-visual');
  const preparationHost = findElement(shell,'div','.guide-sensor-preparation');
  const reception = findElement(shell,'div','.guide-reception'), values = findElement(shell,'div','.guide-values');
  const power = findElement(shell,'details','.guide-power');
  const summary = findElement(shell,'div','.guide-summary'), quickPanel = findElement(shell,'div','.guide-quick');
  const program = findElement(shell,'div','.guide-program'), deviceNotice = findElement(shell,'p','.guide-device-status');
  const installHeading = findElement(shell,'strong','.guide-install-heading'), installDetail = findElement(shell,'p','.guide-install-detail');
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
  const modePanel=findElement(shell,'div','.guide-install-mode');
  button('install-mode',labels.guide.wirelessMode,()=>callbacks.onInstallMode?.(facts.programmerState?.mode==='wireless'?'usb':'wireless'),modePanel,'quiet-button install-mode-link');
  const programActions=findElement(shell,'div','.guide-program-actions');
  const installHelp=element('button','installation-help-trigger','설치에 문제가 있나요?');
  installHelp.type='button'; installHelp.dataset.installationHelp='';
  installHelp.setAttribute('aria-haspopup','dialog'); installHelp.setAttribute('aria-controls','installation-troubleshooting');
  actions.append(installHelp);
  button('install',labels.guide.install,()=>callbacks.onInstall?.(),programActions,'primary');
  button('cancel-install',labels.common.cancel,()=>callbacks.onCancelInstall?.(),programActions,'quiet-button');
  button('program-confirm',labels.guide.programConfirm,()=>{
    if (!locked() && progress.confirm('program')) {callbacks.onChange?.(progress.getState()); next();}
  },programActions,'quiet-button');
  button('connect',labels.common.connect,()=>callbacks.onConnect?.({reuseDevice:false}),deviceActions,'primary');
  button('reconnect',labels.common.reconnect,()=>callbacks.onConnect?.({reuseDevice:true,reconnecting:true}),deviceActions,'primary');
  button('disconnect',labels.common.disconnect,()=>callbacks.onDisconnect?.(),deviceActions);
  const connectionHelp=element('button','connection-help-trigger',labels.common.connectionHelp);
  connectionHelp.type='button'; connectionHelp.dataset.connectionHelp='';
  connectionHelp.setAttribute('aria-haspopup','dialog'); connectionHelp.setAttribute('aria-controls','connection-troubleshooting');
  deviceActions.append(connectionHelp);
  button('battery',labels.guide.battery,()=>{if (!locked() && progress.beginBatteryCheck()) changed();},deviceActions,'primary');
  const modes=findElement(shell,'div','.viewer-modes');
  button('model',labels.guide.model,()=>{mode='3d'; loadViewer(); paintViewer();},modes);
  button('table',labels.guide.table,()=>{mode='table'; paintViewer();},modes);
  button('retry-model',labels.guide.retryModel,()=>{viewer?.dispose(); viewer=null; frame.removeAttribute('src'); delete frame.dataset.step; mode='3d'; loadViewer(); paintViewer();},modes);
  const viewerChoices = element('div','wiring-choices'); controls.append(viewerChoices);
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
      for (const select of viewerChoices.querySelectorAll('select')) select.value=detail.options[select.name]??'';
      if (state==='unavailable') mode='table';
      paintViewer();
    },{...content.viewer,...callbacks.viewerOptions});
    if (frame.dataset.step!==step.id || viewerState==='idle') {frame.dataset.step=step.id; viewer.applyStep(step);}
  }
  function paintViewer() {
    const step=currentStep(), wire=content.wiring.find(wire=>wire.id===step?.id)?.id;
    const fallback=!content.viewer||mode==='table';
    findElement(model,'div','.model-toolbar').hidden=!content.viewer;
    frame.hidden=fallback; tablePanel.hidden=!fallback;
    buttons.get('model').setAttribute('aria-pressed',String(!fallback));
    buttons.get('table').setAttribute('aria-pressed',String(fallback));
    buttons.get('model').disabled=viewerState==='unavailable';
    buttons.get('retry-model').hidden=viewerState!=='unavailable'; controls.hidden=fallback;
    buttons.get('detail').hidden=!wire; viewerChoices.hidden=!wire; cableHelp.hidden=!content.cableHelp;
    for (const id of ['detail','restore']) buttons.get(id).disabled=viewerState!=='applied';
    for (const select of viewerChoices.querySelectorAll('select')) select.disabled=viewerState!=='applied';
    modelStatus.hidden=viewerState==='applied'||viewerState==='idle';
    setText(modelStatus,viewerState==='unavailable'?labels.guide.modelUnavailable:labels.guide.modelLoading);
    for (const row of tableBody.querySelectorAll('tr')) {
      row.classList.toggle('is-current',row.dataset.wire===wire); row.querySelector('small').hidden=row.dataset.wire!==wire;
    }
  }
  function buildContent() {
    applyLabCopy(shell, labels);
    setText(findElement(shell,'strong','.guide-program-target'),context.sensor.name);
    delete instructions.dataset.signature;
    const buttonLabels = {previous:labels.guide.previous,confirm:labels.guide.confirm,next:labels.guide.next,measure:labels.guide.measure,
      'quick-confirm':labels.guide.quickConfirm,install:labels.guide.install,'program-confirm':labels.guide.programConfirm,
      connect:labels.common.connect,reconnect:labels.common.reconnect,disconnect:labels.common.disconnect,battery:labels.guide.battery,
      model:labels.guide.model,table:labels.guide.table,'retry-model':labels.guide.retryModel,detail:labels.guide.detail,restore:labels.guide.restore};
    for (const [id, label] of Object.entries(buttonLabels)) setText(buttons.get(id), label);
    viewerChoices.replaceChildren();
    for (const choice of content.viewer?.choices??[]) {
      const label=element('label','',choice.label),select=element('select',''); select.name=choice.id;
      for (const value of choice.values) {const option=element('option','',value.label);option.value=value.id;select.append(option);}
      select.value=content.viewer.defaults[choice.id];
      select.addEventListener('change',()=>viewer?.setOption(choice.id,select.value)); label.append(select);viewerChoices.append(label);
    }
    preparationView?.dispose(); suggestion=''; preparationHost.hidden=true;
    preparationView=getSensorPreparation(context)?.createView?.(preparationHost,{onAction:action=>run(()=>callbacks.onDeviceAction?.(action))})??null;
    help?.dispose(); layout?.dispose(); contentAbort.abort(); contentAbort=new AbortController();
    const signal=contentAbort.signal, steps=progress.getState().steps;
    stepButtons.clear(); groupButtons.clear(); quickChecks.clear(); nav.replaceChildren(); subnav.replaceChildren();
    delete summary.dataset.signature;
    frame.title=content.viewer?.title??'배선 3D 안내';
    const large=findElement(shell,'a','.viewer-large');
    if (content.viewer) {const url=new URL(content.viewer.url); url.searchParams.delete('embed'); large.href=url.href;} else large.removeAttribute('href');
    findElement(shell,'caption','.guide-wiring caption').textContent=content.wiringTable?.tableCaption??'배선표';
    findElement(shell,'th','[data-wiring-board]').textContent=content.wiringTable?.boardLabel??'보드';
    findElement(shell,'th','[data-wiring-sensor]').textContent=content.wiringTable?.sensorLabel??'센서';
    findElement(wiringNote,'summary','summary').textContent=content.wiringTable?.noteTitle??'';
    findElement(wiringNote,'p','p').textContent=content.wiringTable?.note??'';
    for (const step of steps) {
      if (!groupButtons.has(step.group)) {
        const item=element('li'), node=element('button','ui-tab'); node.type='button'; node.dataset.guideGroup=step.group;
        node.textContent=`${groupButtons.size+1} ${step.groupLabel}`;
        node.addEventListener('click',()=>select(step.id),{signal}); item.append(node); nav.append(item); groupButtons.set(step.group,node);
      }
      const item=element('li'), node=element('button'); node.type='button'; node.dataset.guideStep=step.id;
      node.textContent=content.wiring.find(wire=>wire.id===step.id)?.role ?? ({program:labels.guide.programLabel,connection:labels.guide.connectionLabel,reception:labels.guide.receptionLabel,calibration:labels.guide.calibrationLabel}[step.id]??step.groupLabel);
      node.addEventListener('click',()=>select(step.id),{signal}); item.append(node); subnav.append(item); stepButtons.set(step.id,node);
    }
    for (const track of [nav,subnav]) track.addEventListener('keydown',event=>{
      const items=[...track.querySelectorAll('button')].filter(node=>!node.disabled&&!node.parentElement.hidden);
      const current=items.indexOf(/** @type {HTMLButtonElement} */(document.activeElement));
      const index=event.key==='ArrowRight'?(current+1)%items.length:event.key==='ArrowLeft'?(current-1+items.length)%items.length:event.key==='Home'?0:event.key==='End'?items.length-1:null;
      if(index===null||current<0)return;event.preventDefault();items[index].click();items[index].focus();items[index].scrollIntoView({block:'nearest',inline:'nearest'});
    },{signal});
    const messages={}; equipment.replaceChildren(); activityEquipment.replaceChildren();
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
      section.append(list); (items===content.equipment?equipment:activityEquipment).append(section);
    }
    tableBody.replaceChildren();
    for (const wire of content.wiring) {
      const row=element('tr'); row.dataset.wire=wire.id;
      const heading=element('th','',wire.role); heading.scope='row'; heading.append(element('small','',labels.guide.currentStep));
      row.append(heading,element('td','',wire.board),element('td','',wire.sensor)); tableBody.append(row);
    }
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
    layout=createGuideLayout({root:shell,content:copy,progress:nav,equipment,steps,measureSteps:steps.filter(step=>step.group==='wiring'),createMeasurement(step){
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
    const nextStep=quick?'quick':selectedId, previousStep=renderedStep;
    const stepChanged=previousStep!==null&&previousStep!==nextStep;
    const stepHeights=stepChanged?layout.captureHeights(stepPanels):[];
    const programmer=facts.programmerState??{}, wireless = programmer.mode === 'wireless';
    const installMode=wireless?'wireless':'usb';
    const modeChanged=step?.kind==='program'&&!quick&&!program.hidden&&program.dataset.mode&&program.dataset.mode!==installMode;
    // Progress numbers update in place; only presentation changes start a new transition.
    const programSignature=JSON.stringify([installMode,programmer.status,programmer.phase,Boolean(programmer.busy),
      programmer.message,programmer.deviceName,Boolean(programmer.usbRequired),Number.isFinite(programmer.progress)]);
    const programChanged=wireless&&step?.kind==='program'&&!quick&&!program.hidden
      &&renderedProgram!==null&&renderedProgram!==programSignature;
    const previousHeights=modeChanged||programChanged?layout.captureHeights([...stepPanels,program]):[];
    const managed=!quick&&!isSummary&&preparationView?.supports(step);
    const leavingPanel=managed&&!presentation.hideValues&&preparationHost.contains(document.activeElement);
    preparationView?.render(facts,managed);
    const index=steps.findIndex(item=>item.id===selectedId), required=steps.filter(item=>item.required), completed=required.filter(item=>item.complete).length;
    setText(status,`${facts.mock&&!facts.tour?labels.guide.mockPrefix:''}${state.ready?labels.guide.ready:state.canMeasure?labels.guide.canMeasure:formatCopy(labels.guide.progress,{count:completed,total:required.length})}`);
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
      const skipped=item.kind==='calibration'&&state.observations.calibration==='skipped';
      node.dataset.skipped=String(skipped);
      node.setAttribute('aria-label',`${node.textContent}${skipped?' · '+labels.guide.calibrationSkipped:item.complete?' · 완료':''}`);
      if (item.id===selectedId) node.setAttribute('aria-current','step'); else node.removeAttribute('aria-current');
    }
    subnav.hidden=quick||isSummary||steps.filter(item=>item.group===step?.group).length<2;
    setText(title,quick?labels.guide.quickTitle:isSummary?state.canMeasure?labels.guide.readyTitle:labels.guide.receptionTitle:(managed?presentation.title:step?.title)??labels.navigation.prepare);
    const recovery=wireless&&programmer.status==='recovery', usbRequired=wireless&&programmer.usbRequired===true;
    const wirelessSuccess=wireless&&programmer.status==='success';
    setText(description,quick?labels.guide.quickDescription:isSummary?labels.guide.summaryDescription:(managed?presentation.description:step?.kind==='program'&&wireless?labels.guide.wirelessDescription:step?.description)??'');
    description.hidden=!quick&&step?.kind==='program'&&(recovery||usbRequired);
    const instructionItems=quick||isSummary?[]:step?.instructions??[], instructionSignature=JSON.stringify(instructionItems);
    instructions.hidden=!instructionItems.length;
    if(instructions.dataset.signature!==instructionSignature) {
      instructions.dataset.signature=instructionSignature; instructions.replaceChildren(...instructionItems.map(text=>element('li','',text)));
    }
    if(leavingPanel)title.focus({preventScroll:true});
    const groupIndex=[...groupButtons.keys()].indexOf(step?.group);
    setText(findElement(copy,'p','.step-counter'),quick?labels.guide.quickCounter:isSummary?labels.guide.summaryCounter:`${String(groupIndex+1).padStart(2,'0')} / ${String(groupButtons.size).padStart(2,'0')} · ${step?.groupLabel}`);
    const provenance = { 'user-confirmed': labels.guide.userConfirmed, 'device-observed': labels.guide.deviceObserved, 'device-reported': labels.guide.deviceReported, simulated: labels.guide.simulated };
    const skipped=step?.kind==='calibration'&&state.observations.calibration==='skipped';
    setText(evidence,skipped?labels.guide.calibrationSkippedNote:step?.complete?'✓ '+(provenance[step.evidence]??labels.guide.confirm):'');
    evidence.dataset.state=skipped?'skipped':step?.complete?'complete':'pending';
    equipment.hidden=!quick&&step?.id!=='equipment';
    activityEquipment.hidden=equipment.hidden||!content.activityEquipment.length;
    model.hidden=quick||isSummary||!content.wiring.length||step?.group!=='wiring';
    const stepImage = quick || isSummary ? null : step?.image;
    stepFigure.hidden = !stepImage;
    const img = findElement(stepFigure,'img','img');
    if (stepImage) {
      if (img.getAttribute('src') !== stepImage.src) img.src = stepImage.src;
      img.alt = stepImage.alt;
      setText(findElement(stepFigure,'figcaption','figcaption'), stepImage.caption);
    } else img.removeAttribute('src');
    const connectionStep=!quick&&!isSummary&&['connection','calibration','reception','battery'].includes(step?.kind);
    reception.hidden=!connectionStep||Boolean(managed&&presentation.hideValues);
    power.hidden=!content.illustrations||quick||isSummary||!['connection','reception','battery'].includes(step?.kind);
    if(step?.kind==='battery'&&power.dataset.step!==selectedId)power.open=true;
    power.dataset.step=selectedId;
    deviceVisual.hidden=quick||isSummary||!model.hidden||step?.kind!=='program';
    const visualMode=recovery?'reset':usbRequired?'usb':wirelessSuccess?'installed':wireless?'wireless':'usb';
    if (!deviceVisual.hidden&&(!deviceVisual.childElementCount||deviceVisual.dataset.mode!==visualMode)) {
      deviceVisual.dataset.mode=visualMode;
      deviceVisual.innerHTML='<p class="eyebrow" data-copy="guide.usbEyebrow"></p><div class="usb-diagram"><span data-copy="guide.computer"></span><span aria-hidden="true">⟷</span><strong>micro:bit V2</strong></div><h4 data-copy="guide.usbHeading"></h4><p data-copy="guide.usbNote"></p><small data-copy="guide.usbWireless"></small>';
      applyLabCopy(deviceVisual, labels);
      if(wireless&&!usbRequired){
        deviceVisual.querySelector('h4').textContent=recovery?labels.guide.resetHeading:wirelessSuccess?labels.guide.installKeepPower:labels.guide.wirelessHeading;
        deviceVisual.querySelector('p:not(.eyebrow)').textContent=recovery?labels.guide.resetNote:wirelessSuccess?labels.guide.installKeepPowerNote:labels.guide.wirelessNote;
        deviceVisual.querySelector('small').textContent=labels.guide.wirelessFirstInstall;
        deviceVisual.querySelector('small').hidden=recovery||wirelessSuccess;
        if(recovery) deviceVisual.querySelector('.eyebrow').textContent=labels.guide.resetEyebrow;
      }
      if(content.illustrations){
        const illustration=wireless&&!usbRequired?content.illustrations.battery:content.illustrations.usb;
        const img=element('img','guide-usb-image');img.src=illustration.src;img.alt=illustration.alt;img.width=1440;img.height=900;img.decoding='async';
        if(recovery){
          img.src=new URL('../../public/assets/devices/posters/reset.png',import.meta.url).href;
          img.alt=labels.guide.resetImageAlt;
        } else if (visualMode==='usb' && shell.ownerDocument.documentElement.dataset.visualTheme === 'luminous') {
          img.src=new URL('../../public/assets/design/luminous-usb.png',import.meta.url).href;
          img.width=1200;img.height=1000;
        }
        deviceVisual.querySelector('.usb-diagram').replaceWith(img);
      }
    }
    // Keep the same illustration next to the action on small screens.
    const inlineReset=!deviceVisual.hidden&&recovery&&compact.matches;
    shell.dataset.inlineReset=String(inlineReset);
    const visualParent=inlineReset?program:preparationHost.parentElement;
    if(deviceVisual.parentElement!==visualParent)visualParent.insertBefore(deviceVisual,inlineReset?programActions:preparationHost);
    if (!model.hidden&&mode==='3d') loadViewer(); paintViewer();
    if (!reception.hidden) {
      for (const channel of context.channels) {
        const value=facts.latest?.values[channel.id], valid=facts.latest?.validity[channel.id]==='valid';
        setText(values.querySelector(`[data-channel="${channel.id}"]`),valid&&Number.isFinite(value)?value.toLocaleString('ko-KR',{maximumFractionDigits:channel.digits??2}):'—');
      }
      reception.dataset.fresh=String(state.canMeasure);
      const signal=facts.unsupported?'unsupported':facts.connecting?'connecting':!facts.connected?'disconnected':state.canMeasure?'receiving':'waiting';
      reception.dataset.state=signal;
      const receptionCopy={
        unsupported:[labels.guide.receptionTitle,labels.guide.unsupported],
        connecting:[labels.common.connecting,labels.guide.connectingNote],
        disconnected:[labels.common.disconnected,facts.receivedAt?labels.guide.staleNote:labels.guide.disconnectedNote],
        receiving:[labels.common.fresh,labels.guide.receivingNote],
        waiting:[labels.guide.receptionWaiting,facts.receivedAt?labels.guide.lastReadingNote:labels.guide.waitingNote],
      }[signal];
      setText(findElement(reception,'strong','.guide-reception-state strong'),receptionCopy[0]);
      setText(findElement(reception,'p','.guide-reception-state p'),receptionCopy[1]);
      setText(findElement(reception,'p','.guide-last-received'),facts.receivedAt?`${facts.receptionReady?labels.common.fresh:labels.common.checkReception} · ${formatCopy(labels.common.lastReceived,{time:new Date(facts.receivedAt).toLocaleTimeString('ko-KR',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})})}`:labels.guide.noReading);
      const calibration=state.observations.calibration, hasCalibration=steps.some(item=>item.kind==='calibration');
      const checks=findElement(reception,'ol','.guide-checks'), checksText=[
        [labels.guide.wireless,facts.connected?'complete':'pending'],[labels.guide.continuous,state.canMeasure?'complete':'pending'],
        ...(hasCalibration?[[calibration==='skipped'?labels.guide.calibrationSkipped:calibration==='unknown'?labels.guide.calibrationPending:labels.guide.calibrationDone,calibration==='skipped'?'skipped':calibration==='unknown'?'pending':'complete']]:[]),
        ...(step?.kind==='battery'?[[labels.guide.batteryCheck,step.complete?'complete':'pending']]:[])];
      const signature=JSON.stringify(checksText);
      if (checks.dataset.signature!==signature) {checks.dataset.signature=signature; checks.replaceChildren(...checksText.map(([label,state])=>element('li',state,`${state==='complete'?'✓':state==='skipped'?'—':'○'} ${label}`)));}
      findElement(reception,'ol','.calibration-instructions').hidden=!['calibration','reception'].includes(step?.kind)||!content.calibrationInstructions.length;
    }
    summary.hidden=!isSummary;
    const summarySignature=JSON.stringify([state.observations.calibration,steps.map(item=>[item.id,item.complete])]);
    if (isSummary&&summary.dataset.signature!==summarySignature) {
      summary.dataset.signature=summarySignature;
      findElement(summary,'ul','ul').replaceChildren(...steps.filter(item=>item.required).map(item=>{
        const skipped=item.kind==='calibration'&&state.observations.calibration==='skipped';
        const li=element('li',skipped?'skipped':item.complete?'complete':''), label=element('span','',`${item.complete?'✓':skipped?'—':'○'} ${skipped?labels.guide.calibrationSkipped:item.title}`), change=element('button','quiet-button',item.complete||skipped?labels.guide.review:labels.guide.check);
        change.type='button'; change.addEventListener('click',()=>select(item.id),{signal:contentAbort.signal}); li.append(label,change); return li;
      }));
    }
    quickPanel.hidden=!quick; for (const check of quickChecks.values()) check.disabled=locked();
    program.hidden=quick||step?.kind!=='program';
    installHelp.hidden=program.hidden||wireless; installHelp.disabled=Boolean(facts.busy||programmer.busy);
    const installing=Boolean(programmer.busy||['connecting','flashing'].includes(programmer.status));
    program.dataset.state=programmer.status??'idle'; program.setAttribute('aria-busy',String(installing));
    program.dataset.mode=installMode;
    program.dataset.tone=recovery||usbRequired||['error','unavailable'].includes(programmer.status)?'attention':programmer.status==='success'?'success':installing?'progress':'neutral';
    const programMessage=programmer.message||(programmer.status==='success'?labels.guide.programInstalled:labels.guide.programReady);
    const heading=usbRequired?labels.guide.installUsbRequired:recovery?labels.guide.installRecovery:({
      loading:labels.guide.installLoading, ready:labels.guide.installReady,
      connecting:!wireless||programmer.phase==='selecting'?labels.guide.installSelecting:programmer.phase==='finishing'?labels.guide.installFinishing:labels.guide.installWorking,
      flashing:labels.guide.installWorking, success:labels.guide.installSuccess,
      cancelled:labels.guide.installCancelled, error:labels.guide.installError, unavailable:labels.guide.installUnavailable,
    }[programmer.status]??labels.guide.installReady);
    installHeading.hidden=false; setText(installHeading,heading);
    setText(deviceNotice,recovery?labels.guide.installResetAction:programMessage);
    const detail=[programmer.deviceName,programmer.status==='flashing'&&Number.isFinite(programmer.progress)?`${Math.round(programmer.progress)}%`:''].filter(Boolean).join(' · ');
    setText(installDetail,detail); installDetail.hidden=!detail;
    const recoveryActions=recovery||usbRequired;
    modePanel.hidden=program.hidden||recoveryActions||wireless&&installing;
    setText(modePanel.querySelector('p'),wireless?labels.guide.usbModeHint:labels.guide.wirelessModeHint);
    const modeButton=buttons.get('install-mode'), modeParent=recoveryActions?programActions:modePanel;
    if(modeButton.parentElement!==modeParent)modeParent.append(modeButton);
    modeButton.textContent=wireless?labels.guide.usbMode:labels.guide.wirelessMode;
    modeButton.classList.toggle('primary',usbRequired); modeButton.classList.toggle('quiet-button',!usbRequired);
    modeButton.classList.toggle('install-mode-link',!recoveryActions);
    modeButton.disabled=locked()||facts.mock===true||facts.canInstall===false;
    bar.hidden=programmer.status!=='flashing'; if (programmer.progress==null) bar.removeAttribute('value'); else bar.value=programmer.progress;
    const deviceText=connectionStep?(facts.unsupported?labels.guide.unsupported:facts.deviceMessage??''):'';
    if (connectionNotice.dataset.message !== deviceText) {
      connectionNotice.dataset.message=deviceText;
      const resetLabel='리셋 버튼', resetIndex=deviceText.indexOf(resetLabel);
      if (resetIndex < 0) setText(connectionNotice,deviceText);
      else {
        const resetHelp=element('button','connection-help-inline',resetLabel);
        resetHelp.type='button'; resetHelp.dataset.connectionHelp='';
        resetHelp.setAttribute('aria-haspopup','dialog'); resetHelp.setAttribute('aria-controls','connection-troubleshooting');
        connectionNotice.replaceChildren(deviceText.slice(0,resetIndex),resetHelp,deviceText.slice(resetIndex+resetLabel.length));
      }
    }
    connectionNotice.hidden=!deviceText||Boolean(managed&&facts.connected&&presentation.hideValues);
    const show=new Set(['previous']);
    if (quick) show.add('quick-confirm'); else if (isSummary) show.add('measure'); else if (!preparationView?.handlesProgression(step?.id)) {
      show.add(['manual','calibration'].includes(step?.kind) ? 'confirm' : 'next');
    }
    if (connectionStep && state.canMeasure) {
      show.add('measure');
      // Once the remaining checks are complete, measurement is the next action.
      // Keep progression available when an activity still has preparation to do.
      if (state.ready && steps.slice(index + 1).every(item => item.complete)) show.delete('next');
    }
    if (step?.kind==='program'&&!quick) {
      if(!usbRequired&&(!wireless||!installing))show.add('install');
      if(programmer.status!=='success'&&(!wireless||!installing&&!recoveryActions))show.add('program-confirm');
      if(wireless&&programmer.busy)show.add('cancel-install');
      if(wireless&&(installing||recoveryActions))show.delete('next');
    }
    if (connectionStep) {if (facts.connected||facts.connecting) show.add('disconnect'); else {show.add('connect'); if (facts.canReconnect) show.add('reconnect');} if (step?.kind==='battery') show.add('battery');}
    connectionHelp.hidden=!connectionStep;
    for (const id of ['previous','confirm','next','measure','quick-confirm','install','program-confirm','cancel-install','connect','reconnect','disconnect','battery']) {const node=buttons.get(id); node.hidden=!show.has(id); node.disabled=locked();}
    buttons.get('previous').disabled=Boolean(facts.programmerState?.busy)||(!quick&&index===0); buttons.get('previous').hidden=quick;
    buttons.get('confirm').textContent=step?.action??labels.guide.confirm; buttons.get('confirm').disabled ||= step?.kind==='calibration'&&!facts.connected;
    buttons.get('next').disabled=locked()||!step?.complete; buttons.get('next').textContent=index===steps.length-1?labels.guide.nextSummary:labels.guide.nextConfirmed;
    buttons.get('next').classList.toggle('primary',!show.has('measure'));
    buttons.get('measure').disabled=locked()||!state.canMeasure;
    buttons.get('quick-confirm').disabled ||= [...quickChecks.values()].some(check=>!check.checked);
    buttons.get('install').disabled ||= facts.canInstall===false||facts.mock===true||programmer.status==='unavailable';
    buttons.get('install').setAttribute('aria-busy',String(installing));
    buttons.get('install').textContent=programmer.busy?labels.guide.installing:['error','cancelled'].includes(programmer.status)?labels.guide.retryInstall:programmer.status==='success'?labels.guide.reinstall:labels.guide.install;
    if(wireless) buttons.get('install').textContent=programmer.busy?labels.guide.installing:programmer.status==='recovery'?labels.guide.retryConnection:['error','cancelled'].includes(programmer.status)?labels.guide.wirelessRetry:programmer.status==='success'?labels.guide.reinstall:labels.guide.wirelessInstall;
    buttons.get('install').classList.toggle('primary',!wirelessSuccess); buttons.get('install').classList.toggle('quiet-button',wirelessSuccess);
    buttons.get('install').disabled ||= programmer.usbRequired===true;
    buttons.get('cancel-install').disabled=false;
    buttons.get('connect').disabled ||= facts.canConnect===false; buttons.get('connect').textContent=facts.canReconnect?labels.common.chooseDevice:facts.mock&&!facts.tour?labels.common.mockConnect:labels.common.connect;
    buttons.get('reconnect').disabled ||= facts.canConnect===false;
    buttons.get('disconnect').textContent=facts.connecting?labels.common.cancelConnection:labels.common.disconnect; buttons.get('disconnect').disabled=Boolean(facts.programmerState?.busy);
    buttons.get('battery').disabled ||= !facts.connected; deviceActions.hidden=!connectionStep; wiringNote.hidden=step?.group!=='wiring'||!content.wiringTable?.note;
    const noteText=facts.recording?labels.guide.reconnectNote:facts.mock&&step?.kind==='program'?facts.tour?'프로그램이 준비된 예시 장치를 사용합니다.':labels.guide.mockProgramNote:step?.kind==='program'?'':step?.kind==='battery'&&state.observations.battery.startedAt!==null?step.complete?labels.guide.batterySeen:labels.guide.batteryWaiting:step?.kind==='calibration'&&!managed?labels.guide.calibrationNote:'';
    setText(note,noteText); note.hidden=!noteText;
    copy.dataset.group=step?.group??''; layout?.measure(); layout?.syncProgress();
    renderedStep=nextStep;
    renderedProgram=program.hidden?null:programSignature;
    if(stepChanged) layout?.transition(nextStep,previousStep,stepHeights);
    else if(modeChanged) layout?.transitionContent([description,program,deviceVisual],{previousHeights});
    else if(programChanged) layout?.transitionContent([],{previousHeights});
  }
  return {
    /** @param {import('../guide/types.js').ExperimentContext} nextContext */
    open(nextContext,{reset=false,prepared=false}={}) {
      if (disposed) return;
      shell.hidden=false;
      if (reset||context?.sensor?.id!==nextContext.sensor.id||context?.sensor?.version!==nextContext.sensor.version) {viewer?.dispose(); viewer=null; viewerState='idle'; mode='3d'; frame.removeAttribute('src'); delete frame.dataset.step; delete model.dataset.viewerState;}
      context=structuredClone(nextContext); content=getGuideContent(context); labels=getLabCopy(context);
      if (!progress||reset) {progress=createGuideProgress(context); facts={}; selectedId='equipment';} else progress.setContext(context);
      quick=prepared; if (quick) selectedId='quick'; else if (!currentStep()) selectedId='equipment'; renderedStep=null; renderedProgram=null; buildContent(); paint();
    },
    /** @param {import('../guide/types.js').GuideFacts} nextFacts */
    render(nextFacts) {if (!progress||disposed) return; facts={...nextFacts}; progress.setAttempt(facts.attemptId); progress.observe(facts); paint();},
    showPrepared() {if (!locked()) {quick=true; selectedId='quick'; paint();}},
    // App-directed preparation is painted with the next live facts, even when
    // the connection action is still busy. Never reset to the equipment page.
    showDevicePreparation(stepId) {if (progress?.getState().steps.some(step => step.id === stepId)) {quick=false; selectedId=stepId; suggestion='';}},
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
