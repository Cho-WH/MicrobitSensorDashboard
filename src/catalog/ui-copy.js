import { registry } from './modules.js';

// Plain display text only. Sensor data, preparation rules and saved answers live elsewhere.
const recordingPreviewNote = '지금 보이는 값은 미리보기입니다. 기록 시작을 누른 뒤부터 저장됩니다.';
export const labDefaults = {
  common: {
    appName: '센서 실험실', skip: '본문으로 이동', cancel: '취소', undo: '되돌리기', redo: '다시 실행',
    connection: '연결', recording: '기록', storage: '저장', events: '메모·기록 이력',
    connect: 'micro:bit 연결', reconnect: '이전 장치에 다시 연결', disconnect: '연결 해제',
    connectionHelp: '연결에 문제가 있나요?',
    cancelConnection: '연결 취소', mockConnect: '모의 장치 연결', chooseDevice: '다른 장치 선택',
    connecting: '연결 중', connected: '연결됨', disconnected: '연결 안 됨', mockConnected: '모의 연결',
    fresh: '새 값 수신 중', checkReception: '수신 확인 필요', lastReceived: '마지막 수신 {time}',
    imported: '가져온 자료', readOnly: '읽기 전용', prepare: '준비', beforeRecording: '기록 시작 전',
    recordingActive: '기록 중', paused: '일시정지', finishing: '기록 마감 중', ended: '기록 마침',
    stored: '저장된 자료', temporary: '임시 분석', clean: '저장됨', saving: '저장 중', pending: '저장 대기', error: '저장 오류',
  },
  navigation: { home: '실험 선택', prepare: '장비 준비', measure: '측정·기록', analysis: '자료 분석', saved: '저장된 실험', returnCurrent: '현재 실험으로 돌아가기' },
  files: { open: '실험 파일 열기', json: '실험 저장 · JSON', csv: '원자료 CSV', retry: '다시 저장', newExperiment: '새 실험 준비' },
  home: { title: '무엇을 탐구할까요?', description: '센서로 자유롭게 측정하거나, 실험 활동의 안내를 따라 시작하세요.',
    sensors: '센서로 측정하기', sensorsDescription: '측정하고 싶은 것을 골라보세요.', sensorTitle: '', sensorEquipment: '', sensorDescription: '',
    relatedActivities: '관련 활동', activities: '실험 활동 시작하기', activityTitle: '', activityEyebrow: '',
    activityDescription: '준비 안내와 활동 기록, 분석 질문을 함께 사용합니다.', activityAction: '활동 살펴보기',
    sensorLabel: '사용 센서', curriculumLabel: '교육과정 연결', curriculum: '', curriculumDetail: '' },
  preview: { eyebrow: '실험 소개', question: '', description: '', channelsHeading: '측정할 값', preparationHeading: '시작 전에 알아두세요', equipmentHeading: '준비할 것', start: '처음부터 준비하기', prepared: '이미 준비했어요', browse: '다른 실험 보기', transitionNote: '새 실험을 시작하면 현재 기록을 마치고 저장합니다.' },
  prepare: { title: '{name} · 장비 준비', measure: '측정 화면으로' },
  point: {
    activeCount: '{count}개', noCondition: '변인 없음 · 표에서 추가할 수 있어요.', conditionMissing: '미입력',
    continuousReady: '연속 기록은 계속됩니다. 변인값은 나중에 입력해도 돼요.',
    marker: '한 점 {number}', markerGroup: '한 점 {number} 외 {count}개', markerTitle: '한 점 기록 시점',
    showRecord: '{number}번 기록 표에서 보기', origin: '연결된 원자료 {number}번', markerClose: '닫기',
    mode: '측정 방식', continuous: '연속 측정', point: '한 점씩 측정', newExperiment: '새 실험',
    continuousSetting: '연속 기록', continuousActive: '연속 기록 중', recordingActive: '한 점 기록 중', previewChart: '미리보기 · 저장 안 함',
    current: '현재 수신값', components: '다른 측정 항목', lastValue: '마지막 수신값 · 연결과 새 수신을 확인하세요.', unitToggle: 'm/s² | g',
    missing: '유효한 값 없음', range: '눈금 범위 설정', rangeNote: '표시 범위만 바뀝니다. 센서의 측정 한계가 아닙니다.',
    minimum: '최솟값', maximum: '최댓값', rangeInvalid: '유한한 최솟값과 더 큰 최댓값을 입력하세요.',
    noRange: '눈금 범위를 설정하면 막대로도 볼 수 있어요.', outside: '눈금 범위 밖',
    capture: '한 점 기록', condition: '이번 변인값', addCondition: '변인 추가', editCondition: '변인 설정',
    conditionName: '변인 이름', conditionUnit: '단위',
    columnNote: '이름과 단위는 기존 기록에도 적용되며 숫자는 자동 환산하지 않습니다.',
    numberInvalid: '빈칸 또는 유한한 숫자를 입력하세요.',
    records: '한 점 기록표', empty: '원하는 위치에 센서를 놓고 한 점 기록을 눌러 보세요.',
    number: '번호', received: '수신 시각', captured: '버튼을 누른 시각', options: '옵션', note: '점 메모',
    editValue: '{number}번 변인값', editNote: '{number}번 메모', enterValue: '입력하기',
    withdraw: '기록 취소', restore: '기록 복원', withdrawn: '취소됨', count: '한 점 기록 {count}개 · 취소 {withdrawn}개',
    recorded: '{number}번 기록', updated: '{number}번 수정 완료', newRecords: '새 기록 {count}개 보기',
    preview: '현재값은 미리보기입니다. 한 점 기록을 누른 값만 저장됩니다.',
    'capture-reception': '장치를 연결하고 새 값이 정상적으로 들어오는지 확인하세요.',
    'capture-duplicate': '이미 기록한 수신값입니다. 새 값이 들어오면 다시 기록할 수 있어요.',
    'capture-pending': '기록을 처리하고 있어요.', 'capture-condition': '이번 변인값을 확인하세요.',
    'capture-paused': '기록을 재개하고 새 값이 들어오면 한 점을 추가할 수 있어요.',
    'capture-ended': '추가 측정을 확인하면 다시 기록할 수 있어요.', 'capture-finishing': '기록을 마치고 있어요.',
    'capture-preview': '기록을 시작해 주세요.', 'capture-read-only': '이 자료는 읽기 전용입니다. 새 실험을 준비하세요.',
    'capture-storage': '저장 오류를 해결하고 다시 저장한 뒤 기록을 재개하세요.',
  },
  measurement: {
    current: '현재 실험', name: '실험 이름', namePlaceholder: '나의 센서 실험', prepare: '장비 준비 확인',
    review: '준비 내용 다시 보기', channels: '그래프에 표시할 항목', channelsNote: '표시를 꺼도 모든 측정 항목은 기록돼요.', mock: '기기 없이 둘러보기',
    start: '기록 시작', reconnect: '장치 다시 연결', pause: '기록 일시정지', resume: '기록 재개', finish: '기록 마치기', additional: '추가 측정', guide: '실험 방법 보기', guideCompact: '실험 방법',
    mockNotice: '모의 측정값입니다.',
    previewNote: recordingPreviewNote, count: '원자료 {count}개', stored: '보관한 자료', storedValues: '보관한 측정값', waiting: '수신 대기',
    chartTitle: '시간에 따른 변화', range: '표시 구간', recent: '최근 60초', all: '전체', allRecords: '전체 기록', allPreview: '전체 미리보기', chartSummary: '{range} · {count}개 표시',
  },
  saved: { title: '저장된 실험 이어하기', description: '이 브라우저에 저장된 기록입니다. 전체 실험 JSON을 따로 보관하면 다른 기기에서도 이어서 분석할 수 있습니다.', empty: '저장된 실험이 없습니다.', open: '실험 열기' },
  analysis: {
    title: '자료 분석', finish: '기록 마치기', overview: '원 자료 보기', relationship: '관계 그래프', interpretation: '결과 해석',
    table: '표', split: '표 & 그래프', graph: '그래프', editRange: '구간 수정', timeTitle: '시간에 따른 변화', orderTitle: '자료 순서에 따른 변화', axes: '측정 항목별 축', empty: '아직 불러온 자료가 없어요.',
    readout: '그래프 위에서 같은 시점의 측정값을 확인할 수 있어요.', cursorHint: '그래프 위에서 측정값을 확인할 수 있어요.', untimed: '시각 정보가 없어 자료 번호 순서로 표시합니다.', untimedCount: '시각 정보 없는 {count}개는 시간 그래프에 표시하지 않습니다. 표에서 원자료를 확인할 수 있어요.',
    useAll: '전체 자료로 관계 보기', chooseRange: '구간 골라 분석하기', start: '시작', end: '끝', seconds: '초', rangeHint: '선택 중 · 아직 분석에 적용하지 않음', allRange: '전체 구간', applyRange: '이 구간으로 분석',
    showTable: '측정값 표 보기', tableTitle: '측정값 표', addColumn: '+ 계산 열 추가', column: '+ 계산 열', analyzeSelection: '선택 자료로 분석', exclude: '분석에서 제외', restore: '다시 포함', clearSelection: '선택 해제',
    pointHint: '점이나 행을 선택하면 여기에서 자료를 살펴볼 수 있어요.', restorePoint: '분석에 다시 포함', graphTitle: '두 물리량의 관계', x: '가로축', y: '세로축', included: '● 분석 포함', excluded: '○ 제외',
    tools: '분석 도구', trend: '추세선', extend: '추세선 연장', calculate: '계산 열 추가', display: '표시 설정', graphType: '그래프 종류', scatter: '산점도', line: '꺾은선 그래프', gaps: '시간 공백 연결',
    graphPointHint: '그래프의 점을 선택하면 여기에서 자료를 살펴볼 수 있어요.', trendEmpty: '추세선을 켜면 두 물리량의 관계를 수치로 살펴볼 수 있어요.', details: '상세 보기',
    slopeHelp: '기울기는 가로축 값이 1단위 늘어날 때 세로축 값이 얼마나 달라지는지 나타냅니다. y절편은 가로축 값이 0일 때 이 직선이 가리키는 값입니다.',
    interceptHelp: 'x절편은 직선의 세로축 값이 0이 되는 지점입니다. 측정 범위 밖으로 연장했다면 실제 측정값과 구분해서 해석하세요.',
    fitHelp: 'R²는 선형 모형이 자료의 변화를 얼마나 설명하는지 나타냅니다. 높은 값만으로 비례 관계나 측정의 정확성이 입증되지는 않습니다.',
    explain: '발견한 관계를 내 말로 정리해 볼까요?', useGraph: '이 그래프로 해석하기', png: '그래프 이미지 저장', csv: '분석 자료 CSV 저장', exclusionReason: '제외 사유 (선택)', reasonPlaceholder: '비워 두어도 괜찮아요', applyExclusion: '제외하기',
    noRun: '저장된 실험을 열거나 먼저 측정해 주세요.', newData: '새 자료 {count}개 반영',
    includedCount: '분석 {count}개', excludedCount: '제외 {count}개', selectedCount: '{count}개 선택', allData: '전체', selectedData: '선택한 자료', hiddenFilters: '표 필터 {count}개 적용 중 · 상단의 ‘표’ 보기에서 확인',
  },
  reflection: {
    title: '발견한 관계를 설명해요', staleTitle: '관계 그래프의 분석이 바뀌었어요.', staleNote: '아래에는 설명을 작성할 때 가져온 그래프가 남아 있어요.', refresh: '현재 그래프로 바꾸기',
    evidence: '내 설명의 근거', graph: '가져온 그래프', statistics: '추세선 수치 살펴보기', noTrend: '추세선을 사용하지 않은 그래프예요. 점의 분포와 측정값도 설명의 근거가 될 수 있어요.',
    empty: '설명에 사용할 그래프를 먼저 살펴볼까요?', emptyBack: '관계 그래프로 가기', changeEvidence: '근거를 바꾸고 싶다면', back: '관계 그래프로 돌아가기', writing: '나의 해석', progress: '편한 질문부터, 나의 말로',
    exclusions: '제외한 자료도 설명의 근거가 될 수 있어요', exclusionHint: '자료를 제외한 이유가 설명과 어떻게 연결되는지 살펴보세요.', calculations: '다른 물리량으로 바꿔 살펴본 이유는 무엇인가요?', extensionHint: '측정한 구간과 직선을 연장한 구간의 해석에는 어떤 차이가 있나요?',
    zeroTitle: 'x절편의 의미 살펴보기', zeroHint: 'x절편은 추세선에서 Y값이 0이 되는 X값이에요. 측정 범위를 벗어난 추정은 실제 측정값과 구분해야 해요.', json: '이어하기용 파일 저장', print: '탐구 기록 인쇄 · PDF',
    placeholder: '자료에서 발견한 내용을 적어 보세요.', observationPlaceholder: '내가 관찰한 관계를 한두 문장으로 적어 보세요.', reasoningPlaceholder: '관찰한 점의 분포, 구체적인 값, 추세선의 수치 등을 근거로 설명해 보세요.', limitationsPlaceholder: '측정 구간, 실험 조건, 측정하지 않은 부분 등을 떠올려 보세요.', answerHint: '짧은 문장으로 시작해도 괜찮아요.', completed: '{total}개 질문 중 {count}개에 내 생각을 남겼어요',
    noRun: '실험을 먼저 열어 주세요.', temporary: '메모리에만 보관 중 · 창을 닫기 전에 전체 실험 JSON 파일로 저장하세요', readOnly: '읽기 전용 · 저장한 기록을 보고 있어요', error: '저장 오류 · 상단 저장 상태를 확인해 주세요', clean: '이 브라우저에 저장됨', saving: '작성 내용을 저장하고 있어요', refreshed: '근거 그래프를 바꿨어요. 작성한 설명도 함께 확인해 보세요.', checkAnswers: '가져온 그래프와 작성한 설명이 잘 연결되는지 확인해 보세요.',
  },
  calculation: { title: '계산 열 추가', edit: '계산 열 편집', name: '열 이름', unit: '단위 (선택)', column: '자료 열', number: '숫자', operation: '연산', power: '거듭제곱 (Aᴮ)', sampleId: '번호', inputA: '입력 A', inputB: '입력 B', result: '결과', empty: '미리 볼 분석 자료가 없습니다.', add: '열 추가', create: '열 만들기', apply: '변경 적용', custom: '직접 만들기', editFormula: '계산식 편집', remove: '열 삭제', reason: '계산 불가 이유' },
  dialogs: {
    exitTitle: '현재 도구 사용을 마칠까요?', exitNote: '측정 기록을 저장하고 장치 연결을 종료한 뒤 이동합니다.', exitTemporaryNote: '현재 자료를 파일로 보관하고 장치 연결을 종료한 뒤 이동합니다.', cancelExit: '취소', exit: '종료하고 이동',
    leaveTitle: '현재 실험을 보관할까요?', leaveNote: '현재 기록과 분석을 저장한 뒤 계속합니다.', stay: '현재 실험에 머물기', saveLeave: '저장하고 이동', exportLeave: '파일로 보관하고 이동', finishLeave: '기록을 마치고 이동',
    csvTitle: 'CSV 열 확인', csvNote: '가져올 열과 단위를 선택하세요. 시각이 없는 자료도 가져올 수 있어요.', import: '이 설정으로 가져오기', additionalTitle: '추가 측정 조건 확인', additionalNote: '이전 기록과 같은 센서·프로그램·활동을 사용하고 있나요?', activityConditions: '용기·기체의 양·센서 위치가 유지되었는지도 확인하세요.', additional: '조건 확인 후 추가 측정',
  },
  guideSteps: {
    equipmentTitle: '장치와 도구를 준비해요', equipmentAction: '준비했어요', equipmentGroup: '준비물',
    programTitle: '센서 프로그램을 넣어요', programDescription: '사용 중인 기기와 micro:bit를 USB 데이터 케이블로 연결한 뒤, 설치 버튼을 누르세요. 이미 올바른 프로그램이 있다면 아래에서 확인하고 넘어가세요.', programGroup: '프로그램',
    connectionTitle: 'Bluetooth로 연결해요', connectionDescription: 'micro:bit를 연결하고 새 측정값이 들어오는지 확인하세요.', connectionGroup: '연결·수신', wirelessGroup: '무선 연결',
    receptionTitle: '새 측정값을 확인해요', receptionDescription: '선택한 센서의 유효한 측정값이 계속 들어오는지 확인합니다. 값이 같더라도 새 수신이면 정상입니다.',
  },
  guide: {
    quick: '이미 준비했어요', restart: '처음부터 준비하기', large: '크게 보기 ↗', wireRole: '역할', wiringNote: '보드의 단자 이름을 비교하세요. 전원을 분리한 상태에서 배선합니다.', incoming: '지금 들어오는 값', lastCheck: '기록 전 마지막 확인', summaryTitle: '준비 상태를 한눈에 확인해요', quickNote: '실제로 준비한 항목만 확인해 주세요. 연결·수신·보정은 이어서 검사합니다.', program: '프로그램 설치',
    previous: '← 이전', confirm: '확인했어요', next: '다음 단계 →', measure: '측정 화면으로 →', quickConfirm: '확인하고 연결하기 →', install: 'USB로 프로그램 설치', programConfirm: '이미 올바른 프로그램이 있어요', battery: 'USB를 분리했어요 · 수신 검사',
    model: '3D 보기', table: '배선표 보기', retryModel: '3D 다시 열기', cableLeft: '수–암', cableRight: '암–암', detail: '단자 자세히', whole: '전체 보기', restore: '↺ 시점 복귀', modelUnavailable: '3D를 열지 못했어요. 배선표로 계속 준비할 수 있어요.', modelLoading: '3D 안내를 불러오는 중…',
    deviceEquipment: '측정 장치', activityEquipment: '실험 도구', currentStep: '현재 단계', installed: '이 센서에 맞는 프로그램이 설치되어 있어요',
    quickTitle: '준비 상태 확인', readyTitle: '이제 측정을 시작해 볼까요?', receptionTitle: '연결과 수신을 확인해요', quickDescription: '현재 장치의 준비 상태를 확인하고 연결하세요.', summaryDescription: recordingPreviewNote, quickCounter: '준비된 장치', summaryCounter: '준비 결과',
    ready: '준비 완료', canMeasure: '수신 확인 · 측정 가능', progress: '준비 확인 {count} / {total}', mockPrefix: '모의 장치 · ',
    userConfirmed: '직접 확인했어요', deviceObserved: '장치에서 확인했어요', deviceReported: '장치가 보정 완료를 알렸어요', simulated: '모의 수신으로 확인했어요',
    programLabel: '설치', connectionLabel: '연결', receptionLabel: '수신 확인', calibrationLabel: '보정 확인',
    usbEyebrow: '프로그램을 넣을 때', computer: '컴퓨터', usbHeading: 'USB 데이터 케이블로 연결해요', usbNote: '충전 전용 케이블로는 설치할 수 없어요. 설치가 끝날 때까지 케이블을 꽂아 두세요.', usbWireless: '측정값은 다음 단계에서 Bluetooth로 받습니다.',
    powerHeading: '배터리로 전원을 공급하려면', powerNote: 'USB 대신 배터리로 전원을 공급할 수 있어요. 1.5 V AAA 전지 두 개(총 3 V)를 케이스의 +·− 표시에 맞춰 넣고, 흰색 플러그를 보드의 배터리 단자에 연결하세요. 처음 프로그램을 넣을 때는 USB 데이터 케이블이 필요해요.',
    noReading: '아직 받은 값이 없어요.', wireless: '무선 연결', continuous: '새 값 연속 수신', calibration: '보정 직접 확인', batteryCheck: 'USB 분리 후 수신', review: '다시 보기', check: '확인하기',
    receptionNote: '값이 일정해도 새로 수신한 값이면 정상이에요.', receptionWaiting: '연속 수신 확인 중',
    disconnectedNote: '장치에 전원을 공급하고 Bluetooth로 연결하세요.', receivingNote: '새 값이 계속 들어오고 있어요. 측정 화면에서 기록을 시작할 수 있어요.',
    waitingNote: '연결은 되었어요. 새 값이 연속으로 들어오는지 확인하고 있어요.', lastReadingNote: '아래 숫자는 마지막에 받은 값이에요. 새 값이 계속 들어오면 측정할 수 있어요.', staleNote: '아래 숫자는 마지막에 받은 값이에요. 전원과 연결 상태를 확인하세요.',
    connectingNote: '장치 선택 창이 열리면 사용할 micro:bit를 선택하세요. 연결을 취소한 뒤 다시 시도할 수도 있어요.',
    calibrationSkipped: '보정 생략', calibrationSkippedNote: '이번 보정을 생략했어요. 보정 완료로 기록하지 않아요.',
    calibrationDone: '나침반 보정 완료', calibrationPending: '나침반 보정 대기',
    programTarget: '설치할 프로그램', programReady: 'USB 연결을 확인하고 설치하세요.', programInstalled: '설치가 끝났어요. 다음 단계에서 Bluetooth 연결과 새 수신을 확인하세요.',
    nextSummary: '준비 결과 보기 →', nextConfirmed: '확인했어요 · 다음 →', installing: '프로그램 설치 중…', retryInstall: 'USB 설치 다시 시도', reinstall: '프로그램 다시 설치',
    wirelessMode: '무선으로 설치하기', usbMode: 'USB로 설치하기', wirelessInstall: '무선으로 프로그램 설치', wirelessRetry: '무선 설치 다시 시도', retryConnection: '다시 시도',
    wirelessModeHint: '센서 실험실의 다른 프로그램이 설치돼 있나요? USB 없이 프로그램을 바꿀 수 있어요.', usbModeHint: '무선 설치가 잘되지 않으면 USB 케이블로 연결해 설치해 보세요.',
    wirelessDescription: 'USB 없이 센서 프로그램을 바꿔요.',
    wirelessHeading: '보드의 전원을 켜 주세요', wirelessNote: '배터리나 USB로 전원을 공급하고, 설치가 끝날 때까지 보드를 가까이 두세요.', wirelessFirstInstall: '처음 준비하는 보드는 USB 설치가 필요해요.',
    installReady: '설치할 준비가 됐어요', installLoading: '설치 파일을 준비하고 있어요', installSelecting: '사용할 보드를 선택해 주세요',
    installWorking: '프로그램을 설치하고 있어요', installFinishing: '설치를 마무리하고 있어요', installSuccess: '설치가 끝났어요',
    installRecovery: '보드에 다시 연결하지 못했어요', installUsbRequired: 'USB로 설치해야 해요', installError: '설치를 진행하지 못했어요',
    installCancelled: '설치를 취소했어요', installUnavailable: '다른 설치 방법을 이용해 주세요',
    installResetAction: 'micro:bit 뒤쪽의 리셋 버튼을 짧게 한 번 누른 뒤, 아래의 다시 시도를 눌러 주세요.',
    resetEyebrow: 'micro:bit 뒷면', resetHeading: '표시된 리셋 버튼을 한 번 눌러요', resetNote: '길게 누르지 말고, 짧게 눌렀다가 떼세요.',
    resetImageAlt: 'micro:bit V2 뒷면의 USB 포트와 배터리 잭 주변 확대 그림. 두 단자 사이의 리셋 버튼을 화살표로 표시',
    installKeepPower: '전원을 켜 둔 채 계속해 주세요', installKeepPowerNote: '다음 단계에서 새 측정값을 확인해요.',
    unsupported: '이 브라우저에서는 Bluetooth 연결을 사용할 수 없어요. 지원하는 브라우저에서 연결하거나 실험 파일을 열어 분석할 수 있어요.', reconnectNote: '다시 연결하려면 기록을 먼저 일시정지하세요.', mockProgramNote: '모의 실험에서는 설치 없이 다음 단계로 넘어가세요.', batterySeen: 'USB 분리 후 수신을 확인했어요.', batteryWaiting: 'USB 분리 후 수신을 확인하고 있어요.', calibrationNote: '숫자가 들어오는 것만으로 보정 완료를 판단하지 않아요.',
  },
  accessibility: {
    experimentStatus: '실험 상태', screens: '실험 화면', liveChart: '실시간 측정값', analysisTasks: '분석 작업', graphLayout: '관계 그래프 보기 방식', timeChart: '측정 항목의 시간 변화', orderChart: '자료 번호에 따른 측정값', rangeStart: '분석 구간 시작', rangeEnd: '분석 구간 끝', elapsedStart: '시작 경과 시간', elapsedEnd: '끝 경과 시간',
    rawScroll: '측정 원자료 연속 스크롤', selectAll: '표시된 자료 전체 선택', point: '선택한 자료 정보', clearPoint: '자료 선택 해제', graphX: '그래프 가로축', graphY: '그래프 세로축', chart: '분석 그래프', graphTools: '그래프 도구', graphType: '그래프 표시 방식', evidence: '보관한 근거 그래프', closeToast: '알림 닫기', exclude: '선택한 자료 분석에서 제외', columnFilter: '열 필터', calculation: '계산 열',
    inputAKind: 'A 입력 종류', inputAColumn: 'A 자료 열', inputANumber: 'A 숫자', inputBKind: 'B 입력 종류', inputBColumn: 'B 자료 열', inputBNumber: 'B 숫자', calculationOperation: '계산 연산', calculationPreview: '계산 결과 미리보기',
    guideSteps: '장비 준비 단계', guideVisual: '현재 단계의 준비 안내', wiringModes: '배선 보기 방식', wiringControls: '케이블 종류와 관찰 시점', guideDescription: '단계 설명과 확인', guideSubsteps: '현재 단계의 세부 순서', installProgress: '프로그램 설치 진행률',
  },
};
for (const section of Object.values(labDefaults)) Object.freeze(section);
Object.freeze(labDefaults);

// Shared screen copy. Local modules specify only the fields they need to change.
export const previewDefaults = labDefaults.preview;

/** @typedef {{[Section in keyof typeof labDefaults]?: Partial<Record<keyof typeof labDefaults[Section], string>>}} LabCopy */

/** @param {any} context @param {typeof registry} modules */
export function getLabCopy(context, modules = registry) {
  const sensor = modules.getSensor(context?.sensor);
  const activity = modules.getActivity(context?.activity, context?.sensor);
  const copy = structuredClone(labDefaults);
  for (const overrides of [sensor?.uiCopy, activity?.uiCopy]) {
    for (const section of Object.keys(labDefaults)) {
      for (const key of Object.keys(labDefaults[section])) {
        const value = overrides?.[section]?.[key];
        if (typeof value === 'string') copy[section][key] = value;
      }
    }
  }
  return copy;
}

/** @param {any} context @param {typeof registry} modules */
export function getPreviewCopy(context, modules = registry) {
  return getLabCopy(context, modules).preview;
}
