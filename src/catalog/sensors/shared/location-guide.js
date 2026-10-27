// Sensor modules supply the copy; the shared experiment dialog owns presentation.
export function createLocationGuide({ id, name, image, alt, location, tip, additionalTips = [], front = false }) {
  return {
    id: `${id}-location`, version: 1, label: '센서 위치', buttonLabel: '센서 위치 보기',
    title: `${name} 센서는 정확히 어디 있나요?`,
    pages: [{ label: '센서 위치', title: location,
      image: new URL(`../../../../public/assets/devices/posters/${image}.png`, import.meta.url).href,
      alt, caption: `micro:bit V2 · ${front ? '앞면' : '뒷면'}`,
      instructions: [['측정할 때 알아두세요', tip], ...additionalTips] }],
  };
}
