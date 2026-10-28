// Display-only placement shared by event and point annotations. Each grouped
// label points to its first timestamp; callers retain every record in details.
export function groupTimeMarkers(records, geometry, width = geometry.labelWidth ?? 116, gap = geometry.labelGap ?? 8) {
  const groups = [], labelWidth = Math.min(width, geometry.width);
  const visible = records.filter(record => Number.isFinite(record.receivedAt))
    .map(record => ({ record, x: geometry.pixel(record.receivedAt) }))
    .filter(item => item.x >= geometry.left && item.x <= geometry.left + geometry.width)
    .sort((a, b) => a.x - b.x);
  for (const item of visible) {
    const left = Math.max(geometry.left, Math.min(item.x - labelWidth / 2, geometry.left + geometry.width - labelWidth));
    const previous = groups.at(-1);
    if (previous && left < previous.left + labelWidth + gap) previous.items.push(item);
    else groups.push({ left, width: labelWidth, items: [item] });
  }
  return groups;
}
