import { createController } from './controller.js';
import { prepareAppPresentation } from '../ui/app-presentation.js';

// Startup owns only the document's initial availability. Controller.ready owns
// initial routing/rendering; it does not wait for device connection or recording.
export function completeStartup(root) {
  const stateHost = root.ownerDocument ? root : root.documentElement;
  stateHost.dataset.appState = 'ready';
  for (const region of root.querySelectorAll('[data-app-region]')) region.inert = false;
  const notice = root.querySelector('#app-startup');
  if (notice) notice.hidden = true;
}

export async function startApp(root = document, options = {}) {
  await prepareAppPresentation(root.ownerDocument ?? root);
  const app = createController(root, options);
  await app.ready;
  completeStartup(root);
  return app;
}
