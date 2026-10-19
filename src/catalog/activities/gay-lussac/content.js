const kelvin = { id: 'calc-kelvin', name: '절대온도', unit: 'K', lhs: { kind: 'column', columnId: 'temperatureC' }, op: '+', rhs: { kind: 'constant', value: 273.15 } };
export const analysisTemplates = [
  { id: 'kelvin', name: '절대온도', columns: [kelvin] },
  { id: 'ratio', name: '압력/절대온도', columns: [kelvin, { id: 'calc-ratio', name: '압력/절대온도', unit: 'hPa/K', lhs: { kind: 'column', columnId: 'pressureHpa' }, op: '/', rhs: { kind: 'column', columnId: 'calc-kelvin' } }] },
];
export const questions = [
  { id: 'observation', title: '관찰한 관계', question: '온도와 압력 사이에 어떤 관계가 나타났나요? 그래프와 수치를 근거로 설명하세요.' },
  { id: 'reasoning', title: '과학적 해석', question: '기체의 부피와 양이 일정하다는 조건을 바탕으로 관찰한 관계를 설명하세요.' },
  { id: 'limitations', title: '조건과 한계', question: '온도 평형, 용기 누설, 측정 범위가 결론에 어떤 영향을 줄 수 있나요?' },
];

// Adapted from G's equipment help, placement figure and four-page experiment guide.
const assets = new URL('../../../../public/activities/gay-lussac/', import.meta.url);
export const setupImage = { src: new URL('setup.svg', assets).href,
  alt: '밀폐 용기 안 바닥의 micro:bit와 배터리, 공기 중의 센서, 용기 밖 수조의 물과 고정대',
  caption: '센서는 용기 안 공기 중에 · 물은 용기 바깥 수조에' };
export const equipment = [
  { id: 'battery', name: 'micro:bit용 배터리', help: '용기 안에 넣기 전 배터리를 연결하고 USB를 분리해요. 그 뒤에도 새 값이 들어오는지 확인합니다.' },
  { id: 'container', name: '밀폐 용기', help: '장치와 배터리가 모두 들어가고 따뜻한 물에서 사용할 수 있는 용기를 준비해요. 실험 중 부피와 기체의 양이 일정하게 유지되어야 해요.' },
  { id: 'bath', name: '수조', help: '밀폐 용기 바깥에 물을 담아 천천히 데워요. 물은 용기 안으로 들어가지 않게 합니다.' },
  { id: 'water', name: '상온의 물 · 따뜻한 물', help: '상온의 물로 시작하고 따뜻한 물을 바깥 수조에 조금씩 더해요. 뜨거운 물과 용기를 맨손으로 만지지 않아요.' },
  { id: 'fixture', name: '용기 고정 도구', help: '물이 차면서 용기가 뜨거나 기울지 않게 바깥에서 고정해요. 센서는 벽·물·다른 부품에 닿지 않게 둡니다.' },
];
export const experimentGuide = {
  id: 'gay-lussac', version: 1, title: '밀폐한 공기를 천천히 데워 봐요',
  pages: [
    { label: '처음 값', title: '기록을 시작하고 처음 값을 관찰해요', image: 'experiment-preparation.png',
      alt: setupImage.alt, caption: setupImage.caption,
      instructions: [
        ['배치와 수신을 확인해요', '뚜껑을 닫고 용기를 고정해요. 센서는 용기 안 공기 중에 두고, 온도·기압의 새 값이 계속 들어오는지 확인하세요.'],
        ['기록 시작을 눌러요', '준비 중 보이는 값은 미리보기예요. 측정 화면에서 기록 시작을 누른 뒤, 장치 배치 완료를 기록하세요.'],
        ['가열 전 기준을 살펴봐요', '상온의 물에서 처음 온도와 기압을 관찰해요. 아직 가열 시작을 누르지 않아요.'],
      ] },
    { label: '데우기', title: '용기 밖의 물을 천천히 데워요', image: 'experiment-heating.png',
      alt: '밀폐 용기 옆 수조의 빈 공간에 따뜻한 물을 조금씩 붓는 모습', caption: '뚜껑을 닫은 채 · 물은 바깥 수조에',
      instructions: [
        ['데우기 시작한 시각을 남겨요', '처음 따뜻한 물을 더할 때 가열 시작을 눌러요. 기록 시작과 가열 시작은 다른 시점이에요.'],
        ['조금씩 더하며 관찰해요', '물은 용기에 직접 붓지 말고 수조의 빈 공간에 조금씩 넣으세요. 온도와 기압이 어떻게 변하는지 함께 살펴봐요.'],
      ], caution: '센서 온도가 45 ℃ 또는 기압이 1100 hPa에 이르면 가열을 멈춰요. 뜨거운 물과 용기는 맨손으로 만지지 않고, 선생님이 정한 더 낮은 중단 기준이 있으면 그 기준을 따르세요.' },
    { label: '변화 기록', title: '실험 중 한 일을 함께 남겨요', image: null,
      alt: '', caption: '측정값과 조작 시각을 나중에 함께 비교해요',
      flow: [['물 추가','따뜻한 물을 더한 시각'],['조작 메모','용기·센서에 생긴 변화'],['조작·수신 기록','측정값과 함께 확인']],
      instructions: [
        ['물을 더할 때 기록해요', '가열 중 물을 더할 때마다 물 추가를 눌러 시각을 남겨요.'],
        ['특이사항을 메모해요', '용기가 움직이거나 뚜껑을 건드렸다면 조작 메모에 상황을 적고 메모 기록을 누르세요.'],
        ['기록을 계속 확인해요', '조작·수신 기록에서 시각을 확인하세요. 안내나 분석 화면을 열어도 기록은 계속되며, 일시정지는 별도 버튼으로 합니다.'],
      ] },
    { label: '자료 살피기', title: '자료를 골라 관계를 설명해요', image: 'experiment-analysis.png',
      alt: '시간 그래프에서 구간을 고르고 온도와 기압의 관계 그래프를 살펴보는 안내', caption: '원 자료 보기 → 관계 그래프 → 결과 해석',
      instructions: [
        ['기록을 마치고 자료를 살펴봐요', '기록 마치기를 누르고 자료 분석으로 이동해요. 전체 자료를 쓰거나 분석할 구간을 선택할 수 있어요.'],
        ['두 물리량의 관계를 찾아요', '관계 그래프의 축을 고르고, 필요한 경우 계산 열이나 추세선을 사용해요.'],
        ['근거와 내 설명을 보관해요', '이 그래프로 결과 해석하기를 눌러 근거를 보관하세요. 실험 전체는 JSON, 원자료는 CSV로 따로 보관할 수 있어요.'],
      ] },
  ].map(page => ({ ...page, image: page.image ? new URL(page.image, assets).href : null })),
};
