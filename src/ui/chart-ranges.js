import { readCell } from '../domain/columns.js';

// Bounds stay in storage units. Display-unit changes never reinterpret history.
export function sampleExtent(points, channels, timed = false) {
  let min = Infinity, max = -Infinity;
  for (const point of points) {
    if (timed && !Number.isFinite(point.receivedAt)) continue;
    for (const channel of channels) {
      const cell = readCell(point, channel.id);
      if (!cell.reason) { min = Math.min(min, cell.value); max = Math.max(max, cell.value); }
    }
  }
  return min <= max ? { min, max } : null;
}

export function axisRangeKey(channels) {
  const first = channels[0];
  return typeof first.quantity === 'string' && first.quantity.trim() && typeof first.unit === 'string'
    ? JSON.stringify([first.quantity, first.unit]) : JSON.stringify(['channel', first.id, first.unit]);
}

export function axisRangePolicy(channels, policies = {}) {
  const values = channels.map(channel => policies[channel.id] ?? {});
  const min = Math.min(...values.map(value => value.min ?? Infinity));
  const max = Math.max(...values.map(value => value.max ?? -Infinity));
  // A constant or quantized signal must still have a nonzero, readable span.
  const resolution = Math.max(...channels.map(channel => 10 ** -(channel.digits ?? 2)));
  return { min: Number.isFinite(min) ? min : undefined, max: Number.isFinite(max) ? max : undefined,
    minSpan: Math.max(resolution * 4, ...values.map(value => value.minSpan ?? 0)), detailSpan: resolution * 4 };
}

/** @param {{min:number,max:number}|null} extent @param {{min?:number,max?:number,minSpan?:number}} policy */
function enclosingRange(extent, { min, max, minSpan = .04 } = {}) {
  if (!extent && !Number.isFinite(min) && !Number.isFinite(max)) return null;
  const low = extent?.min ?? min ?? max, high = extent?.max ?? max ?? min;
  const span = Math.max(high - low, minSpan, Math.abs(low) * 1e-12, Math.abs(high) * 1e-12);
  const padding = Math.max(span * .05, (span - (high - low)) / 2);
  const bottom = min !== undefined && low >= min ? min : Math.min(min ?? Infinity, low - padding);
  const top = max !== undefined && high <= max ? max : Math.max(max ?? -Infinity, high + padding);
  const rough = (top - bottom) / 5, power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].find(factor => factor * power >= rough) * power;
  if (!Number.isFinite(step) || step <= 0) return { min: bottom, max: top };
  return { min: Number((Math.floor(bottom / step) * step).toPrecision(14)),
    max: Number((Math.ceil(top / step) * step).toPrecision(14)) };
}

// Owned by a view, optionally retained while that view recreates its chart.
export function createAxisRangeState() {
  const axes = new Map();
  let scope;
  return {
    reset() { axes.clear(); scope = undefined; },
    setScope(next) { if (next !== scope) { axes.clear(); scope = next; } },
    update(key, extent, policy) {
      const entry = axes.get(key) ?? { base: null, expanded: false };
      const next = enclosingRange(extent, policy);
      if (next) entry.base = entry.base
        ? { min: Math.min(entry.base.min, next.min), max: Math.max(entry.base.max, next.max) } : next;
      axes.set(key, entry);
    },
    toggle(key) { const entry = axes.get(key); if (entry) entry.expanded = !entry.expanded; },
    view(key, extent, minSpan) {
      const entry = axes.get(key);
      return { expanded: entry?.expanded ?? false,
        bounds: entry?.expanded && extent ? enclosingRange(extent, { minSpan }) : entry?.base ?? null };
    },
  };
}
