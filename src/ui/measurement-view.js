import { bindDisclosureMenu } from './disclosure-menu.js';
// D's channel selection and live cards, using the shared G chart adapter and RunStore.
import { createChartView } from './chart-view.js';
import { readCell } from '../domain/columns.js';
import { element, findElement } from './dom.js';
import { setText } from './text.js';
import { getLabCopy, applyLabCopy, formatCopy } from './lab-copy.js';
import { readVisualTheme, channelColor, channelTextColor } from './visual-theme.js';
import { createMeasurementEvents } from './measurement-events.js';
import { createMeasurementPoints } from './measurement-points.js';
import { createViewportLayout } from './viewport-layout.js';
import { STANDARD_GRAVITY, isSIAcceleration } from '../domain/acceleration-units.js';
import { timeOrigin } from '../analysis/scope.js';

/** @param {ParentNode} root @param {()=>void} onChange @param {(event:any)=>void} [onEditNote] @param {(number:number)=>void} [onSelectPoint] */
export function createMeasurementView(root,onChange,onEditNote = null,onSelectPoint = () => {}) {
  const fields=findElement(root,'div','#display-channels'), range=findElement(root,'details','#live-range');
  const cards=findElement(root,'div','#live-cards'), chartSummary=findElement(root,'p','#live-chart-summary');
  const unitToggle=findElement(root,'button','#acceleration-unit-toggle');
  const reception=findElement(root,'p','#measurement-reception'), abort=new AbortController();
  createViewportLayout(findElement(root,'section','[data-screen="measure"]'), {
    regions:[findElement(root,'div','.luminous-graph')], signal:abort.signal,
  });
  const receptionState=element('span'), receptionTime=element('span');
  reception.replaceChildren(receptionState,receptionTime);
  let contentAbort=new AbortController();
  let context=null, selected=new Set(), chart=null, chartKey='', runId=null, rows=[], events=[], eventCount=-1;
  let copy = getLabCopy(null);
  let theme = null;
  let painted = null;
  let inG = false;
  const eventView = root.querySelector('.luminous-overview') ? createMeasurementEvents(root.querySelector('#lab-events'), root.querySelector('.lab-chart'),onEditNote) : null;
  const plot = findElement(root,'div','.lab-chart'), pointMarkers = createMeasurementPoints(plot, onSelectPoint);
  let pointRevision = -1, pointRecords = [], manualColumns = [], markerOffset = 0, markerHeight = 48;
  const markerMetrics = () => {
    const scale = parseFloat(getComputedStyle(plot.ownerDocument.documentElement).fontSize) / 16;
    return { labelWidth:116*scale, labelGap:8*scale, laneHeight:48*scale };
  };
  function layoutMarkers() {
    const geometry = chart?.timeGeometry(), metrics = markerMetrics();
    if (metrics.laneHeight !== markerHeight) onChange();
    const layout = geometry ? {...geometry, ...metrics} : null;
    eventView?.layout(layout); pointMarkers.layout(layout, markerOffset);
  }
  let rangeValue='recent';
  bindDisclosureMenu(range,{signal:abort.signal});
  range.addEventListener('click',event=>{
    const button=event.target instanceof Element ? event.target.closest('[data-live-range]') : null;
    if(!button)return;
    rangeValue=button.getAttribute('data-live-range');onChange();
  },{signal:abort.signal});
  unitToggle.addEventListener('click',()=>{
    inG=!inG;unitToggle.setAttribute('aria-pressed',String(inG));onChange();
  },{signal:abort.signal});
  const displayValue=(value,channel)=>inG&&channel.quantity==='acceleration' ? value/STANDARD_GRAVITY : value;
  function configure(next) {
    if(context===next)return;
    contentAbort.abort();contentAbort=new AbortController();
    context=next;chart?.dispose();chart=null;chartKey='';runId=null;rows=[];events=[];eventCount=-1;rangeValue='recent';
    pointRevision=-1;pointMarkers.reset();
    range.open=false;
    inG=false;unitToggle.setAttribute('aria-pressed','false');
    unitToggle.hidden=!next.channels.every(isSIAcceleration);
    copy = getLabCopy(next);
    theme = readVisualTheme(root,next.channels);
    applyLabCopy(root.querySelector('[data-screen="measure"]') ?? root, copy);
    const defaults=next.classConfig?.presentation?.visibleChannelIds??next.sensor?.defaultVisibleChannelIds??next.channels.map(channel=>channel.id);
    selected=new Set(defaults.filter(id=>next.channels.some(channel=>channel.id===id)));
    if(!selected.size&&next.channels.length)selected.add(next.channels[0].id);
    fields.replaceChildren(...next.channels.map(channel=>{
      const label=element('label','channel-option'), input=element('input');input.type='checkbox';input.value=channel.id;input.checked=selected.has(channel.id);
      label.append(input,element('span','',channel.name));label.style.setProperty('--channel-color',channelColor(theme,channel,next.channels.indexOf(channel)));
      label.style.setProperty('--channel-text-color',channelTextColor(theme,channel,next.channels.indexOf(channel)));
      input.addEventListener('change',()=>{
        if(!input.checked&&selected.size===1){input.checked=true;return;}
        if(input.checked)selected.add(channel.id);else selected.delete(channel.id);
        onChange();
      },{signal:contentAbort.signal});return label;
    }));
    cards.replaceChildren(...next.channels.map(channel=>{
      const card=element('div','lab-card');card.dataset.channel=channel.id;
      card.style.setProperty('--channel-color',channelColor(theme,channel,next.channels.indexOf(channel)));
      card.style.setProperty('--channel-text-color',channelTextColor(theme,channel,next.channels.indexOf(channel)));
      const value = element('strong','','—'), unit = element('small','',channel.unit??'');
      card.append(element('span','',channel.name));
      if (theme) { const readout=element('div','measurement-readout'); readout.append(value,unit); card.append(readout); }
      else card.append(value,unit);
      return card;
    }));
  }
  return {
    render({context:next,store,latest,previewPoints,device,recording}) {
      configure(next);
      unitToggle.textContent='m/s² | g';
      unitToggle.setAttribute('aria-label',inG?'현재 g 단위, m/s²로 보기':'현재 m/s² 단위, g로 보기');
      const displayChannels=inG?next.channels.map(channel=>({...channel,unit:'g',digits:3})):next.channels;
      const saved=store?.getState(), stored=Boolean(saved?.sampleCount), reading=latest??store?.getLatestSample();
      for(const channel of displayChannels){
        const card=cards.querySelector(`[data-channel="${channel.id}"]`), value=card.querySelector('strong');
        const cell=reading?readCell(reading,channel.id):{value:null,reason:'값 없음'};
        const text=cell.reason?'—':displayValue(cell.value,channel).toLocaleString('ko-KR',{maximumFractionDigits:channel.digits??2});
        if(value.textContent!==text)value.textContent=text;
        setText(card.querySelector('small'),channel.unit??'');
      }
      const fresh=device.status==='connected'&&device.confirmed;
      reception.dataset.fresh=String(fresh);
      const received=latest?.receivedAt??store?.getLatestSample()?.receivedAt;
      setText(receptionState,fresh?copy.common.fresh:device.status==='connecting'?copy.common.connecting:device.status==='connected'?copy.common.checkReception:stored?copy.measurement.storedValues:copy.measurement.waiting);
      setText(receptionTime,received?formatCopy(copy.common.lastReceived,{time:new Date(received).toLocaleTimeString('ko-KR',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}):'');
      const id=saved?.id??null;
      if(id!==runId){runId=id;rows=[];events=[];eventCount=-1;pointRevision=-1;pointMarkers.reset();}
      if(stored&&saved.lastSampleId!==(rows.at(-1)?.sampleId??0))rows.push(...store.readSamples({afterId:rows.at(-1)?.sampleId??0}));
      if(saved&&saved.eventsVersion!==eventCount){eventCount=saved.eventsVersion;events=store.getEvents(Number.MAX_SAFE_INTEGER);}
      if(saved&&saved.pointDataRevision!==pointRevision){
        pointRevision=saved.pointDataRevision;manualColumns=store.getRun().manualColumns;
        pointRecords=store.getPointRecords().filter(point=>!point.withdrawn).map(point=>({...point,
          receivedAt:store.readSamples({afterId:point.capturedSampleId-1,throughId:point.capturedSampleId})[0].receivedAt}));
        pointMarkers.render(pointRecords,next,manualColumns);
      }
      const source=stored?rows:previewPoints, end=recording||!stored?Date.now():source.at(-1)?.receivedAt??Date.now();
      const points=rangeValue==='all'?source:source.filter(point=>!Number.isFinite(point.receivedAt)||point.receivedAt>=end-60000);
      const channels=displayChannels.filter(channel=>selected.has(channel.id)), key=channels.map(channel=>channel.id).join('|')+':'+inG;
      eventView?.render(events,next,saved?.writable===true);
      if(chartKey!==key||!chart){chart?.dispose();chart=createChartView(findElement(root,'canvas','#live-chart'),{context:next,channels,displayValue,legendToggle:false,theme,eventMarkers:!eventView,onLayout:layoutMarkers});chartKey=key;painted=null;}
      // Frozen stored data need no redraw while fresh device readings still update
      // the cards. Recording/preview retain their moving time axis.
      const unchanged = stored && !recording && !painted?.recording && painted?.source===source && painted.count===source.length
        && painted.last===source.at(-1) && painted.events===events && painted.range===rangeValue && painted.pointRevision===pointRevision
        && painted.markerHeight===markerMetrics().laneHeight;
      if(!unchanged){
        const from=rangeValue==='all'?source[0]?.receivedAt:end-60000;
        markerHeight=markerMetrics().laneHeight;
        markerOffset=eventView?.hasVisibleMarkers(from,end)?markerHeight:0;
        const bottomPadding=markerOffset+(pointMarkers.hasVisibleMarkers(from,end)?markerHeight:0);
        chart.render(points,performance.now(),{range:rangeValue,events,origin:timeOrigin(source,saved??{}),nowUtc:end,bottomPadding});
        painted={source,count:source.length,last:source.at(-1),events,range:rangeValue,recording,pointRevision,markerHeight};
      }
      layoutMarkers();
      chartSummary.textContent=formatCopy(copy.measurement.chartSummary,{range:rangeValue==='all'?copy.measurement.all:copy.measurement.recent,count:points.length.toLocaleString('ko-KR')});
      range.querySelector('[data-live-range="all"]').textContent=stored?copy.measurement.allRecords:copy.measurement.allPreview;
      for(const button of range.querySelectorAll('[data-live-range]'))button.setAttribute('aria-pressed',String(button.getAttribute('data-live-range')===rangeValue));
      setText(root.querySelector('#live-range-label'),range.querySelector('[data-live-range="'+rangeValue+'"]').textContent);
      range.querySelector('summary').setAttribute('aria-label','그래프 표시 구간: '+root.querySelector('#live-range-label').textContent);
    },
    reset(){
      contentAbort.abort();chart?.dispose();chart=null;context=null;chartKey='';runId=null;
      rows=[];events=[];eventCount=-1;selected.clear();fields.replaceChildren();cards.replaceChildren();
      inG=false;unitToggle.hidden=true;unitToggle.setAttribute('aria-pressed','false');
      chartSummary.textContent='';receptionState.textContent='';receptionTime.textContent='';
      eventView?.render([],null);eventView?.layout(null);
      pointRevision=-1;pointMarkers.reset();
    },
    dispose(){abort.abort();contentAbort.abort();chart?.dispose();eventView?.dispose();pointMarkers.dispose();},
  };
}
