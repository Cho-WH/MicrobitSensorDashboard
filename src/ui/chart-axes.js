import { columnLabel } from '../analysis/calculations.js';

// Time-series axes share physical quantity AND storage unit. Unknown metadata
// stays independent: equal-looking units or channel names are not evidence.
export function groupChartAxes(channels) {
  const groups = [], byQuantityUnit = new Map();
  for (const channel of channels) {
    const known = typeof channel.quantity === 'string' && channel.quantity.trim()
      && typeof channel.unit === 'string';
    const key = known ? JSON.stringify([channel.quantity, channel.unit]) : null;
    let group = key === null ? null : byQuantityUnit.get(key);
    if (!group) {
      group = { id:'channel'+groups.length, channels:[], label:'' };
      groups.push(group);
      if (key !== null) byQuantityUnit.set(key,group);
    }
    group.channels.push(channel);
  }
  for (const group of groups) {
    const first = group.channels[0];
    const labels = [...new Set(group.channels.map(c=>c.quantityLabel).filter(label=>typeof label==='string'&&label.trim()))];
    group.label = group.channels.length === 1 ? columnLabel(first)
      : columnLabel({name:labels.length===1?labels[0]:'측정값',unit:first.unit});
  }
  return groups;
}
