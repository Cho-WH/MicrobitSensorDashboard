// Small, semantic DOM controls beside the canvas axes; shared control paint and
// keyboard behavior come from the app's native button styles.
export function createChartAxisControls(canvas, groups, onToggle) {
  const document = canvas.ownerDocument, parent = canvas.parentElement;
  if (!document || !parent) return { layout() {}, dispose() {}, active: false };
  const buttons = groups.map(group => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'chart-axis-zoom'; button.dataset.uiAction = 'quiet';
    button.dataset.axisZoom = group.id;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M7.5 10.5h6"/><path data-zoom-plus d="M10.5 7.5v6"/></svg>';
    button.addEventListener('click', () => onToggle(group.id));
    parent.append(button); return button;
  });
  return {
    active: true,
    layout(chart, states) {
      groups.forEach((group, index) => {
        const button = buttons[index], axis = chart.scales[group.id], state = states[index];
        button.hidden = !axis || !state;
        if (button.hidden) return;
        const label = group.label + (state.expanded ? ' 기본 범위로 복원' : ' 세로축 확대');
        button.setAttribute('aria-label', label); button.title = label;
        button.dataset.expanded = String(state.expanded);
        button.querySelector('[data-zoom-plus]').toggleAttribute('hidden', state.expanded);
        button.disabled = !state.hasData && !state.expanded;
        button.style.left = Math.max(0, Math.min(chart.width - 32, (axis.left + axis.right) / 2 - 16)) + 'px';
        button.style.top = '0px';
        button.style.setProperty('--axis-color', chart.options.scales[group.id].title.color ?? '#53657d');
      });
    },
    dispose() { buttons.forEach(button => button.remove()); },
  };
}
