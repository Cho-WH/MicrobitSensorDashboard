// Common preparation flow adapted from Cho-WH/bme280@59c5c149 G/guide/steps.js.
import { registry } from '../catalog/modules.js';
import { getLabCopy } from '../catalog/ui-copy.js';

/** Fixed slots keep sensor/activity copy out of the common preparation flow.
 * @param {any} context @param {typeof registry} modules
 * @returns {import('./types.js').GuideStep[]}
 */
export function composeGuideSteps(context, modules = registry) {
  const sensor = modules.getSensor(context?.sensor), activity = modules.getActivity(context?.activity, context?.sensor);
  if (!sensor || (context?.activity && !activity)) return [];
  const guide = sensor.guide, calibration = guide.afterConnect?.find(step => step.kind === 'calibration');
  const copy = getLabCopy(context, modules).guideSteps;
  return structuredClone([
    { id: 'equipment', title: copy.equipmentTitle, description: guide.equipmentDescription, scope: 'sensor',
      kind: 'manual', action: copy.equipmentAction, required: true, quickConfirm: true, group: 'equipment', groupLabel: copy.equipmentGroup },
    ...(guide.beforeProgram ?? []),
    { id: 'program', title: copy.programTitle, description: copy.programDescription,
      scope: 'firmware', kind: 'program', required: true, quickConfirm: true, group: 'program', groupLabel: copy.programGroup },
    { id: 'connection', title: copy.connectionTitle, description: copy.connectionDescription,
      scope: 'attempt', kind: 'connection', required: true, group: 'connection', groupLabel: calibration ? copy.wirelessGroup : copy.connectionGroup },
    ...(guide.afterConnect ?? []),
    { id: 'reception', title: copy.receptionTitle, description: copy.receptionDescription,
      scope: 'attempt', kind: 'reception', required: true, group: calibration?.group ?? 'connection', groupLabel: calibration?.groupLabel ?? copy.connectionGroup },
    ...(activity?.guide.afterReception ?? []),
  ]);
}
export const getStep = (context, id) => composeGuideSteps(context).find(step => step.id === id) ?? null;

/** Only exact registered versions supply resources; imported metadata is never a resource registry.
 * @param {any} context @param {typeof registry} modules
 */
export function getGuideContent(context, modules = registry) {
  const sensor = modules.getSensor(context?.sensor), activity = modules.getActivity(context?.activity, context?.sensor);
  const guide = sensor?.guide, activityGuide = activity?.guide;
  return structuredClone({ equipment: guide?.equipment ?? [], activityEquipment: activityGuide?.equipment ?? [],
    wiring: guide?.wiring ?? [], cableHelp: guide?.cableHelp ?? '', viewer: guide?.viewer ?? null, illustrations: guide?.illustrations ?? null,
    calibrationInstructions: guide?.calibrationInstructions ?? [], setupImage: activityGuide?.setupImage ?? null,
    experimentGuide: activityGuide?.experimentGuide ?? guide?.experimentGuide ?? null });
}
