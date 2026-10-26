import { entryRoutes } from '../app/routes.js';
import { publicBaseUrl } from '../app/deployment.js';

/** @param {string} value */
export function normalizePublicBase(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('공개 실험실 주소를 확인해 주세요.');
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url.href;
}

/** Only the preview's registered identity is used; local state never enters a link.
 * @param {import('../domain/contracts.js').ExperimentContext} context
 * @param {string} [base]
 */
export function createToolLink(context, base = publicBaseUrl) {
  const entry = entryRoutes.find(item => item.sensorId === context?.sensor?.id
    && item.activityId === (context?.activity?.id ?? null));
  if (!entry) throw new Error('공유할 실험 소개를 찾을 수 없어요.');
  const url = new URL(entry.path, normalizePublicBase(base));
  url.searchParams.set('view', 'preview');
  return url.href;
}
