import { createViewportLayout } from './viewport-layout.js';

// All three analysis tasks share the budget; charts and the virtual table keep
// their existing ResizeObservers to follow the space CSS assigns to them.
export function createAnalysisLayout(root, {signal}) {
  return createViewportLayout(root, {signal, regions:[
    root.querySelector('#overview-pane'), root.querySelector('#analysis-layout'),
    root.querySelector('.reflection-layout'),
  ]});
}
