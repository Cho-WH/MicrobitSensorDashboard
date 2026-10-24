import { getExperiment } from '../catalog/index.js';
import { registry } from '../catalog/modules.js';

// Derive all local resources from this installed app, including subdirectory hosting.
export const appBaseUrl = new URL('../../', import.meta.url);
export const entryRoutes = registry.entryRoutes;
export function parseRoute(input, base = appBaseUrl, modules = registry) {
  const url = new URL(input, base), root = new URL(base);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) throw new Error('실험실 안의 경로를 선택하세요.');
  if (url.searchParams.has('cfg')) throw new Error('수업 설정 링크는 아직 이 실험실에서 지원하지 않습니다. 홈에서 센서나 활동을 선택하세요.');
  const path = url.pathname.slice(root.pathname.length).replace(/index\.html$/, '');
  const entry = modules.entryRoutes.find(route => route.path === path || route.path.slice(0, -1) === path);
  if (!entry && !['', 'lab.html'].includes(path)) throw new Error('이 센서·활동 경로를 찾을 수 없습니다. 홈에서 다시 선택하세요.');
  const requestedView = url.searchParams.get('view');
  if (requestedView && !['home', 'preview', 'prepare', 'measure', 'analysis', 'saved'].includes(requestedView)) throw new Error('알 수 없는 실험 화면입니다.');
  if (requestedView === 'preview' && !entry) throw new Error('미리 볼 실험을 선택하세요.');
  return { context: entry ? getExperiment(entry.sensorId, entry.activityId, modules) : null,
    screen: requestedView ?? (entry ? 'prepare' : 'home') };
}
export function routeUrl(context, screen, { base = appBaseUrl, mock = false, visual = null, modules = registry } = {}) {
  const entry = context && modules.entryRoutes.find(route => route.sensorId === context.sensor.id && route.activityId === (context.activity?.id ?? null));
  const url = new URL(['home', 'saved'].includes(screen) || !entry ? 'lab.html' : entry.path, base);
  if (!['home', 'prepare'].includes(screen)) url.searchParams.set('view', screen);
  if (mock) url.searchParams.set('mock', '1');
  if (visual === 'luminous') url.searchParams.set('visual', visual);
  return url;
}
export function sameExperiment(left, right) {
  return left?.sensor?.id === right?.sensor?.id && left?.sensor?.version === right?.sensor?.version
    && (left?.activity?.id ?? null) === (right?.activity?.id ?? null)
    && (left?.activity?.version ?? null) === (right?.activity?.version ?? null);
}
