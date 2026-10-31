// Adapted from Cho-WH/bme280 gay-lussac/ui/chart-view.js at 59c5c149450f970bace2deaa183857c275595853.
import { getSourceColumns, readCell } from '../domain/columns.js';
import { columnLabel } from '../analysis/calculations.js';
import { clockTime, formatClockTime, formatElapsedTime } from '../analysis/clock-time.js';
import { formatCalculated } from '../analysis/calculations.js';
import { trendSummary } from './trend-summary.js';
import { channelColor as resolveChannelColor, channelTextColor, analysisSeriesColors } from './visual-theme.js';
import { groupChartAxes } from './chart-axes.js';
import { createElapsedAxis } from './elapsed-axis.js';
import { createAxisRangeState, axisRangeKey, axisRangePolicy, sampleExtent } from './chart-ranges.js';
import { createChartAxisControls } from './chart-axis-controls.js';

// Keep axis lettering at its original size; only the plot bitmap stretches.
function captureLayoutPreview(chart) {
  const { canvas, chartArea: area, width, height } = chart;
  const layer = document.createElement('div'), pieces = [];
  layer.className = 'chart-layout-preview'; layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
  const ratioX = canvas.width / width, ratioY = canvas.height / height;
  function piece(x, y, w, h, transform) {
    if (w <= 0 || h <= 0) return;
    const image = document.createElement('canvas');
    image.width = Math.ceil(w * ratioX); image.height = Math.ceil(h * ratioY);
    image.getContext('2d').drawImage(canvas, x * ratioX, y * ratioY, w * ratioX, h * ratioY, 0, 0, image.width, image.height);
    image.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform-origin:0 0;will-change:transform`;
    layer.append(image); pieces.push({ image, transform });
  }
  const plotWidth = area.right - area.left, plotBottom = Math.ceil(area.bottom + 1);
  piece(0, 0, area.left, plotBottom, () => 'none');
  piece(area.left, 0, plotWidth, plotBottom, delta => `scaleX(${Math.max(0, plotWidth + delta) / plotWidth})`);
  piece(area.right, 0, width-area.right, plotBottom, delta => `translateX(${delta}px)`);
  const title = chart.options.scales.x.title;
  const titleHeight = title.display ? globalThis.Chart.helpers.toFont(title.font).lineHeight
    + globalThis.Chart.helpers.toPadding(title.padding).height : 0;
  const titleTop = Math.max(plotBottom, height - titleHeight);
  const ticks = chart.scales.x.ticks.map((_, index) => chart.scales.x.getPixelForTick(index));
  for (const [index, x] of ticks.entries()) {
    const left = index ? (ticks[index - 1] + x) / 2 : 0;
    const right = index + 1 < ticks.length ? (x + ticks[index + 1]) / 2 : width;
    piece(left, plotBottom, right - left, titleTop - plotBottom,
      delta => `translateX(${(x - area.left) / plotWidth * delta}px)`);
  }
  piece(0, titleTop, width, height - titleTop, delta => `translateX(${delta / 2}px)`);
  canvas.parentElement.append(layer);
  return {
    resize(nextWidth) { for (const { image, transform } of pieces) image.style.transform = transform(nextWidth - width); },
    remove() { layer.remove(); },
  };
}

export function createAnalysisChart(canvas, { onSelect = (_sampleId) => {}, responsive = true, theme = null } = {}) {
  if (!globalThis.Chart) throw new Error('그래프 도구를 불러오지 못했어요. 화면을 새로 열어 주세요.');
  let model = null, preview = null, pendingRender = null;
  let elapsedTick = createElapsedAxis();
  const clock = value => formatClockTime(clockTime(value));
  const chart = new globalThis.Chart(canvas, {
    type: 'scatter', data: { datasets: [] },
    options: {
      responsive: false, maintainAspectRatio: false, animation: false, parsing: false,
      ...(responsive ? {} : { devicePixelRatio: 1 }),
      interaction: { mode: 'nearest', intersect: true },
      elements: { point: { radius: 3, hitRadius: 7 }, line: { borderWidth: 1.5 } },
      onClick(event, elements) {
        const hit = elements.find(e => chart.data.datasets[e.datasetIndex].data[e.index]?.sampleId);
        onSelect(hit ? chart.data.datasets[hit.datasetIndex].data[hit.index].sampleId : null);
      },
      plugins: {
        legend: { display: false },
        tooltip: { ...(theme ? {titleFont:{family:theme.font}, bodyFont:{family:theme.font}} : {}), filter: item => Boolean(item.raw.sampleId) || item.dataset.isIntercept === true, callbacks: {
          title: items => items[0].dataset.isIntercept ? 'x절편' : items[0].raw.pointRecordId ? items[0].raw.pointRecordId + '번 기록' : '자료 ' + items[0].raw.sampleId,
          label: item => {
            const series=item.dataset.seriesModel??model;
            const time = series.xColumnId === 'receivedAt';
            const coordinates = [series.xLabel + ': ' + formatCalculated(item.raw.x) + (time ? '초' : ''),
              series.yLabel + ': ' + formatCalculated(item.raw.y)];
            if (time && !item.dataset.isIntercept) coordinates.push('수신 시각: ' + clock(item.raw.receivedAt));
            if (!item.dataset.isIntercept) return [item.dataset.label, ...coordinates];
            return coordinates;
          },
        } },
      },
      scales: {
        ...Object.fromEntries(['x','y'].map(axis => [axis, {
          type:'linear', title:{display:true, ...(theme ? {color:theme.text, font:{family:theme.font,size:13}} : {})},
          ticks:{...(axis === 'x' ? {maxTicksLimit:6} : {}), ...(theme ? {maxTicksLimit:6,color:theme.text, font:{family:theme.font,size:12}} : {})},
          ...(axis === 'x' ? { afterBuildTicks(scale) {
            if (model?.xColumnId !== 'receivedAt') return;
            elapsedTick = createElapsedAxis(scale.ticks.map(tick => tick.value));
          } } : {}),
          grid:{color:theme?.grid ?? '#edf1f2'}, ...(theme ? {border:{color:theme.grid}} : {}),
        }])),
      },
    },
  });
  // During a layout transition only the captured bitmap is transformed. Keep
  // the expensive point layout and canvas redraw for the final size.
  function resize() {
    if (!responsive) return false;
    const { clientWidth: width, clientHeight: height } = canvas.parentElement;
    if (preview) {
      preview.resize(width);
      return false;
    }
    if (width <= 0 || height <= 0 || getComputedStyle(canvas).visibility === 'hidden') return false;
    if (chart.width === width && chart.height === height && chart.currentDevicePixelRatio === window.devicePixelRatio) return false;
    chart.resize(width, height);
    return true;
  }
  function clearPreview() {
    preview?.remove(); preview = null;
    canvas.style.removeProperty('opacity'); canvas.style.removeProperty('pointer-events');
  }
  const observer = responsive ? new ResizeObserver(resize) : null;
  observer?.observe(canvas.parentElement);
  if (responsive) window.addEventListener('resize', resize);
  const view = {
    beginLayoutTransition() {
      if (!responsive || !model || chart.width <= 0 || chart.height <= 0 || !(chart.chartArea?.right > chart.chartArea?.left)) return;
      if (preview) return; // Rapid reversals continue from the current transform.
      chart.setActiveElements([]);
      chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
      chart.draw();
      preview = captureLayoutPreview(chart);
      canvas.style.opacity = '0'; canvas.style.pointerEvents = 'none';
      resize();
    },
    endLayoutTransition() {
      if (!preview) return;
      // Reveal only after the final canvas has been drawn in this same task.
      const snapshot = preview; preview = null;
      const pending = pendingRender; pendingRender = null;
      try {
        if (pending) view.render(...pending); else resize();
      } finally { snapshot.remove(); clearPreview(); }
    },
    render(next, selectedIds = []) {
      if (preview) { pendingRender = [next, selectedIds]; return; }
      model = next;
      const series=[model,...(model.right?[model.right]:[])], palettes=analysisSeriesColors(theme,model);
      const axisGroups=groupChartAxes(series.map((item,index)=>({id:String(index),name:item.yLabel,unit:item.yUnit,
        quantity:item.yQuantity,quantityLabel:item.yQuantityLabel})));
      const shared=Boolean(model.right && axisGroups.length===1);
      const selected=new Set(selectedIds);
      chart.data.datasets=series.flatMap((item,index)=>{
        const colors=palettes[index], yAxisID=index&&!shared?'yRight':'y';
        const common={yAxisID,seriesModel:item}, prefix=model.right?item.yLabel+' · ':'';
        const color=c=>selected.has(c.raw?.sampleId)?colors.focused:colors.point;
        /** @type {any[]} Chart.js accepts both point and line datasets. */
        const datasets=[
          {...common,label:prefix+'분석 포함',legendSeries:true,data:item.type==='line'?item.line:item.points,showLine:item.type==='line',spanGaps:false,
            borderColor:colors.point,pointBackgroundColor:color,pointBorderColor:color,pointRadius:c=>selected.has(c.raw?.sampleId)?5:3},
          {...common,label:prefix+'제외',data:item.excludedPoints,pointStyle:'circle',pointRadius:4,pointBorderWidth:1.5,
            pointBackgroundColor:'#ffffffcc',pointBorderColor:c=>selected.has(c.raw?.sampleId)?colors.focused:colors.excluded},
        ];
        const line=(label,data,dashed=false)=>({...common,label:prefix+label,data,showLine:true,pointRadius:0,pointHitRadius:0,
          borderColor:colors.trend,borderWidth:1.8,borderDash:dashed?[6,4]:[],order:1});
        if(item.trend?.measured.length){
          datasets.push(line('추세선',item.trend.measured),line('연장선',item.trend.extension,true));
          if(item.trend.intercept.length)datasets.push({...common,label:prefix+'x절편',isIntercept:true,data:item.trend.intercept,
            pointStyle:'cross',pointRadius:6,pointHitRadius:7,pointBorderColor:colors.trend,pointBorderWidth:2});
        }
        return datasets;
      });
      if (model.xColumnId === 'receivedAt') {
        const origin = model.timeOrigin ?? 0;
        for (const dataset of chart.data.datasets) dataset.data = dataset.data.map(point => ({
          ...point, receivedAt: point.x, x: (point.x - origin) / 1000,
        }));
      }
      chart.options.plugins.legend={display:Boolean(model.right),position:'top',onClick:()=>{},labels:{usePointStyle:true,boxWidth:8,
        color:theme?.text??'#53657d',font:{family:theme?.font,size:12},filter:(_item,data)=>data.datasets[_item.datasetIndex].legendSeries===true}};
      if(model.right&&!shared){
        chart.options.scales.yRight={type:'linear',position:'right',title:{display:true,text:model.right.yLabel,color:palettes[1].pointText??palettes[1].point,
          font:{family:theme?.font,size:13}},ticks:{color:theme?.text??'#53657d',maxTicksLimit:6,font:{family:theme?.font,size:12}},grid:{drawOnChartArea:false}};
      }else delete chart.options.scales.yRight;
      chart.options.scales.x.title.text = model.xLabel;
      chart.options.scales.y.title.text = shared ? axisGroups[0].label : model.yLabel;
      chart.options.scales.y.title.color = shared?theme?.text??'#53657d':palettes[0].pointText??palettes[0].point;
      chart.options.scales.x.ticks.callback = model.xColumnId === 'receivedAt' ? value => elapsedTick(value) : value => formatCalculated(value);
      if (!resize()) chart.update('none');
    },
    dispose() { observer?.disconnect(); window.removeEventListener('resize', resize); clearPreview(); pendingRender = null; chart.destroy(); },
  };
  return view;
}

// Render from a captured display model, including when the visible chart is hidden.
// A separate fixed-size chart keeps download size independent of the window and view mode.
export function exportAnalysisPng(model, { name = '', selectedIds = [], theme = null } = {}) {
  if (!model) throw new Error('먼저 분석 그래프를 만드세요.');
  const plot = document.createElement('canvas'); plot.width = 1200; plot.height = 640;
  const view = createAnalysisChart(plot, { responsive: false, theme });
  try {
    view.render(model, selectedIds);
    const output = document.createElement('canvas'), ctx = output.getContext('2d');
    const font = theme?.font || '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    const series = [model,...(model.right?[model.right]:[])];
    const wrap = (text, size, weight = '') => {
      ctx.font = `${weight} ${size}px ${font}`.trim();
      const lines = []; let line = '';
      for (const char of text) {
        if (line && ctx.measureText(line + char).width > 1152) { lines.push(line); line = ''; }
        line += char;
      }
      if (line) lines.push(line);
      return lines;
    };
    const title = wrap(name || '센서 실험 분석', 22, 'bold');
    const caption = series.flatMap(item => { const summary=trendSummary(item); return [model.right ? item.yLabel + ': ' + summary.equation : summary.equation, summary.detail]; }).filter(Boolean).flatMap(t => wrap(t, 17));
    const counts = series.map(item => (model.right ? item.yLabel + ' ' : '') + '그래프 ' + item.points.length + '개' + (item.invalidCount ? ' · 값 없음 ' + item.invalidCount + '개' : '') + ' · ' + (item.view === 'extended' ? '추세선 연장' : '측정 범위')).join(' / ');
    const metadata = wrap('분석 포함 ' + (model.includedCount ?? model.points.length) + '개 · 제외 ' + (model.excludedCount ?? model.excludedPoints.length) + '개 · ' + counts + '   ● 분석 포함   ○ 제외', 16);
    const plotTop = 24 + title.length * 30 + metadata.length * 24 + 12;
    output.width = 1200; output.height = plotTop + 640 + caption.length * 26 + 28;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, output.width, output.height);
    ctx.textBaseline = 'top'; ctx.fillStyle = theme?.text ?? '#263b40'; ctx.font = `bold 22px ${font}`;
    title.forEach((text, i) => ctx.fillText(text, 24, 20 + i * 30));
    ctx.font = `16px ${font}`;
    metadata.forEach((text,i) => ctx.fillText(text,24,24 + title.length * 30 + i * 24));
    ctx.drawImage(plot, 0, plotTop); ctx.font = `17px ${font}`;
    caption.forEach((text, i) => ctx.fillText(text, 24, plotTop + 648 + i * 26));
    return output.toDataURL('image/png');
  } finally { view.dispose(); }
}

/** @param {HTMLCanvasElement} canvas @param {any} options */
export function createChartView(canvas, { context, channels, displayValue = (value, _channel) => value, axisPolicies = {}, axisState = createAxisRangeState(), inspect = false, tooltip = !inspect, legendToggle = true, theme = null, eventMarkers = true, responsive = true, pixelRatio = undefined, onCursor = () => {}, onLayout = () => {} } = {}) {
  if (!globalThis.Chart) throw new Error('그래프 도구를 불러오지 못했어요. 화면을 새로 열어 주세요.');
  const sourceChannels = getSourceColumns(channels ?? context).filter(c => !['sampleId', 'pointRecordId', 'receivedAt'].includes(c.id) && !c.manual && c.supported !== false);
  const colors = ['#d67b40', '#197f88', '#8d65b1', '#43854d'];
  const channelColor = (c, i) => theme ? resolveChannelColor(theme,c,i) : c.color ?? colors[i % colors.length];
  const axisGroups = groupChartAxes(sourceChannels);
  const axisIds = new Map(axisGroups.flatMap(group=>group.channels.map(channel=>[channel.id,group.id])));
  const axisModels = axisGroups.map(group => {
    const native = group.channels.map(channel => context?.channels?.find(item => item.id === channel.id) ?? channel);
    return { group, channels:native, key:axisRangeKey(native), policy:axisRangePolicy(native,axisPolicies), visible:null };
  });
  let rangeStates = [], ready = false;
  const controls = createChartAxisControls(canvas, axisGroups, id => {
    const model = axisModels.find(item => item.group.id === id);
    axisState.toggle(model.key); applyRanges(); chart.update('none');
  });
  function applyRanges() {
    rangeStates = axisModels.map(model => {
      const state = axisState.view(model.key, model.visible, model.policy.detailSpan);
      const options = chart.options.scales[model.group.id], channel = model.channels[0];
      options.min = state.bounds ? displayValue(state.bounds.min, channel) : undefined;
      options.max = state.bounds ? displayValue(state.bounds.max, channel) : undefined;
      return { ...state, hasData:Boolean(model.visible) };
    });
  }
  function layout() { if (ready) controls.layout(chart, rangeStates); onLayout(); }
  const scales = Object.fromEntries(axisGroups.map((group, i) => [group.id, {
    type: 'linear', position: i % 2 ? 'right' : 'left',
    title: { display: true, text: group.label,
      color: group.channels.length>1 ? theme?.text ?? '#53657d' : channelTextColor(theme,group.channels[0],sourceChannels.indexOf(group.channels[0])),
      ...(theme ? {font:{family:theme.font,size:12}} : {}) },
    ticks: theme ? {color:theme.text,font:{family:theme.font,size:11},maxTicksLimit:6} : {},
    border: theme ? {color:theme.grid} : {},
    grid: { drawOnChartArea: i === 0, color: theme?.grid ?? '#edf1f2' },
  }]));
  let currentPoints = [], timeOrigin = 0, cursor = null, pinnedCursor = null, hasTime = false;
  let elapsedTick = createElapsedAxis();
  const chart = new globalThis.Chart(canvas, {
    type: 'line',
    plugins: inspect ? [{ id: 'shared-time-cursor',
      afterEvent(c, { event, inChartArea }) {
        if (event.type === 'mouseout' || !inChartArea) { cursor = null; onCursor(null); c.draw(); return; }
        if (!currentPoints.length) return;
        const coordinate = c.scales.x.getValueForPixel(event.x);
        const at = hasTime ? coordinate * 1000 + timeOrigin : coordinate;
        const value = p => hasTime ? p.receivedAt : p.sampleId;
        const point = currentPoints.reduce((best, p) => Math.abs(value(p) - at) < Math.abs(value(best) - at) ? p : best);
        cursor = hasTime ? (point.receivedAt - timeOrigin) / 1000 : point.sampleId; onCursor(point, hasTime ? cursor : null); c.draw();
      },
      afterDraw(c) {
        if ((cursor !== null || pinnedCursor !== null) && c.chartArea) {
          const x = c.scales.x.getPixelForValue(cursor ?? pinnedCursor), { top, bottom } = c.chartArea, ctx = c.ctx;
          ctx.save(); ctx.strokeStyle = '#718b94'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
        }
        layout();
      },
    }] : [{id:'measurement-layout',afterDraw:()=>layout()}],
    data: { datasets: sourceChannels.map((c, i) => ({ label: columnLabel(c), yAxisID: axisIds.get(c.id), borderColor: channelColor(c, i), backgroundColor: channelColor(c, i), data: [] })) },
    options: {
      responsive, devicePixelRatio: pixelRatio, maintainAspectRatio: false, animation: false,
      layout: {padding: {top: controls.active ? 44 : 0, bottom: 0}},
      parsing: false, spanGaps: false,
      elements: { point: { radius: 0, hitRadius: 8 }, line: { borderWidth: 2 } },
      plugins: { tooltip: { enabled: Boolean(tooltip), ...(tooltip === 'time' ? {mode:'index',axis:'x',intersect:false,position:'nearest'} : {}), callbacks: {
        title: items => hasTime ? formatElapsedTime(items[0]?.raw.elapsedSeconds) : '자료 ' + items[0]?.raw.sampleId,
      } }, legend: { display: inspect || !theme, position: 'bottom', labels: { usePointStyle: true, boxWidth: 7,
        color: theme?.text ?? '#53657d', font: { size: 12, family: theme?.font } } } },
      scales: {
        x: { type: 'linear', min: -60, max: 0,
          title: { display: true, text: '지금으로부터', ...(theme ? {color:theme.text,font:{family:theme.font,size:12}} : {}) },
          ticks: { callback: value => hasTime ? elapsedTick(value) : formatCalculated(value),
            ...(theme ? {color:theme.text,font:{family:theme.font,size:11},maxTicksLimit:7} : {}) },
          afterBuildTicks(scale) { elapsedTick = createElapsedAxis(scale.ticks.map(tick => tick.value)); },
          ...(theme ? {border:{color:theme.grid}} : {}),
          grid: { color: theme?.grid ?? '#edf1f2' } },
        ...scales,
      },
    },
  });
  ready = true;
  if (!legendToggle) chart.options.plugins.legend.onClick = () => {};
  return {
    render(points, now, { range = 'recent', events = [], origin = undefined, timeRange = null, connectGaps = false, nowUtc = Date.now(), bottomPadding = 0, pointsOnly = false, focusSampleId = null, referencePoints = points, scopeKey = undefined } = {}) {
      axisState.setScope(scopeKey);
      chart.options.layout.padding.bottom = bottomPadding;
      const relative = point => Number.isFinite(point.monotonicAt) ? (point.monotonicAt - now) / 1000 : (point.receivedAt - nowUtc) / 1000;
      const timedPoints = points.filter(p => Number.isFinite(p.receivedAt));
      hasTime = timedPoints.length > 0; currentPoints = hasTime ? timedPoints : points;
      origin = Number.isFinite(origin) ? origin : timedPoints[0]?.receivedAt ?? 0;
      const whole = range === 'all' || !hasTime;
      const lastTimed = timedPoints.at(-1);
      timeOrigin = whole ? origin : lastTimed ? lastTimed.receivedAt - relative(lastTimed) * 1000 : nowUtc;
      // Events retain short pauses and reconnects which the five-second gap
      // threshold alone cannot show. They never modify the source samples.
      const breakTimes = events.filter(event => ['discontinuity','recording-paused','recording-resumed','additional-measurement','interrupted'].includes(event.type)
        || (event.type==='reception-change'&&event.payload?.state==='stale')).map(event=>event.receivedAt).filter(Number.isFinite).sort((a,b)=>a-b);
      chart.options.scales.x.min = whole ? undefined : -60;
      chart.options.scales.x.max = whole ? undefined : 0;
      // Keep the original elapsed-time origin while filling the plot with the
      // requested interval; automatic rounded ticks can otherwise leave it small.
      if (whole && hasTime && Number.isFinite(timeRange?.startAt) && Number.isFinite(timeRange?.endAt) && timeRange.endAt > timeRange.startAt) {
        chart.options.scales.x.min = (timeRange.startAt - origin) / 1000;
        chart.options.scales.x.max = (timeRange.endAt - origin) / 1000;
      }
      const focused = points.find(p => p.sampleId === focusSampleId);
      pinnedCursor = focused ? hasTime ? (focused.receivedAt - origin) / 1000 : focused.sampleId : null;
      if (focused) {
        const coordinates = currentPoints.map(p => hasTime ? (p.receivedAt - origin) / 1000 : p.sampleId);
        const min = coordinates.reduce((a,b)=>Math.min(a,b),Infinity), max = coordinates.reduce((a,b)=>Math.max(a,b),-Infinity), half = Math.max(hasTime ? 1 : 5, (max - min) / 10);
        chart.options.scales.x.min = Math.max(min, pinnedCursor - half);
        chart.options.scales.x.max = Math.max(chart.options.scales.x.min + (hasTime ? .1 : 1), Math.min(max, pinnedCursor + half));
      }
      chart.options.scales.x.title.text = !hasTime ? '자료 번호 · 시각 정보 없음' : whole ? '경과 시간' : '지금으로부터';
      for (const [index, channel] of sourceChannels.entries()) {
        const data = [];
        let previous, breakIndex=0;
        for (const point of points) {
          if (hasTime && !Number.isFinite(point.receivedAt)) {
            if (previous) data.push({ x: whole ? (previous.receivedAt - origin) / 1000 : relative(previous), y: null });
            previous = null; continue;
          }
          const x = !hasTime ? point.sampleId : whole ? (point.receivedAt - origin) / 1000 : relative(point);
          const delta = previous ? point.receivedAt - previous.receivedAt : 0;
          if (delta<0) breakIndex=0;
          while (previous&&breakIndex<breakTimes.length&&breakTimes[breakIndex]<=previous.receivedAt) breakIndex++;
          const eventGap=previous&&breakTimes[breakIndex]<=point.receivedAt;
          if (hasTime && previous && (delta < 0 || (!connectGaps && (eventGap || delta >= (context?.connectionPolicy?.staleMs ?? context?.connection?.staleMs ?? 5000))))) data.push({ x, y: null });
          const cell = readCell(point, channel.id);
          data.push({ x, y: cell.reason ? null : displayValue(cell.value,channel), sampleId: point.sampleId,
            elapsedSeconds: hasTime ? (point.receivedAt - origin) / 1000 : null });
          previous = point;
        }
        chart.data.datasets[index].data = data;
        chart.data.datasets[index].showLine = !pointsOnly;
        chart.data.datasets[index].pointRadius = item => item.raw?.sampleId === focusSampleId ? 6 : pointsOnly ? 3 : 0;
      }
      // User actions share the time axis. Null points keep discontinuities visible.
      if (eventMarkers) chart.data.datasets[sourceChannels.length] = { type: 'scatter', label: '조작 기록', yAxisID: axisIds.get(sourceChannels[0]?.id),
        pointStyle: 'triangle', pointRadius: 6, backgroundColor: theme?.colors[0] ?? '#87632f',
        data: events.filter((e) => hasTime && Number.isFinite(e.receivedAt) && e.source === 'user').flatMap((e) => {
          const nearest = currentPoints.find((p) => p.receivedAt >= e.receivedAt && !readCell(p, sourceChannels[0]?.id).reason);
          if (!nearest) return [];
          const x = whole ? (e.receivedAt - origin) / 1000
            : relative(nearest) - (nearest.receivedAt - e.receivedAt) / 1000;
          return x < -60 && !whole ? [] : [{ x, y: displayValue(readCell(nearest, sourceChannels[0]?.id).value,sourceChannels[0]), elapsedSeconds: (e.receivedAt - origin) / 1000 }];
        }) };
      const {min:xMin,max:xMax} = chart.options.scales.x;
      const fittingPoints = currentPoints.filter(point => {
        const x = !hasTime ? point.sampleId : whole ? (point.receivedAt-origin)/1000 : relative(point);
        return (xMin === undefined || x >= xMin) && (xMax === undefined || x <= xMax);
      });
      for (const model of axisModels) {
        model.visible = sampleExtent(fittingPoints, model.channels, hasTime);
        axisState.update(model.key, sampleExtent(referencePoints, model.channels, hasTime), model.policy);
      }
      applyRanges(); chart.update('none');
    },
    resize() { chart.resize(); },
    timeGeometry() {
      if (!hasTime || !chart.chartArea || !chart.scales?.x) return null;
      const { left, top, right, bottom } = chart.chartArea;
      return { left, top, width: right - left, height: bottom - top, labelTop: chart.scales.x.bottom + 4,
        pixel: time => chart.scales.x.getPixelForValue((time - timeOrigin) / 1000),
        time: pixel => chart.scales.x.getValueForPixel(pixel) * 1000 + timeOrigin };
    },
    exportPng() { return chart.toBase64Image(); },
    dispose() { controls.dispose(); chart.destroy(); },
  };
}
