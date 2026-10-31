import { element } from './dom.js';

export function createSceneLoading() {
  const loading=element('div','scene-loading');
  loading.setAttribute('role','status');
  loading.innerHTML='<span class="scene-loading-shape" aria-hidden="true"></span><span class="scene-loading-line" aria-hidden="true"></span><span class="scene-loading-status"><span class="scene-loading-ring" aria-hidden="true"></span><span>3D 그림을 준비하고 있어요.</span></span>';
  loading.hidden=true;
  return loading;
}
