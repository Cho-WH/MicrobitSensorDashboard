// Common preparation flow adapted from Cho-WH/bme280@59c5c149 G/guide/steps.js.
import { registry } from '../catalog/modules.js';

/** Fixed slots keep sensor/activity copy out of the common preparation flow.
 * @param {any} context @param {typeof registry} modules
 * @returns {import('./types.js').GuideStep[]}
 */
export function composeGuideSteps(context, modules = registry) {
  const sensor = modules.getSensor(context?.sensor), activity = modules.getActivity(context?.activity, context?.sensor);
  if (!sensor || (context?.activity && !activity)) return [];
  const guide = sensor.guide, calibration = guide.afterConnect?.find(step => step.kind === 'calibration');
  return structuredClone([
    { id: 'equipment', title: '장치와 도구를 준비해요', description: guide.equipmentDescription, scope: 'sensor',
      kind: 'manual', action: '준비했어요', required: true, quickConfirm: true, group: 'equipment', groupLabel: '준비물' },
    ...(guide.beforeProgram ?? []),
    { id: 'usb', title: '설치할 때 USB를 연결해요', description: '프로그램을 새로 넣을 때 micro:bit와 컴퓨터를 데이터 전송이 가능한 케이블로 연결하세요. 이미 올바른 프로그램이 있다면 이 단계는 건너뛸 수 있어요.',
      scope: 'sensor', kind: 'manual', action: 'USB를 연결했어요', required: false, group: 'program', groupLabel: '프로그램' },
    { id: 'program', title: '센서 프로그램을 넣어요', description: 'USB로 이 센서의 프로그램을 설치하세요. 이미 설치했다면 아래에서 확인하고 넘어가세요.',
      scope: 'firmware', kind: 'program', required: true, quickConfirm: true, group: 'program', groupLabel: '프로그램' },
    { id: 'connection', title: 'Bluetooth로 연결해요', description: '측정할 micro:bit를 선택하세요. USB 연결과 Bluetooth 연결은 별개입니다.',
      scope: 'attempt', kind: 'connection', required: true, group: 'connection', groupLabel: calibration ? '무선 연결' : '연결·수신' },
    ...(guide.afterConnect ?? []),
    { id: 'reception', title: '새 측정값을 확인해요', description: '선택한 센서의 유효한 측정값이 계속 들어오는지 확인합니다. 값이 같더라도 새 수신이면 정상입니다.',
      scope: 'attempt', kind: 'reception', required: true, group: calibration?.group ?? 'connection', groupLabel: calibration?.groupLabel ?? '연결·수신' },
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
    wiring: guide?.wiring ?? [], cableHelp: guide?.cableHelp ?? '', viewer: guide?.viewer ?? null,
    calibrationInstructions: guide?.calibrationInstructions ?? [], setupImage: activityGuide?.setupImage ?? null,
    experimentGuide: activityGuide?.experimentGuide ?? null });
}
