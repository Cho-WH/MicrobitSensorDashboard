/** Activity rules stay outside generic recording and analysis. */
// Conditions and event kinds adapted from bme280@59c5c149 gay-lussac/measurement/conditions.js.
export const additionalConditions = [
  { id: 'container', label: '용기와 기체가 차지하는 부피' },
  { id: 'seal', label: '밀폐 상태와 뚜껑 개방 여부' },
  { id: 'sensor', label: '센서 위치·배선·측정 설정' },
];
export const activityPolicy = { additionalConditions, validateAdditional(confirmation) {
  const conditions = Object.fromEntries(additionalConditions.map(({id}) => {
    const value = confirmation.conditions?.[id];
    if (!['same', 'changed', 'unsure'].includes(value)) throw new Error('각 조건의 변경 여부를 선택하세요.');
    return [id, value];
  }));
  if (typeof confirmation.note !== 'string' || confirmation.note.length > 500) throw new Error('메모는 500자 이내로 적어 주세요.');
  const note = confirmation.note.trim();
  if (Object.values(conditions).some(value => value !== 'same') && !note) throw new Error('달라졌거나 확실하지 않은 조건을 메모해 주세요.');
  return { sameContext: confirmation.sameContext === true, conditions, note };
} };
