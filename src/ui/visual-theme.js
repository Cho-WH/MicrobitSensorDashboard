// V1: display-only values for the opt-in measurement screen. Read once per view
// configuration; never rewrite the sensor definition or a stored run.
export function readMeasurementTheme(root, channels = []) {
  const host = root.querySelector('.luminous-overview');
  if (!host) return null;
  const style = getComputedStyle(host);
  const color = name => style.getPropertyValue(name).trim();
  const theme = {
    font:color('--sl-font'), text:color('--sl-muted'), grid:color('--sl-grid'),
    colors:[color('--sl-orange-plot'),color('--sl-cobalt'),color('--sl-violet'),'#137d55'],
    channelColors:{},
  };
  for (const [index, channel] of channels.entries()) {
    const key = {temperature:0,pressure:1,'relative-light':2}[channel.quantity];
    theme.channelColors[channel.id] = theme.colors[key ?? index % theme.colors.length];
  }
  return theme;
}

export function channelColor(theme, channel, index = 0) {
  if (!theme) return channel.color ?? ['#d67b40','#197f88','#8d65b1','#43854d'][index % 4];
  if (theme.channelColors?.[channel.id]) return theme.channelColors[channel.id];
  if (channel.quantity === 'temperature') return theme.colors[0];
  if (channel.quantity === 'pressure') return theme.colors[1];
  if (channel.id === 'lightLevel') return theme.colors[2];
  // Stable by identifier when a saved/imported definition has unfamiliar fields.
  const hash = Array.from(channel.id ?? '').reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  return theme.colors[hash % theme.colors.length];
}
