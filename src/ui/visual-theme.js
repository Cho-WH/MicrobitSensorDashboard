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
    channelColors:{},
    analysis:{point:color('--sl-analysis-point'), excluded:color('--sl-analysis-excluded'),
      focused:color('--sl-analysis-focused'), trend:color('--sl-analysis-trend')},
  };
  for (const [index, channel] of channels.entries()) {
    const key = quantitySlots[channel.quantity];
    theme.channelColors[channel.id] = theme.colors[key ?? index % theme.colors.length];
  }
  return theme;
}

// Relationships keep the Y channel's identity; calculated columns use a neutral
// analysis color. Inclusion, exclusion and inspection also differ by shape/size.
export function analysisColors(theme, model) {
  return theme ? {...theme.analysis, point:theme.channelColors[model.yColumnId] ?? theme.analysis.point}
    : {point:'#197f88', excluded:'#aebbbb', focused:'#d67b40', trend:'#9a5d30'};
}

export function channelColor(theme, channel, index = 0) {
  if (!theme) return channel.color ?? ['#d67b40','#197f88','#8d65b1','#43854d'][index % 4];
  if (theme.channelColors?.[channel.id]) return theme.channelColors[channel.id];
  const slot = quantitySlots[channel.quantity];
  if (slot !== undefined) return theme.colors[slot];
  // Stable by identifier when a saved/imported definition has unfamiliar fields.
  const hash = Array.from(channel.id ?? '').reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  return theme.colors[hash % theme.colors.length];
}
