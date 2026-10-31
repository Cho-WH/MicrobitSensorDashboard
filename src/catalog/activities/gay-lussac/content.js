import { assetUrl } from '../../../app/asset-url.js';
const kelvin = { id: 'calc-kelvin', name: '절대온도', unit: 'K', lhs: { kind: 'column', columnId: 'temperatureC' }, op: '+', rhs: { kind: 'constant', value: 273.15 } };
export const uiCopy = {
  home: {
    activityEyebrow: '게이뤼삭 실험', activityTitle: '공기를 데우면 압력은 어떻게 변할까?',
    activityDescription: '부피가 일정한 밀폐 용기 속 공기를 데우며, 온도와 압력의 관계를 찾아봐요.',
    curriculum: '고등학교 · 물질과 에너지', curriculumDetail: '2022 개정 · 이상 기체 방정식',
  },
  preview: {
    eyebrow: '게이뤼삭 실험',
    question: '밀폐한 공기를 데우면 압력은 어떻게 달라질까요?',
    description: '용기 안 공기를 천천히 데우며, 온도와 압력의 변화를 함께 살펴보세요.',
  },
  guide: {
    receptionNote: '센서 온도와 용기 안 압력의 새 값이 계속 들어오는지 확인하세요. 지금 보이는 값은 미리보기이며, 기록 시작을 누른 뒤부터 자료로 저장됩니다.',
    summaryDescription: '측정 화면에서 기록 시작을 누르고 처음 값을 관찰하세요. 따뜻한 물을 처음 넣을 때 가열 시작 기록을 누르세요.',
  },
};
export const analysisTemplates = [
  { id: 'kelvin', name: '절대온도', columns: [kelvin] },
  { id: 'ratio', name: '압력/절대온도', columns: [kelvin, { id: 'calc-ratio', name: '압력/절대온도', unit: 'hPa/K', lhs: { kind: 'column', columnId: 'pressureHpa' }, op: '/', rhs: { kind: 'column', columnId: 'calc-kelvin' } }] },
];
export const questions = [
  { id: 'observation', title: '관찰한 변화', question: '온도가 변할 때 압력은 어떻게 달라졌나요? 그래프와 측정값을 근거로 설명하세요.' },
  { id: 'reasoning', title: '관계 설명', question: '기체의 부피와 양이 일정하다는 조건에서, 관찰한 관계를 어떻게 설명할 수 있나요?' },
  { id: 'limitations', title: '조건과 한계', question: '온도가 충분히 고르게 되었는지, 공기가 새거나 용기의 부피가 달라지지는 않았는지 살펴보세요. 이런 조건은 결과에 어떤 영향을 줄까요?' },
];

// Adapted from G's equipment help, placement figure and four-page experiment guide.
const assets = assetUrl('../../../../public/activities/gay-lussac/', import.meta.url);
export const setupImage = { src: assetUrl('setup.svg', assets).href,
  alt: '밀폐 용기 안 바닥의 micro:bit와 배터리, 공기 중의 센서, 용기 밖 수조의 물과 고정대',
  caption: '센서는 용기 안 공기 중에, 물은 용기 바깥 수조에 둡니다.' };
export const equipment = [
  { id: 'battery', name: 'micro:bit용 배터리', help: '용기 안에 넣기 전 배터리를 연결하고 USB를 분리하세요. 그 뒤에도 새 값이 들어오는지 확인하세요.' },
  { id: 'container', name: '밀폐 용기', help: '장치와 배터리가 모두 들어가고 따뜻한 물에서 사용할 수 있는 용기를 준비하세요. 실험 중 부피가 변하거나 공기가 새지 않아야 합니다.' },
  { id: 'bath', name: '수조', help: '밀폐 용기 바깥에 물을 담아 천천히 데우세요. 물이 용기 안으로 들어가지 않게 하세요.' },
  { id: 'water', name: '상온의 물 · 따뜻한 물', help: '상온의 물로 시작하고 따뜻한 물을 바깥 수조에 조금씩 더하세요. 뜨거운 물과 용기를 맨손으로 만지지 마세요.' },
  { id: 'fixture', name: '용기 고정 도구', help: '물이 차면서 용기가 뜨거나 기울지 않게 바깥에서 고정하세요. 센서는 벽·물·다른 부품에 닿지 않게 두세요.' },
];
export const experimentGuide = {
  id: 'gay-lussac', version: 1, title: '밀폐한 공기를 천천히 데워 봐요',
  pages: [
    { label: '초기값 확인', title: '기록을 시작하고 처음 값을 관찰해요', image: 'experiment-preparation.png',
      alt: setupImage.alt, caption: setupImage.caption,
      instructions: [
        ['배치와 수신을 확인해요', '뚜껑을 닫고 용기가 뜨거나 기울지 않게 고정하세요. 센서는 용기 안 공기 중에 두고, 센서 온도와 용기 안 압력의 새 값이 계속 들어오는지 확인하세요.'],
        ['기록 시작을 눌러요', '준비 중 보이는 값은 미리보기입니다. 측정 화면에서 기록 시작을 누른 뒤, 용기 배치 확인을 누르세요.'],
        ['가열 전 기준을 살펴봐요', '상온의 물에서 데우기 전 온도와 압력이 안정되는지 관찰하세요. 가열 시작 기록은 따뜻한 물을 처음 넣을 때 누르세요.'],
      ] },
    { label: '가열 시작', title: '용기 밖의 물을 천천히 데워요', image: 'experiment-heating.png',
      alt: '밀폐 용기 옆 수조의 빈 공간에 따뜻한 물을 조금씩 붓는 모습', caption: '뚜껑을 닫은 채 · 물은 바깥 수조에',
      instructions: [
        ['데우기 시작한 시각을 남겨요', '바깥 수조에 따뜻한 물을 처음 넣을 때 가열 시작 기록을 누르세요. 이 버튼은 가열한 시각을 남깁니다. 자료는 기록 시작을 누른 뒤부터 저장됩니다.'],
        ['조금씩 더하며 관찰해요', '물은 용기에 직접 붓지 말고 수조의 빈 공간에 조금씩 넣으세요. 온도와 압력이 어떻게 변하는지 함께 살펴보세요.'],
      ], caution: '센서 온도가 45 ℃ 또는 용기 안 압력이 1100 hPa에 이르면 가열을 멈추세요. 뜨거운 물과 용기는 맨손으로 만지지 않고, 선생님이 정한 더 낮은 중단 기준이 있으면 그 기준을 따르세요.' },
    { label: '실험 조작 기록', title: '실험 중 한 일을 함께 남겨요', image: null,
      alt: '', caption: '측정값과 조작 시각을 나중에 함께 비교해요',
      flow: [['물 추가 기록','따뜻한 물을 더한 시각'],['조작 메모','용기·센서에 생긴 변화'],['조작·수신 기록','측정값과 함께 확인']],
      instructions: [
        ['물을 더할 때 기록해요', '처음 가열한 뒤 물을 더할 때마다 물 추가 기록을 눌러 시각을 남기세요.'],
        ['특이사항을 메모해요', '용기가 움직이거나 뚜껑을 건드렸다면 조작 메모에 상황을 적고 메모 기록을 누르세요.'],
        ['기록을 계속 확인해요', '조작·수신 기록에서 시각을 확인하세요. 기록 중에 안내나 분석 화면을 열어도 기록은 계속됩니다. 잠시 멈추려면 기록 일시정지, 다시 모으려면 기록 재개를 누르세요.'],
      ] },
    { label: '관계 분석', title: '자료를 골라 관계를 설명해요', image: 'experiment-analysis.png',
      alt: '시간 그래프에서 구간을 고르고 온도와 압력의 관계 그래프를 살펴보는 안내', caption: '원 자료 보기 → 관계 그래프 → 결과 해석',
      instructions: [
        ['기록을 마치고 자료를 살펴봐요', '기록 마치기를 누르고 자료 분석으로 이동하세요. 전체 자료로 관계 보기를 선택하거나, 구간 골라 분석하기에서 범위를 정한 뒤 이 구간으로 분석을 누르세요.'],
        ['두 물리량의 관계를 찾아요', '가로축은 센서 온도, 세로축은 용기 안 압력으로 두고 관계를 살펴보세요. 필요한 경우 추세선을 켜거나, 측정값 표에서 계산 열을 추가해 절대온도로 비교하세요.'],
        ['근거와 내 설명을 보관해요', '이 그래프로 해석하기를 눌러 근거를 보관하고 관찰한 관계를 설명하세요. 이어하기용 파일 저장으로 실험 전체를 보관하고, 탐구 기록 인쇄 · PDF로 설명을 출력할 수 있습니다.'],
      ] },
  ].map(page => ({ ...page, image: page.image ? assetUrl(page.image, assets).href : null })),
};
