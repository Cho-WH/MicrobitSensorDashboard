// Fit only the graph and virtual table. Controls and opened explanations keep
// their natural height, so short or enlarged views can still scroll normally.
export function createAnalysisLayout(root, {signal}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const pane = root.querySelector('#analysis-graph-pane'), stage = pane.querySelector('.graph-stage');
  const layout = root.querySelector('#analysis-layout'), workspace = root.querySelector('.analysis-workspace');
  const table = root.querySelector('#analysis-table-pane'), scroller = root.querySelector('#raw-scroll');
  const desktop = win.matchMedia('(min-width: 1001px)');
  let frame = null;
  const set = (name, height) => {
    const value = Math.floor(height) + 'px';
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  };
  function fit() {
    frame = null;
    if (!desktop.matches || root.dataset.task !== 'relationship' || !root.getClientRects().length) {
      root.style.removeProperty('--analysis-plot-height'); root.style.removeProperty('--analysis-table-height');
      return;
    }
    const inset = parseFloat(win.getComputedStyle(doc.body).paddingBottom) || 0;
    const after = root.getBoundingClientRect().bottom - workspace.getBoundingClientRect().bottom;
    const available = win.innerHeight - (layout.getBoundingClientRect().top + win.scrollY) - after - inset;
    const graphVisible = layout.dataset.tableOnly !== 'true';
    if (graphVisible) {
      const overhead = pane.getBoundingClientRect().height - stage.getBoundingClientRect().height;
      const min = parseFloat(win.getComputedStyle(stage).minHeight) || 240;
      set('--analysis-plot-height', Math.max(min, available - overhead));
    }
    if (layout.dataset.tableOpen === 'true') {
      // Measure the table's content independently of the neighboring graph.
      const children = [...table.children].filter(el => el.getClientRects().length);
      const bottom = Math.max(...children.map(el => el.getBoundingClientRect().bottom));
      const overhead = bottom - table.getBoundingClientRect().top - scroller.getBoundingClientRect().height;
      set('--analysis-table-height', Math.max(160, available - overhead));
    }
  }
  function schedule() {
    if (frame === null && !signal.aborted) frame = win.requestAnimationFrame(fit);
  }
  const observer = new ResizeObserver(schedule);
  // Changes in labels, font size, selection and details must update the budget.
  for (const el of [root, doc.body, workspace, pane, ...pane.children, ...table.children]) observer.observe(el);
  root.addEventListener('toggle', schedule, {capture:true, signal});
  win.addEventListener('resize', schedule, {signal});
  signal.addEventListener('abort', () => { observer.disconnect(); if (frame !== null) win.cancelAnimationFrame(frame); }, {once:true});
  return {schedule};
}
