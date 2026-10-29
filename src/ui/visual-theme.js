// Display-only snapshot shared by DOM and Canvas. Read once per view
// configuration, never per sample; definitions and saved runs remain unchanged.
const quantitySlots = {temperature:0, pressure:1, 'relative-light':2};
export function readVisualTheme(root, channels = []) {
  const documentRoot = (root.ownerDocument ?? root).documentElement;
  if (documentRoot?.dataset.visualTheme !== 'luminous') return null;
  const host = root instanceof Element ? root : documentRoot;
  const style = getComputedStyle(host);
  const color = name => style.getPropertyValue(name).trim();
  const theme = {
    font:color('--sl-font'), text:color('--sl-chart-axis'), grid:color('--sl-chart-grid'),
    colors:[1,2,3,4].map(index => color(`--sl-channel-${index}`)),
    textColors:[1,2,3,4].map(index => color(`--sl-channel-text-${index}`)),
    channelColors:Object.create(null), channelTextColors:Object.create(null),
    analysis:{point:color('--sl-analysis-point'), excluded:color('--sl-analysis-excluded'),
      pointText:color('--sl-analysis-point-text'), focused:color('--sl-analysis-focused'), trend:color('--sl-analysis-trend')},
  };
  const used = new Set(), reserved = new Set(channels.map(channel => quantitySlots[channel.quantity]).filter(slot => slot !== undefined));
  for (const [index, channel] of channels.entries()) {
    const preferred = quantitySlots[channel.quantity] ?? index % theme.colors.length;
    // Repeated quantities (e.g. two probes) need separate identities. Preserve
    // the reserved colors of other quantities, such as BMP280 pressure.
    const available = used.has(preferred) ? theme.colors.findIndex((_, slot) => !used.has(slot) && !reserved.has(slot)) : preferred;
    const slot = available < 0 ? preferred : available;
    used.add(slot);
    theme.channelColors[channel.id] = theme.colors[slot];
    theme.channelTextColors[channel.id] = theme.textColors[slot];
  }
  return theme;
}

// Relationships keep the Y channel's identity; calculated columns use a neutral
// analysis color. Inclusion, exclusion and inspection also differ by shape/size.
export function analysisColors(theme, model) {
  return theme ? {...theme.analysis, point:theme.channelColors[model.yColumnId] ?? theme.analysis.point,
    pointText:theme.channelTextColors[model.yColumnId] ?? theme.analysis.pointText}
    : {point:'#197f88', excluded:'#aebbbb', focused:'#d67b40', trend:'#9a5d30'};
}

export function analysisSeriesColors(theme, model) {
  const left=analysisColors(theme,model);
  if(!model.right)return [left];
  const right=analysisColors(theme,model.right);
  if(right.point===left.point){
    const colors=theme?.colors??['#7c5cff','#197f88'],textColors=theme?.textColors??['#6240d8','#197f88'];
    const index=colors.findIndex(color=>color!==left.point);
    right.point=colors[index];right.pointText=textColors[index];
  }
  left.trend=left.point;right.trend=right.point;
  return [left,right];
}

export function channelColor(theme, channel, index = 0) {
  if (!theme) return channel.color ?? ['#d67b40','#197f88','#8d65b1','#43854d'][index % 4];
  return paletteColor(theme.colors,theme.channelColors,channel);
}

export function channelTextColor(theme, channel, index = 0) {
  return theme ? paletteColor(theme.textColors,theme.channelTextColors,channel) : channelColor(theme,channel,index);
}

function paletteColor(colors, mapped, channel) {
  if (mapped?.[channel.id]) return mapped[channel.id];
  const slot = quantitySlots[channel.quantity];
  if (slot !== undefined) return colors[slot];
  // Stable by identifier when a saved/imported definition has unfamiliar fields.
  const hash = Array.from(channel.id ?? '').reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  return colors[hash % colors.length];
}
