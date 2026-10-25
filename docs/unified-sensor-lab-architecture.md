# 통합 센서 실험 앱 기술 설계

> 상태: 통합 목표 설계 · 2026-10-19 · v1 · [M2 구현·검증 현황](m2-implementation.md)
> 대상: `Cho-WH/MicrobitSensorDashboard` 안의 단일 센서 실험 앱
> 기능·UX 기준: [통합 앱 기획](unified-sensor-lab-plan.md)
> 최초 검증 경로: BMP280 자유 측정 / 게이뤼삭 활동 / 내장 자기장 자유 측정

## 1. 설계 결정과 범위

**게이뤼삭 앱의 준비·측정·저장·분석 구조를 이 저장소로 이식하고, 센서 정의와 활동 정의를 분리한다.** 대시보드에서는 수업 설정 링크·QR과 센서 항목 표시 방식을 가져온다. 센서·활동마다 앱을 복제하지 않는다.

| 항목 | 결정 | 이유 |
|---|---|---|
| 언어·UI | JavaScript ES Modules + JSDoc, 기존 DOM·CSS 컴포넌트 | 기존 코드와 UX를 보존하며 채널 일반화에 집중한다. React/Vue 전환과 전체 TypeScript 재작성은 하지 않는다. |
| 구성 방식 | 하나의 앱 제어기에서 모듈을 생성·연결 | 전역 이벤트 버스·DI 프레임워크·서비스 로케이터 없이 의존성을 드러낸다. |
| 분석·저장 | 게이뤼삭의 Workspace / RunStore / Repository 분리 유지 | 화면 상태, 작업 정의, 원자료, DB 쓰기의 소유권을 혼합하지 않는다. |
| 센서·활동 확장 | 빌드에 포함되는 명시적 레지스트리 | 서버 플러그인·사용자 코드 실행·원격 모듈 설치 없이 필요한 확장만 허용한다. |
| 장치 | 초기 실물 기준은 micro:bit V2, USB 설치 + BLE UART 측정 | 원본 프로그램 전송 어댑터의 V2 확인을 유지한다. V1은 센서·HEX별 검증 후 명시적으로 추가한다. |
| 외부 의존성 | 기존 고정 배포본과 공식 USB 라이브러리 재사용 | 측정 중 CDN이나 다른 저장소의 최신 코드에 의존하지 않는다. |
| 개발 도구 | Node 테스트 러너, 작은 정적 빌드·개발 서버, JSDoc 타입 검사 | 서버 런타임·프런트엔드 프레임워크·범용 번들러를 필수로 만들지 않는다. |

상위 사이트, 도메인, 다른 교육 도구, 통합 배포 운영은 범위 밖이다. 앱은 외부에서 `publicBaseUrl`을 받아 자기 내부 경로와 자원 주소를 계산할 뿐이다. 기능 변경은 기획서, 내부 계약 변경은 이 문서를 기준으로 함께 갱신한다.

## 2. 재사용 기준과 이식 범위

### 2.1. 기준 원본

- **D:** [대시보드 `303a0bb`](https://github.com/Cho-WH/MicrobitSensorDashboard/tree/303a0bb957472d3a762ab05c6a2a043bedd29e8d).
- **G:** [bme280 `59c5c14`](https://github.com/Cho-WH/bme280/tree/59c5c149450f970bace2deaa183857c275595853). 아래 G 경로는 별도 표기 없으면 `gay-lussac/` 기준이다.
- G의 [기존 아키텍처](https://github.com/Cho-WH/bme280/blob/59c5c149450f970bace2deaa183857c275595853/gay-lussac/ARCHITECTURE.md)는 상태 소유권과 기존 동작의 근거다. 이 문서의 범용 채널·활동 계약이 이식 후 목표다.

재사용은 **고정 커밋에서 코드를 가져와 이 저장소가 유지보수하는 방식**이다. 실행 시 타 저장소를 import하거나, 원본 앱을 iframe에 넣어 통합 앱으로 가장하지 않는다. 3D 배선 뷰어만 독립 표시 자원으로 재사용한다. 이식 커밋에 원본 경로·커밋·변경 목적을 남긴다.

### 2.2. 원본 → 목표 대응표

| 원본 | 재사용 수준 | 목표와 필요한 수정 |
|---|---|---|
| G `data/run-store.js` | 핵심 로직 이식 | `src/data/run-store.js`. 미저장 대기열·revision·동일 묶음 재시도·잠금 유지. 실험 이름·DB 잠금 이름·프로그램 생성 인자를 범용화한다. |
| G `data/repository.js` | 구조 이식 | `src/data/repository.js`. 네 저장소·일괄 트랜잭션을 유지하고 새 데이터 형식과 DB 이름을 적용한다. |
| G `data/contracts.js` | 분리·일반화 | `src/domain/`의 계약·검증·열 카탈로그. 고정 `SOURCE_COLUMNS`, 온도·압력 전용 유효성, 고정 기본 그래프를 주입값으로 바꾼다. |
| G `analysis/workspace.js`, `scope.js`, `table-data.js` | 동작 보존 후 일반화 | `src/analysis/`. 선택·제외·분석 범위·새 자료 반영·revision·되돌리기는 유지한다. 열 목록과 값 접근을 카탈로그 기반으로 바꾼다. |
| G `analysis/calculations.js`, `regression.js`, `graph-data.js`, `reflection.js` | 계산 로직 우선 재사용 | 같은 분석 디렉터리. 원자료 접근과 기본 질문을 분리하고 회귀·계산 오류·근거 재현을 회귀 테스트한다. |
| G `ui/analysis-*`, `data-table.js`, `table-*`, `range-selector.js`, `calculation-editor.js`, `reflection-view.js` | 기존 UX·컴포넌트 재사용 | `src/ui/`. 가상 표·구간 선택·편집·근거 UI 유지. 고정 열·실험 문구·DOM 식별자 결합을 제거한다. |
| G `ui/chart-view.js`, `ui/trend-*` | 어댑터 재사용 | Chart.js 접근을 차트 어댑터 하나로 모으고 센서별 데이터셋을 입력으로 받는다. D의 별도 차트 엔진은 함께 실행하지 않는다. |
| G `measurement/transport.js` + bme280 루트 `js/bluetooth.js` | 연결 로직 이식·매개변수화 | `src/device/`. 연결 시도 ID·지연 콜백 차단·구독 해제는 유지하고 `sendBmeCommand`·고정 decoder·온도/압력 메시지를 분리한다. |
| G `measurement/session.js`, `reception-monitor.js`, `diagnostics/*` | 공통 세션 추출 | `src/measurement/`. 수신·기록·일시정지·종료는 공통화하고 배치·가열·물 추가 조건은 활동 policy로 옮긴다. |
| G `guide/programmer-adapter.js`, `program-config.js` | USB 어댑터 재사용 | `src/device/programmer.js`와 펌웨어 manifest. 공식 전송·해시·V2 검사 유지, HEX 선택만 센서 정의에 연결한다. |
| G `guide/steps.js`, `progress.js`, `viewer-adapter.js`, `ui/guide-view.js`, `guide-layout.js`, `guide.css`, 준비 DOM + bme280 `bmp280-wiring/` | 단계 구조·기존 UX·자원 재사용 | `src/guide/`, `src/ui/`, `public/viewers/bmp280/`. 큰 단계와 세부 단계, 그림/설명 병렬 배치, 이전/행동 버튼과 초점 유지. 공통·센서·활동 단계를 조립하고 3D는 BMP280 관련 안내를 처음 열 때 지연 로드한다. |
| G 준비물 도움말, `assets/setup.svg`, `ui/experiment-guide.js`·CSS, 안내 DOM·그림 | 활동 안내 이식 | 공통 도움말·안내 UI와 센서/활동 content 및 로컬 자원. 명시적 기록 시작과 실제 활동 조작에 맞게 문구·그림을 정합화한다. 추가 이식 목록은 [M2 재점검](m2-ux-review.md)을 따른다. |
| D `js/config.js` | 코덱과 v1 호환 부분만 추출 | `src/sharing/`. 압축·base64url·구형 기본값은 유지하되 잘못된 링크를 기본 자기장 설정으로 여는 동작은 제거한다. |
| D `js/ui/experiment-settings.js` | 공유 폼·복사·QR 조작 재사용 | `src/ui/share-view.js`. 장치 설정 변경과 수업 공유 편집을 분리하고 교사의 열린 Run을 변경하지 않는다. |
| D `vendor/qrcodegen.js`, `simple-qrcode.js` | 고정본·SVG 래퍼 재사용 | QR 인코더는 하나만 사용한다. `simple-qrcode.js`는 두 번째 인코더가 아니라 로컬 SVG 래퍼다. |
| G 파일 입출력·검증·compact-samples 및 테스트 | 어댑터·픽스처 이식 | `src/data/files/`, `tests/`. 기존 JSON v1/v2·CSV를 새 Run으로 변환하고 원본 테스트의 유효한 사례를 보존한다. |

**복사하지 않을 것:** 두 앱의 `app.js`를 이어 붙인 제어기, D의 별도 원자료 `state.js`, 센서별 UI 복제본, 구형 설정 편집기의 무제한 기본값 덮어쓰기. 공통 로직은 하나로 선택하고 기존 자산을 둘러싼 연결 코드만 새로 작성한다.

## 3. 라이브러리와 오픈소스

다음 버전은 G의 [vendor 기록](https://github.com/Cho-WH/bme280/blob/59c5c149450f970bace2deaa183857c275595853/gay-lussac/vendor/README.md)에 있는 **이식 기준 고정본**이다. 최신 버전이라는 의미가 아니다. 이식 시 실제 파일의 해시와 고지를 다시 확인한다.

| 기능 | 채택 | 접근 위치 | 선택 근거 |
|---|---|---|---|
| 그래프·PNG | Chart.js 4.5.0 / MIT | `ui/chart-view.js` | 기존 상호작용·시간선·산점도·출력을 유지한다. |
| IndexedDB | idb 8.0.4 / ISC | `data/repository.js` | 기존 트랜잭션 구조와 `tx.done`을 재사용한다. |
| CSV | Papa Parse 5.7.0 / MIT | `data/files/csv.js` | 따옴표·줄바꿈 처리를 직접 재구현하지 않는다. |
| USB 설치·HEX | 기존 microbit-usb 번들: microbit-connection 1.0.0, universal-hex 0.2.2 / MIT; nrf-intel-hex 1.4.0 / BSD-3-Clause | `device/programmer.js` | 검증된 공식 전송 경로와 포함 의존성 고지를 유지한다. |
| QR | Project Nayuki 고정 소스 / MIT + D의 SVG 래퍼 | `sharing/qr-adapter.js` | 버전 태그를 추측하지 않고 이식한 파일 SHA와 출처로 고정한다. |
| 아이콘 | 기존 Lucide 0.468.0 SVG / ISC | UI의 로컬 SVG 자원 | 전체 아이콘 런타임 없이 필요한 심벌만 재사용한다. |
| 표 | 기존 HTML table 가상화 | `ui/data-table.js` | 원자료 읽기·선택·정렬·계산 표시에는 현행 표를 유지한다. |
| 링크 압축 | 브라우저 CompressionStream / DecompressionStream | `sharing/codec.js` | 기존 deflate-raw와 호환. 미지원 시 새 형식의 무압축 표현을 사용한다. |
| 단위·수식·회귀 | 기존 제한된 계산 엔진 | `analysis/` | 사칙연산·거듭제곱·선형회귀를 재사용하고 임의 JavaScript 수식을 실행하지 않는다. |

UMD 배포본의 `globalThis.Chart/idb/Papa` 접근은 위 어댑터 내부로 제한한다. 그 객체·라이브러리 타입을 도메인 계약에 노출하지 않는다. USB 번들 재생성은 원본 `dev/usb-library/`의 lockfile·빌드 스크립트와 esbuild 0.25.12를 함께 이식한다. 일반 앱 코드를 빌드하기 위해 USB 번들을 매번 재생성하지 않는다.

초기 도입에서 제외하는 도구는 React/Vue, Redux/RxJS, XState, Dexie, 대형 데이터 그리드, math.js, 추가 3D 엔진이다. 이들은 나쁜 도구라서가 아니라 기존 동작을 대체할 실익이 아직 없기 때문이다. 복잡한 셀 편집·다중 시트·수식 언어·고속 수집을 실제 범위로 채택할 때 해당 어댑터만 재검토한다.

`vendor/manifest.json`에는 정확한 파일·버전 또는 커밋·출처·SHA-256·라이선스 파일·변형 여부를 기록한다. 원본 헤더와 제3자 고지는 보존한다. bme280 루트에는 이번 확인 범위에서 공통 LICENSE 파일이 없으므로 자체 작성 코드의 적용 라이선스는 이식 시 명시하고, 제3자 코드·3D 자산에 같은 라이선스를 임의 적용하지 않는다. 출처가 불명확한 자산은 공개 이식 전에 확인하거나 검증된 그림으로 대체한다.

## 4. 모듈 구조와 의존 방향

```text
src/
  app/          bootstrap.js, controller.js, router.js,
                context-resolver.js, capabilities.js
  domain/       contracts.js, validation.js, columns.js
  catalog/      index.js
    sensors/    bmp280/{definition.js,codec.js}
                magnetometer/{definition.js,codec.js}
    activities/ gay-lussac/{definition.js,policy.js,content.js}
  device/       ble-client.js, transport.js, programmer.js
  guide/        steps.js, progress.js, viewer-adapter.js
  measurement/  session.js, reception-monitor.js, diagnostics/
  data/         run-store.js, repository.js
    files/      json.js, csv.js, validation.js, legacy-gay-lussac.js
  analysis/     workspace.js, scope.js, table-data.js, calculations.js,
                graph-data.js, regression.js, reflection.js
  sharing/      codec.js, schema.js, legacy-v1.js, qr-adapter.js
  ui/           home-view.js, guide-view.js, measurement-view.js,
                analysis-view.js, share-view.js, chart-view.js,
                data-table.js, 기존 공통 UI 모듈
public/         vendor/, firmware/, viewers/, assets/
scripts/        dev.mjs, build.mjs
tests/         unit/, browser/, fixtures/
```

목표 책임 배치이며 모든 파일을 빈 껍데기로 선생성하지 않는다. 재사용 UI의 세부 분리는 유지하고 기능이 필요한 단계에 파일을 옮긴다. `utils`나 `common`에 무관한 업무 로직을 모으지 않는다.

호출 방향은 **UI의 사용자 행동 → App 제어기 또는 Workspace 명령 → 도메인 처리 → RunStore → Repository**다. 센서·활동 정의와 분석 계산은 DOM·IndexedDB·장치를 참조하지 않는다. 장치 어댑터는 읽기 입력을 전달할 뿐 Workspace나 화면을 변경하지 않는다.

| 소유자 | 소유하는 상태 | 경계 |
|---|---|---|
| AppController | 현재 화면, 탐색 중 설정, 활성 실험 참조, 준비 확인 | 모듈 생성·호출 순서만 소유. 샘플·회귀·DB 배열을 별도로 만들지 않는다. |
| Transport / Programmer | 연결 시도·장치·타이머 / USB 전송 작업 | 라이브러리 및 브라우저 자원을 감싼다. |
| MeasurementSession | 기록 게이트, 샘플 순번, 수신 진단·활동 진행 상태 | 표준 Reading만 소비하고 샘플·사건을 RunStore에 전달한다. |
| RunStore | 열린 Run, 원자료·사건·미저장 변경, 저장 상태·잠금 | 모든 기록 변경의 단일 진입점. |
| Workspace | 분석 대상·제외·계산식·축·근거·해석·revision | 직렬화한 불변 작업 사본만 RunStore에 전달한다. |
| View / 표·차트 어댑터 | DOM, 캔버스, 스크롤, 편집 초안 | 저장·연결·실험 종료를 소유하지 않는다. |

생성 함수에는 필요한 의존성만 인자로 전달한다. 시계·타이머·BLE·Repository 같은 외부 효과는 테스트 대체가 가능하게 하고, 매 함수 호출을 감싸는 범용 인터페이스 계층은 추가하지 않는다.

### 실제 앱 시작 경계

현재 앱의 고정 틀·초기 스타일은 `lab.html`이 선언한다. `startApp(root, options)`은 필수 스타일·서체 결정을 거쳐 Controller를 만들고, 반환된 `ready`가 최초 경로 적용·렌더를 끝낸 뒤 조작을 공개한다. 이는 장치 연결이나 기록 시작 완료를 뜻하지 않는다. 초기 로딩·실패 안내는 bootstrap과 HTML이, 메뉴·설정창 이벤트는 Controller 수명에 묶인 `bindAppShell`이 맡는다. 개발·전체 앱 검사는 같은 시작 경로를 사용하고, View 단위 검사는 Controller 생략을 명시한다. 측정·분석 작업 영역의 남은 높이는 공통 표시 도우미가 전달하고 내부 배분은 각 화면 CSS가 맡는다. 개발 서버와 빌드는 같은 CSS 결합 함수를 사용한다. 이들은 Session·RunStore·Workspace 상태를 소유하지 않는다. 시각 규칙의 소유권과 적용 기록은 [기본 UI 구조 전환 계획](design/visual-rollout-plan.md#14-기본-ui-구조-전환-계획)을 따른다.

### 최소 공개 인터페이스

다음 이름은 이식 후 목표 API다. 기존 내부 함수의 이름을 모두 바꾸기 위한 요구가 아니라 모듈 사이에서 합의할 호출면이다.

| 모듈 | 공개 호출 | 반환·효과 |
|---|---|---|
| 구성 해석 | `resolveExperiment(route, classConfig, catalog)` | 직렬화 가능한 검증된 구성 또는 구성 오류 |
| 연결 | `connect(context, onInput, onState)`, `disconnect(reason)` | 표준 Reading/오류·연결 상태; 기록 여부에는 관여하지 않음 |
| USB | `prepare()`, `install()`, `dispose()` | 진행 상태와 전송 결과; 활성 기록 변경은 Controller가 담당 |
| 세션 | `acceptInput(input)`, `pause()`, `resume()`, `finish()`, `startAdditional(confirmation)` | 입력 게이트·순번·사건; 저장은 주입된 RunStore 사용 |
| RunStore | `appendSample()`, `appendEvent()`, `saveWorkspace()`, `getSnapshot()`, `flush()` | 원자료·사건·분석 사본의 단일 변경 경로와 일관된 사본 |
| 증분 읽기 | `readSamples({ afterId, throughId })`, `getLatestSample()` | 해당 구간의 읽기용 자료만 반환; 내부 변경 가능 배열을 노출하지 않음 |
| Workspace | 범위 적용·제외·계산 열·그래프·새 자료 반영·근거 보관의 명시적 명령 | 한 행동을 한 revision으로 확정하고 RunStore에 전달 |

검증 오류는 `code`와 필요한 세부 정보를 포함해 호출자에게 전달하고, 화면에서 학생용 문장으로 바꾼다. 예외를 삼킨 뒤 기본 센서나 빈 데이터로 성공처럼 진행하지 않는다.

## 5. 센서·활동·수업 구성 계약

### 5.1. 선언과 실행 코드 분리

| 계약 | 필수 내용 |
|---|---|
| `SensorDefinition` | `id`, `version`, 한국어 이름, 지원 보드, 채널 목록, 펌웨어 참조, codec ID, 배선·보정 안내, 연결 정책, 기본 시간 그래프 |
| `ChannelDefinition` | 안정된 `id`, 이름, 수량 종류(`quantity`), 저장 단위, 선택적 물리량 표시명(`quantityLabel`), 표시 자릿수, 지원 여부, 유효성 범위, 계산·축 사용 가능 여부 |
| `FirmwareArtifact` | `id`, `version`, 로컬 경로, 보드, SHA-256와 해시 정규화 방식, codec ID, 시작 명령, 검증 상태, 알려진 측정 간격 |
| `ActivityDefinition` | `id`, `version`, 호환 센서, 필수 채널, 준비 단계, 활동 사건, 기본 분석 제안, 질문·내용, policy ID |
| `ClassConfig` | 형식 버전, 센서·활동의 ID와 버전, 제목·안내, 허용된 초기 표시·분석 설정 |
| `ResolvedExperiment` | 검증된 센서·활동·수업 사본, 채널 카탈로그, 펌웨어 참조, 조립된 준비 단계 |

정의와 저장 사본에는 함수·DOM·장치 객체가 없다. codec과 활동 policy는 레지스트리의 신뢰된 로컬 함수이며 ID로 연결한다. URL이나 가져온 JSON에서 모듈 경로·펌웨어 URL·실행 함수를 받지 않는다.

`resolveExperiment(route, classConfig, catalog)`는 **순수 함수**다. 센서 지원 범위 → 활동 필수 조건·기본값 → 허용된 수업 초기값 순으로 검사·결합한다. 임의 deep merge 대신 필드별 허용 목록을 사용한다. 필수 채널·단위·펌웨어·전송 명령·보정 조건은 수업 설정이 덮어쓸 수 없다. 학생의 이후 분석 변경은 Workspace에만 반영한다.

등록된 최신 버전은 일반 진입에 사용하고, 공유 링크가 지정한 과거 버전은 해당 정의를 찾는다. 없는 버전을 최신으로 조용히 치환하지 않는다. 과거 Run은 보관한 사본으로 분석할 수 있고, 해당 실행 정의가 없어도 파일 내보내기와 근거 읽기는 가능해야 한다.

M2의 등록 지점은 `src/catalog/modules.js`다. 센서 모듈의 정의·codec·모의 입력·준비 안내,
활동 모듈의 정의·준비 안내·policy를 묶어 등록한다. 홈 목록과 정적 진입 주소도 같은
등록에서 만든다. 설치 가능한 펌웨어 허용 목록은 별도 검증 경계로 유지한다.
확장 절차와 현재 한계는 [모듈 등록 안내](../src/catalog/README.md)에 정리한다.

공통 화면의 문구는 `catalog/ui-copy.js`의 기본값을 사용하고, 등록 모듈의 선택적
`uiCopy`로 필요한 항목만 덮어쓴다(공통 → 센서 → 활동). 표시 문구와 공통 준비 단계의
제목·설명만 대상으로 하며 저장 context·수업 설정·장치 조건은 변경하지 않는다.
홈·탐색 대상·현재 실험·보관한 분석 자료는 각자의 문맥으로 문구를 해석한다.

### 5.2. 구현된 센서·활동

| 구분 | 구성 |
|---|---|
| BMP280 | `temperatureC`, `pressureHpa`. 원본 3열은 온도·습도 자리·압력 순서, 시작 명령은 `bme\n`. 습도 자리는 미지원이며 0% 측정값으로 표시하지 않는다. |
| 내장 자기장 | X/Y/Z/크기, 저장 단위 `µT`; 한국어 화면은 자기장 성분·크기로 표시. 4열 수치와 보정 상태를 분리한 v2 규약으로 HEX를 생성·검증한다. |
| 내장 온도 | `temperatureC`, `℃` (기존 BMP280와 같은 단위 표기), 1초 명목 간격. 보드 기반 근사 온도임을 안내하며 `temperature-csv-v1` 1열을 해석한다. |
| 내장 밝기(조도) | `lightLevel`, 단위 `상대값`, 범위 0–255, 100ms 명목 간격. lux로 환산하지 않으며 `light-level-csv-v1` 1열을 해석한다. |
| 내장 가속도 | `accelerationX`, `accelerationY`, `accelerationZ`, `accelerationStrength`, 단위 `mg`, 100ms 명목 간격. `accelerometer-csv-v1` 4열을 모두 저장하고 기본 그래프는 크기만 표시한다. |
| 게이뤼삭 | BMP280 정의를 참조하고 용기·수조 준비, 배치·가열·물 추가 사건, 온도–압력 그래프와 탐구 질문을 추가한다. 별도 펌웨어·분석 엔진은 만들지 않는다. |

새 채널 ID는 센서 정의에서 고정하고 표시 이름 변경과 분리한다. 기존 `temperatureC`, `pressureHpa`는 유지한다. 자기장 채널은 `magneticX`, `magneticY`, `magneticZ`, `magneticStrength`로 정의하고 구형 기본 필드 `x/y/z/strength`는 호환 어댑터에서만 대응시킨다. 알 수 없는 사용자 정의 필드를 이름만 보고 특정 물리량으로 추정하지 않는다.

일반 측정의 기본 분석은 시간–대표 채널, 게이뤼삭은 온도–압력이다. 센서 선택은 측정 환경을 준비하고 활동 선택은 탐구 맥락을 추가한다. 분석 구간·제외·해석을 자동 확정하지 않는다.

추가 내장 센서 세 개는 공통 준비물·설치·연결·새 수신 확인만 사용하며 외장 배선·자기장
보정·게이뤼삭 활동은 붙이지 않는다. 모두 `start`로 송신을 시작하고 다른 명령이나 단절에서
중단하며, 재연결 후 자동 재개하지 않는다. 첫 유효값 제한 5초, 시작 재시도 1초 간격 최대
3회, 준비 확인 유효값 3개·1초 이상, 중단 판정 5초를 적용한다. 실제 간격을 보장하는 장치
시각은 없으며 수신 시각으로 기록하므로 고속 진동 분석을 지원한다고 표시하지 않는다.
밝기의 초기 준비용 0만 버리고 실제 어두움의 0은 보존한다. 가속도 ±8g 설정과 중력 포함,
정지 상태 크기 약 1000mg의 의미는 준비물 도움말에 명시한다.

### 5.3. 준비 단계와 활동 policy

준비 단계는 `id`, 종류, 제목·내용 참조, 완료 근거, 의존 단계 ID를 갖는 작은 목록이다. 공통 USB·수신 단계, 센서 배선·보정 단계, 활동 장치 구성 단계를 정해진 슬롯에 조립한다. 범용 워크플로 편집기나 임의 그래프 실행 엔진은 만들지 않는다.

현재 조립 슬롯은 센서의 `beforeProgram`·`afterConnect`, 활동의 `afterReception`이다.
공통 조립기와 준비 UI는 센서 ID로 분기하지 않는다. 단계의 그룹·문구·요약 확인 여부와
3D·도움말 자원은 해당 모듈이 제공한다. 준비 안내와 활동 policy도 정확한 등록 버전으로
해결하며, 저장 파일의 임의 안내·실행 정보는 사용하지 않는다.

V3의 센서별 수신 설명은 기존 모듈 `uiCopy.guide`를 사용한다. 활동 단계는 짧은 `description`과 선택적인 `instructions` 목록으로 표시하며, 이 목록은 안내일 뿐 추가 완료 조건이나 저장 상태를 만들지 않는다.

완료 근거는 사용자 확인과 장치 관측을 구분한다. 배선 그림을 보았다는 사실이 센서 통신 성공을 뜻하지 않으며, 과거 열람 이력으로 현재 수신 확인을 대신하지 않는다. 센서·펌웨어·연결 시도가 바뀌면 관련 준비 확인만 무효화한다.

#### M2 준비 UI 연결 계약

- Transport가 준비용 연결 시도·새 수신·최근 유효 수신 시각을 소유한다. `getState()`는 호출 시점의 신선도를 검사한다. 모의 장치도 같은 Transport와 codec을 거치며 controller에 두 번째 수신 monitor를 두지 않는다. Session의 monitor는 기록 구간의 공백·사건 판정에만 사용한다.
- GuideProgress는 수동 확인·설치 근거·현재 시도에서의 보정·배터리 확인을 소유한다. GuideView는 선택한 단계·표시 방식·확인 초안만 변경하고, 장치 조작은 `onInstall`, `onConnect({reuseDevice})`, `onDisconnect`로 controller에 요청한다. controller는 Transport의 사실과 Programmer의 상태, 기록/저장 가드를 `GuideFacts`로 전달한다.
- 준비 체크와 측정 허용은 분리한다(2026-10-20). `ready`는 준비 체크 완료 이력이고, `canMeasure`는 현재 연결과 정상 연속 수신 여부다. 연결·수신 단계와 준비 결과의 측정 이동은 `canMeasure`로 판단한다. 기록 시작·재개는 Transport의 현재 유효 수신을 다시 검사하며 수동 체크를 요구하지 않는다. 체크하지 않은 설치·보정·배터리·배치는 완료로 바꾸지 않고 `setup`에 실제 근거만 저장한다. 수신 중단·새 연결 시에는 이전 수신으로 시작할 수 없다.
- 수동 단계의 주 버튼은 확인 성공 후 다음 단계로 이동한다. 프로그램·연결·수신·배터리 단계의 다음 이동은 해당 완료 조건을 만족해야 한다. 이전·그룹 탐색은 확인을 만들지 않는다. 마지막에는 완료 요약과 아직 필요한 항목을 보여 주고, `onMeasure`는 화면만 전환한다.
- 준비된 장치 경로는 준비물·배선·프로그램을 사용자가 각각 확인하는 요약이다. 현재 수신·보정·배터리·활동 조건을 자동 확인하지 않는다. 설치 중에는 단계·구성 변경을 막고, 연결 중에는 취소를 사용할 수 있다. 실패 후 재시도는 기존 시도 근거를 무효화한다.
- 그림·도움말·활동 안내는 등록된 센서/활동 content에서만 가져온다. 저장 파일의 임의 URL을 그림·iframe·실행 코드로 사용하지 않는다. 표시 채널·시간 범위는 UI 설정이며 모든 지원 채널의 저장을 유지한다.

활동 policy의 공개 형태는 `reduceActivity(state, command, facts) -> { nextState, events, error? }`다. 주입된 facts에서 기록 상태·수신 확인·배치 여부를 읽고 결과를 반환한다. 타이머·DOM·DB·BLE를 직접 조작하지 않는다. 공통 Session은 기본 메모를 처리하고, 게이뤼삭 policy만 `placement`, `heating-start`, `water-added` 등의 조건을 판단한다. 활동 진행 상태는 Session 한곳에서 소유하고, 별도 DB 상태를 중복 저장하지 않는다. 재열기 시 버전이 기록된 사건을 확정된 사실로 읽어 복원하며 새 수신 조건으로 과거 관측 결과를 다시 판정하지 않는다.

## 6. 장치 통신과 펌웨어

### 6.1. 입력 경계

```text
BLE notification bytes
  → ble-client: UTF-8 스트림·줄 경계 복원
  → sensor codec: 필드 해석·채널별 유효성
  → Transport: attemptId·UTC 수신 시각·단조 시각 부여
  → 준비 미리보기 또는 활성 MeasurementSession
  → RunStore.appendSample / appendEvent
```

알림 하나를 CSV 한 행으로 가정하지 않는다. 나뉜 행·한 알림의 여러 행·CRLF를 처리하고, 재연결 때 decoder와 부분 행 버퍼를 비운다. 누적 프레임은 초기 상한 1 KiB로 제한한다. 초과 프레임은 오류로 보고하고 다음 줄부터 복구한다.

`Reading`은 `{ type:'reading', values, validity, rawExtra?, attemptId, receivedAt, monotonicAt }`다. 구조가 해석되지 않는 행은 `parse-error`로 보낸다. 빈 문자열을 `Number('')`로 0으로 만들지 않는다. 한 채널의 결측·범위 이탈이 다른 채널의 유효한 수치를 없애지 않도록 채널별 판정을 유지한다. 범위 밖 유한 수치는 기록하되 분석에서 구분한다. 미지원 습도 토큰은 필요 시 rawExtra에 보관하고 측정 채널 값은 null/unsupported로 취급한다.

수신 확인은 센서·활동의 필수 채널에 대해 수행한다. 값이 같아도 새 Reading이 들어오면 정상 수신이다. `attemptId`가 지난 콜백은 무시하고 연결·종료 작업은 직렬화한다. UI 이벤트의 사용자 활성화가 필요한 장치 선택은 불필요한 await 전에 실행한다.

### 6.2. 센서별 연결 정책

BMP280의 이식 초기값은 원본의 첫 값 제한 3초, 시작 재시도 간격 300ms·최대 5회, 중단 판정 5초, 준비 확인 3개·1초다. 이것은 센서 공통 상수가 아니라 BMP280의 검증 기준값이다. [원본 설정][G-program]

자기장 v2는 연결 후 `prepare` → 장치의 선택 대기 응답 → 앱의 보정 시작/생략 선택으로 진행한다. 보정 시작·완료·생략은 각각 장치 상태 행으로 확인한다. 응답 대기·보정 중에는 수치 칸을 숨기고 센서 전용 안내를 표시한다. 완료 또는 생략 응답 뒤 첫 수치를 5초 안에 받은 후 공통 연속 수신 검사를 적용한다. 프로그램 응답 제한은 10초, 선택 응답은 5초, 보정은 120초이며 사용자 선택 자체에는 제한시간이 없다. 시간 초과·전송 실패는 연결을 정리하고 재연결을 안내한다. 재연결 시 이전 보정 근거를 지운다.

명령과 상태 순서, 전용 그림·버튼·문구·모의 동작은 자기장 모듈의 선택적 `preparation`에 둔다. 공통 Transport는 상태 이벤트를 해당 세션에 전달하고 수신 허용을 확인하며, 공통 GuideView는 모듈이 제공한 패널과 단계 제안을 사용한다. 상태 행은 Sample로 저장하지 않는다. 기록 시작의 `setup.calibration`은 `device-reported / skipped / unknown`으로 구별하고 전체 JSON에 보존한다. `device-reported`는 장치 보정 루틴의 종료 응답이며 물리적 정확도 보증은 아니다. CSV는 기존처럼 측정값·열 정보용이다. 사용자 결정에 따라 미배포 v1 펌웨어와의 호환을 요구하지 않는다. 이전 기록의 준비 상태를 현재 연결에 복원하지 않는다.

지원하지 않는 원격 측정 간격 변경을 UI에 노출하지 않는다. 기존 `basic.pause(100)`은 명목 간격이지 정확한 10Hz 보증이 아니다. 실험에는 실제 수신 시각을 저장하며 브라우저 도착 시간을 장치 측정 시각으로 표시하지 않는다. 고속 진동 측정용 장치 timestamp·sequence는 후속 프로토콜 범위다.

### 6.3. USB 설치·식별

USB 연결 안내는 별도 확인 단계 없이 프로그램 설치 단계에서 제공한다. 설치 성공과 기설치 사용자 확인은 기존처럼 구분한다. 모바일 공식 앱을 통한 HEX 전송은 [센서 프로그램 설치 개선 과제](sensor-program-installation-roadmap.md)에 후속 조사·검증 계획으로 기록한다. 현재 구현된 설치 경로는 아래 USB 계약이며, 무선 설치 지원이 추가된 상태가 아니다.

기존 공식 USB 어댑터의 파일 사전 준비 → 해시 검증 → 보드 확인 → 전송 → 자원 해제 순서를 보존한다. 원본 BMP280 해시는 UTF-8 텍스트의 CRLF만 LF로 바꾸어 계산하므로 manifest의 `digestMode`에 그 규칙을 명시한다. 새 해시를 계산하지 않고 raw-byte 해시로 의미를 바꾸지 않는다. 전체 전송 경로와 V2 확인을 먼저 유지한다. [원본 어댑터][G-programmer]

기록 중에는 새 펌웨어 설치·보정·센서 구성을 시작하지 않는다. Controller가 기록 마감·저장 성공을 확인한 뒤 Programmer를 활성화하고, 전송 직전에도 같은 가드를 확인한다. 장치 선택·설치·BLE 선택은 서로 다른 성공 상태다.

숫자 CSV는 실제 센서 종류·펌웨어 버전·USB와 BLE 장치의 동일성을 증명하지 못한다. `expectedFirmware`, `installedThisSession`, `reportedFirmware:null`, `readingsCompatible`을 구분한다. 장치가 버전을 보고하지 않으면 추정값을 보고된 버전으로 저장하지 않는다. 재설치 안내와 장치 이름 확인을 제공하고, 자동 식별은 명시적인 장치 응답을 추가할 때만 확장한다.

### 6.4. 내장 센서 펌웨어 빌드

`dev/firmware/targets.json`은 빌드 대상별 소스·ID·버전·규약을, `pxt-template.json`은
공통 UART 설정을 제공한다. 고정 PXT와 해시 검증한 네이티브 이미지로 HEX를 생성하고
공식 V2 해석·내장 소스·설정 일치를 확인한 뒤 `dev/firmware/built/artifacts/`에 후보를 남긴다.
빌드가 설치 허용 목록이나 배포 HEX를 자동 갱신하지 않는다. `--check`로 기존 배포본과
재현 결과·규약을 비교한다. 자기장은 기존과 같은 바이트를 유지하며 BMP280 원본 HEX는
소스 빌드 대상에서 제외한다. 확장 절차·런타임 지원 범위는 [빌드 안내](../dev/firmware/README.md)에 둔다.

## 7. 실험 생명주기와 데이터 계약

### 7.1. 실행 순서

| 행동 | 처리 |
|---|---|
| 홈·카드·직접 링크 열기 | ResolvedExperiment와 준비 초안만 생성한다. Run·장치 연결을 자동 생성하지 않는다. |
| 장치 연결 | 준비용 수신을 표시하고 확인한다. 과거 미리보기는 원자료로 소급 기록하지 않는다. |
| 기록 시작 | 구성·준비·쓰기 가능 여부 검사 → RunStore 생성·잠금 획득 → 설정 사본 보관 → Session 기록 게이트 열기. 연속 클릭은 한 요청으로 처리한다. |
| 같은 실험의 준비·측정·분석 이동 | View만 전환한다. 기존 Session·RunStore를 유지한다. |
| 실험 선택·새 실험 준비·다른 실험으로 이력 이동 | 분석 초안 확정 → Session 기록 마감 → RunStore 저장 완료 → 장치·USB 자원 해제 → RunStore 닫기와 작성 잠금 해제. 실패 시 실험·연결을 유지하고 이동하지 않는다. |
| 일시정지 | 저장용 입력 게이트를 닫고 사건·Run 상태를 저장한다. 수신 미리보기는 유지할 수 있다. |
| 재개 | 준비·동일 구성 확인 후 같은 Run에 순번을 이어 붙이고 불연속 사건을 남긴다. |
| 기록 마치기 | 먼저 입력을 마감하고 종료 사건을 추가한 뒤 flush한다. 실패해도 닫힌 입력 게이트와 같은 RunStore를 유지한다. |
| 종료 후 추가 측정 | 같은 센서·펌웨어·활동과 활동별 조건을 확인한다. 저장이 완료된 같은 Run에 새 측정 구간 사건을 남긴다. |
| 호환되는 장치 출처 JSON 이어 측정 | source/importedFrom/provenance는 보존한다. 등록된 runtime과 펌웨어 해시·채널 단위/범위를 검사하고, 사용자의 연결·수신 확인·재개 또는 추가 측정 뒤 순번을 이어 붙인다. CSV·출처 불명·임시 분석은 입력 게이트를 열지 않는다. |
| 다른 센서·활동 실행 | 기존 실험을 마치고 저장한 뒤 준비한다. 새 Run은 새 기록 시작 때 생성한다. |
| 새로고침·강제 종료 후 열기 | 저장 자료를 복원한다. 자동 연결·자동 기록 재개를 하지 않고 필요하면 interrupted로 표시한다. |

전송 상태, 기록 상태, 저장 상태는 별도 축이다. 예를 들어 `연결됨 + 기록 마침 + 저장 오류`를 표현할 수 있어야 한다. 새 실험 생성 전에 저장소를 열지 못하면 미리보기만 제공하며 저장되는 것처럼 보이지 않게 한다.

실험 이름 변경·삭제와 사건 메모 편집도 RunStore를 거친다. 다른 Run의 관리에는 해당 Run의 작성 잠금을 얻고
작업 후 해제한다. 삭제는 열린 실험의 기록·저장을 먼저 마감하며 실패 시 자료를 유지한다. 사건 목록과 측정 그래프의
표시 캐시는 사건 개수뿐 아니라 `eventsVersion`으로 갱신하여 같은 사건의 메모 변경도 반영한다.

활동별 조작 종류·일시정지 허용과 추가 측정 조건은 등록된 활동 정의/policy에서 제공한다. 추가 측정 사건에는
조건별 `same/changed/unsure`와 메모, 이전 마지막 sampleId를 보존한다. 가져온 JSON의 고정 숫자 열은 기존 셀을 유지하고,
새 장치 측정에서 제공되지 않는 열은 결측과 사유를 저장한다. 기존 분석 대상·보관 근거는 명시적인 새 자료 반영 전까지 유지한다.

선택 화면의 활성 `context`는 null이다. `targetContext`는 미리보기 대상 표시만 소유하며
장치 runtime·Session·RunStore를 만들지 않는다. 명시적 준비 진입에서만 활성 context와
runtime을 설정한다. 종료한 실험의 준비 확인·수신 버퍼·앱이 기억한 재연결 대상은
다음 실험으로 넘기지 않는다(브라우저 자체의 장치 허용 권한을 철회하는 것은 아니다).
Controller가 버튼과 이력 이동을 같은 종료 경계로 처리하고 저장·전환 중 중복 조작을
차단한다. 저장소의 기존 Run별 ID·쓰기 잠금 계약은 유지한다. 미리보기 경로는
`?view=preview`로 직렬화하며 이력 이동 실패 시 표시 중인 실험의 주소를 복구한다.

앱이 제어하는 이동은 저장 후 진행하거나 취소할 수 있다. 탭 닫기·모바일 강제 종료까지 비동기 저장을 보장할 수는 없다. 자동 저장을 주된 보호 수단으로 하고 `visibilitychange`는 추가 flush 기회, `beforeunload`는 필요한 경우의 보조 경고로 사용한다. [브라우저 생명주기 제한][W-lifecycle]

### 7.2. 저장 데이터

아래는 목표 레코드의 핵심 형태다. 함수·Set·Map은 저장 전에 일반 객체·배열로 변환한다. 도메인 타입은 `domain/contracts.js`의 JSDoc으로 한 번 정의한다.

```javascript
// Run
{
  id, schemaVersion: 1, runRevision,
  name, createdAt, updatedAt, status, source,
  context: { sensor, activity, classConfig, channels, firmware, setup },
  lastSavedSampleId, lastSavedEventId,
  provenance // 원본 앱·파일 버전·가져온 시점 등
}
// Sample: source 값은 보존하고 계산 결과를 덮어쓰지 않는다.
{
  runId, sampleId, receivedAt,
  values: { temperatureC: 29.1, pressureHpa: 1012.4 },
  validity: { temperatureC: 'valid', pressureHpa: 'valid' },
  rawExtra, sourceSampleId
}
// Event
{ runId, eventId, receivedAt, type, payload, source }
```

`sampleId`는 Run 내 증가 정수이며 표시 행 번호·정렬 순서와 무관하다. `validity`는 `valid / missing / unsupported / out-of-range / error`를 구분한다. 값 0은 유효 숫자이며, 결측을 0이나 보간값으로 채우지 않는다. 수신 시각은 UTC 밀리초, 연결 진단용 단조 시각은 런타임 전용이다. 시계 역행·연결 중단·일시정지에는 불연속 사건을 남겨 시간선을 임의로 잇지 않는다.

CSV에 시각이 없으면 원래 시각을 만들어내지 않는다. 가져오기 메타데이터에 그 사실을 기록하고 순번 기반 보기나 명시적으로 입력받은 간격을 사용한다. 가져온 값의 단위를 이름만으로 변환하지 않는다.

채널 카탈로그는 `getSourceColumns(run.context)`와 `readCell(sample, columnId)`를 통해 분석·표·파일에서 함께 사용한다. 고정 온도/압력 필드를 직접 읽는 코드를 각 화면에 남기지 않는다. 기존 sampleId·receivedAt 같은 시스템 열과 센서 열·가져온 열·계산 열의 ID 충돌을 검사한다.

## 8. 저장·복원·파일

### 8.1. RunStore와 Repository

새 앱은 `microbit.sensor-lab` DB v1을 사용한다. 기존 `bme280.gay-lussac` DB를 직접 업그레이드하거나 삭제하지 않는다. 새 DB 버전, Run schemaVersion, 파일 버전, 센서·활동 정의 버전은 서로 다른 값이다.

| 저장소 | 키 | 내용 |
|---|---|---|
| runs | id | 실험 메타데이터·구성 사본·저장 경계 |
| samples | [runId, sampleId] | 추가 전용 원자료; runId 조회 인덱스 |
| events | [runId, eventId] | 사건; 사용자 메모만 검증 후 수정 |
| workspaces | runId | 분석 정의·revision·근거·해석 |

기존의 약 1초 묶음 저장을 출발점으로 한다. 종료·실험 변경·명시적 저장은 flush 경계를 사용한다. Repository는 관련 레코드를 한 readwrite 트랜잭션에 넣고 `tx.done` 후에만 저장 완료를 응답한다. 트랜잭션 도중 네트워크·파일·사용자 입력을 기다리지 않는다. [idb 계약][W-idb]

실패 묶음은 같은 ID·같은 내용으로 재시도한다. 동일 ID의 다른 원자료 덮어쓰기는 충돌이다. `baseRunRevision`과 완료 revision으로 낡은 쓰기를 검출한다. revision 1을 저장하는 사이 생긴 revision 2를 저장 완료로 표시하지 않는다. 삭제도 쓰기 잠금을 유지한 하나의 트랜잭션으로 처리한다. [원본 RunStore][G-store]

Web Locks의 Run별 잠금을 유지한다. 잠금 미획득 시 읽기 전용, Web Locks 미지원 시 초기판의 영구 쓰기를 비활성화한다. localStorage 플래그를 동시성 잠금으로 대체하지 않는다. 새 실험 UUID가 다르더라도 BLE 선택 장치를 여러 탭이 함께 사용할 수 있다고 가정하지 않는다.

저장 오류에서 원자료 대기열을 비우지 않는다. 입력을 보존할 수 없는 상태가 지속되면 기록을 일시정지하고 재시도·전체 실험 파일 보관을 제공한다. 분석은 같은 메모리 사본으로 열 수 있으나 저장 실패 표시를 유지한다. 브라우저 저장소는 장기 백업이 아니므로 JSON 내보내기를 제공한다.

### 8.2. 파일 호환

새 전체 실험 형식은 `{ format:'microbit-sensor-lab', fileVersion:1, run, samples, events, workspace }`로 시작한다. 초기에는 읽기 쉬운 레코드를 유지하며 일반 내보내기에 별도 압축 라이브러리를 도입하지 않는다. 기존 compact-samples는 구형 JSON v2 가져오기 경계에서만 필요하다.

기존 게이뤼삭 JSON v1/v2는 원본 식별·검증 규칙으로 해석한 뒤 `temperatureC/pressureHpa`를 values로 옮긴다. 샘플 ID, 시간, 제외 사유, 계산식, 사건, 근거와 해석을 보존한다. 새 Run ID를 발급하고 모든 참조를 일관되게 다시 연결한다. 기존 파일은 변경하지 않는다. 이전 DB를 열거나 도메인 이전을 수행하는 코드는 이 설계에 포함하지 않는다.

CSV는 Papa Parse로 문자열을 해석한 뒤 헤더·필드 수·숫자·단위·중복 열을 앱이 검증한다. 기존 게이뤼삭 CSV와 대시보드 기본 CSV를 픽스처로 지원한다. 알 수 없는 CSV는 열 대응 확인 후 가져오고 계산 결과 열은 고정 숫자로 취급한다. 수식으로 역추정하지 않는다. CSV는 전체 분석 작업 복원의 대체 형식이 아니다.

가져오기 완료 전 크기·행 수·채널 수·참조 무결성·수식 순환을 확인한다. 초기 안전 상한은 파일 32 MiB, 복원 샘플 100,000개, 원자료 채널 16개, 계산 열 32개이며 제한값은 한곳에서 관리한다. 기록과 작업 변경에도 같은 직렬화 예산을 적용하여, 한도 도달 전에 경고하고 필요하면 기록을 일시정지한 뒤 보관·새 실험 시작을 안내한다. 앱이 내보낸 파일을 자체 가져오기 제한 때문에 복원하지 못하는 조합은 허용하지 않는다. 압축 구형 파일은 복원 후 크기도 제한한다. 실패 시 현재 열린 Run이나 일부 DB 레코드를 바꾸지 않는다. 인용문·메모 등 CSV 문자열 셀은 수식 삽입 방어를 적용하고 음수 숫자를 문자열로 변조하지 않는다. [Papa Parse][W-papa]

## 9. 공통 분석 계약

Workspace는 불러온 자료 경계, 기본/지정 분석 모드, 후보 ID, 제외 ID·사유, 계산 열, 그래프, 보관 근거와 글을 소유한다. 표의 현재 체크·정렬·필터와 실제 분석 대상을 구분한다. 표 렌더러가 반환한 보이는 행을 분석 대상으로 사용하지 않는다.

새 수신은 RunStore에만 추가된다. **새 자료 반영**에서 Workspace의 읽기 경계를 갱신하며 기본 모드는 후보를 새 전체 자료로 확장하고, 지정 모드는 기존 후보 ID를 유지한다. 제외 사유·계산·보관 근거·해석은 보존한다. 구간 지정과 전체 자료로 전환하는 명령은 원본 게이뤼삭 UX를 계승한다.

`workspaceRevision`은 저장·되돌리기 단위이고 `analysisInputRevision`은 계산 대상·식·적용 축의 변경 단위다. 비동기 계산을 추가할 경우 현재 입력 revision과 다른 결과는 폐기한다. 계산·회귀·표·CSV는 같은 카탈로그와 사용 자료 판정을 소비한다.

계산식은 기존 `{ id, name, unit, lhs, op, rhs }` 형태와 제한된 연산자를 유지한다. 참조 무결성·순환·0으로 나누기·비유한 결과를 검사한다. 단위는 명시적 메타데이터이며 사용자가 붙인 이름으로 차원적으로 타당하다고 판정하지 않는다. 켈빈 변환 같은 검증된 템플릿은 활동이 일반 계산 열 초안을 제공하는 방식이다.

`graph`의 기존 `xColumnId`·`yColumnId`·`type`·`connectGaps`·`view` 계약에 선택적인 `right: { yColumnId, trendEnabled, view }`를 추가한다. 오른쪽 항목은 하나이며 왼쪽과 같은 열을 중복 선택하지 않는다. 오른쪽 정의가 없는 기존 파일은 단일 세로축으로 연다. 두 계열은 X·분석 후보·제외·그래프 모양을 공유하고, 유효점·회귀·연장 상태는 각각 계산한다. 축 추가·제거도 Workspace 명령과 이력에 포함하며, 오른쪽 계산 열의 의존성과 삭제 보호를 유지한다. 보관 근거와 JSON은 두 축의 정의를 저장하고 PNG·인쇄도 같은 표시 모델을 소비한다. 물리량과 단위가 모두 같은 계열의 스케일은 측정/원자료 차트와 동일한 공통 축 규칙으로 묶는다.

회귀는 기존 중심화·스케일 조정 알고리즘을 재사용한다. 유효점 부족, 서로 다른 X값 부족, 상수 Y의 R² 등 정의할 수 없는 결과를 0으로 대신하지 않는다. 시간축 회귀는 큰 UTC 숫자를 그대로 쓰지 않고 기준 시각을 뺀 초 단위로 계산하며 식의 단위를 표시한다. 화면에 표시하기 위한 반올림은 계산 입력에 적용하지 않는다.

보관 근거는 당시 후보·제외·식·축·자료 경계를 고정한 사본이다. 이후 측정·분석 변경으로 조용히 교체하지 않는다. 근거 재현에도 공통 계산 엔진을 쓰고, 게이뤼삭의 교육 질문만 활동 content에 둔다. 일반 센서 분석에 절대영도·가열·기체 누설 관련 문구가 노출되지 않도록 한다.

## 10. 수업 공유·입력 안전성

공유 기능은 장치 없이 동작한다. ShareView는 별도 초안을 편집하고 검증된 ClassConfig로 링크와 QR을 만든다. 열린 실험의 상태나 브라우저 권한을 변경하지 않는다. v2의 JSON 계약은 다음과 같다.

```javascript
{
  v: 2,
  sensor: { id: 'bmp280', version: 1 },
  activity: { id: 'gay-lussac', version: 1 }, // 자유 측정은 null
  title: '기체의 온도와 압력', instructions: '',
  presentation: {
    visibleChannelIds: ['temperatureC', 'pressureHpa'],
    graph: { xColumnId: 'temperatureC', yColumnId: 'pressureHpa', type: 'scatter' }
  }
}
```

`presentation`의 생략 항목만 지정된 정의 버전의 기본값을 사용한다. 새 측정값의 제외·구간 지정이나 학생 답안은 이 구성에 포함하지 않는다.

| 링크 형식 | 처리 |
|---|---|
| 새 `d.<base64url>` | deflate-raw로 압축한 ClassConfig v2 |
| 새 `j.<base64url>` | UTF-8 JSON의 무압축 ClassConfig v2; 압축 API 미지원 시 사용 |
| 접두어 없는 기존 cfg | 구형 deflate-raw v1 전용 해석기 |

새 링크는 기본값을 생략해도 센서·활동 정의의 ID와 버전은 포함한다. 구형 v1의 생략값은 **당시 D 기본 설정**을 동결한 픽스처로 복원하며 현재 기본 센서에서 가져오지 않는다. 임의 필드·시작 명령을 담은 과거 링크는 제한된 legacy 측정 구성으로 열고, 검증된 센서 펌웨어로 자동 승격하지 않는다. legacy 명령은 길이 제한·한 줄 검증 후 사용자 연결 동작에서만 전송하며 맞춤 펌웨어 자동 설치를 제공하지 않는다.

경로와 cfg의 센서/활동이 충돌하거나 버전·코덱·필수 필드를 해석할 수 없으면 준비 진행을 중단하고 복구 화면을 표시한다. D의 기존 ‘실패 시 기본 Magnetometer로 열기’는 계승하지 않는다. [기존 공유 구현][D-config]

초기 제한은 인코딩 cfg 8 KiB, 스트림 해제 결과 64 KiB, JSON 깊이 8, 수업 제목 120자·안내 800자다. DecompressionStream의 출력은 누적 제한을 검사하며 초과 즉시 취소한다. 전부 arrayBuffer로 받은 뒤에만 제한하지 않는다. 키 허용 목록을 적용하고 `__proto__`, `constructor`, `prototype` 등 위험한 키와 중복 cfg를 거부한다.

QR에는 링크 복사와 동일한 최종 URL을 넣는다. 1,200 UTF-8 바이트 초과 시 초기판에서는 QR 대신 안내 축약·링크 복사를 제안한다. 이 값은 가독성을 위한 앱 정책이며 스캔 성공 보증이 아니다. 실제 교실 기기로 확인한다. QR 실패를 데이터 손실이나 다른 설정 생성으로 처리하지 않는다.

사용자 제목·메모·파일 내용은 textContent로 표시한다. 가져온 문자열을 innerHTML, eval, Function에 전달하지 않는다. JSON으로 USB 명령·원격 스크립트·임의 HEX 위치를 주입할 수 없다. 공유 설정에는 학생 이름·측정값 등 불필요한 개인정보를 넣지 않는다.

## 11. UI·자원·성능

화면은 전달받은 표시 모델과 명령으로 동작한다. 기본 수명은 `mount → render → dispose`이고 dispose는 DOM 이벤트·ResizeObserver·차트만 정리한다. 화면 dispose가 Session·RunStore를 종료하지 않는다. 표와 차트는 원자료를 변경하지 않고 sampleId로 사용자 선택을 전달한다.

기존 준비·분석 화면의 주요 배치와 조작을 먼저 보존한다. 동작이 같은 버튼·팝업·파일·상태 표시를 재사용하고 센서별 화면 분기는 정의가 제공하는 항목으로 처리한다. `<dialog>`·레이블·키보드 조작·포커스 복귀를 유지하며 색상만으로 저장 오류·제외·결측을 구분하지 않는다. 수신값을 매번 스크린리더 알림으로 반복하지 않는다.

M2의 [UX·재사용 재점검](m2-ux-review.md)은 이 원칙의 구체적인 도입·인수 기준이다. 준비용 수신 사실은 작성자를 하나로 정해 장치 패널·가이드가 공유하고, Session의 기록 연속성 판단과 구분한다. 표시 채널·최근/전체 보기 설정은 수집 채널이나 분석 범위를 변경하지 않는다. 변경하는 준비 UI·표시 모델·controller 호출 계약을 JSDoc 검사에 포함한다.

BMP280 3D 뷰어는 로컬 자원으로 이식하고 기존 메시지 계약을 감싼다. `postMessage`의 origin·source·메시지 종류를 검사하며 임의 파일 내용으로 iframe 주소를 구성하지 않는다. 뷰어 실패 시 배선 표·그림으로 준비를 계속할 수 있다. 다른 센서는 필요할 때 해당 안내 자원만 로드한다.

공통 장치 자산은 `public/assets/devices/`에서 모델·연결 장면·메타데이터를 관리한다.
기존 BMP280와 같은 Three.js r180 런타임을 사용하며 장치 연결·준비 완료 상태를 소유하지 않는다.
별도 장치 페이지에서는 본체·USB·배터리 장면과 그림 저장을 제공한다. 내장 센서와 BMP280의 준비물·USB·배터리 안내는
동일 모델에서 생성한 정지 PNG를 사용하며 3D 런타임을 로드하지 않는다. 이미지 참조는 등록된 센서 guide의
`illustrations`에서만 가져오고 공통 GuideView가 표시한다. 배터리 안내를 펼치는 동작은 연결·준비 완료 근거를 만들지 않는다.
사용 계약·출처는 [장치 자산 안내](../public/assets/devices/README.md)를 따른다.
BMP280의 센서·확장 보드·연결선 끝 형상은 기존 배선 뷰어와 정지 이미지 생성기가 같은 함수를 사용한다.

초기 성능 검증 기준은 4채널·명목 10Hz·1시간에 해당하는 36,000행이다. 이는 지원 성능 목표이며 실측 결과가 아니다. RunStore의 전체 메모리 보관 구조를 우선 유지하되 매 수신마다 전체 스냅샷을 복사하지 않는다. 최신값 조회, 추가 구간 읽기, 변경 버전 조회를 사용하고 전체 복사는 내보내기·분석 반영 경계로 제한한다.

화면 그리기는 수신과 분리해 최대 초당 5회로 묶고 숨겨진 차트는 갱신을 줄인다. 원자료 저장은 그리기 빈도로 제한하지 않는다. 기존 가상 표를 유지하고 시간선의 표시 간소화가 필요하면 구간·공백을 보존한다. 회귀·CSV에는 간소화된 점이 아닌 전체 분석 자료를 사용한다. 관계 산점도에는 시간선용 자동 decimation을 그대로 적용하지 않는다. [Chart.js 성능 지침][W-chart]

초기판은 백그라운드 기록·화면 잠금 중 연결 유지·완전한 오프라인/PWA를 보장하지 않는다. 브라우저 기능은 이름 대신 capability로 검사하고, BLE 미지원이 파일 분석까지 막지 않게 한다. 서비스 워커·Web Worker는 실제 오프라인 요구나 측정된 병목이 생겼을 때 별도 도입한다.

Bluetooth 지원 판정은 `device/browser-support.js`가 소유하며 BLE 어댑터와 Transport의 `getSupport()`·`isSupported()`가 같은 결과를 사용한다. 보안 컨텍스트, `requestDevice` 존재, 확인 가능한 Permissions Policy를 동기적으로 읽는다. 이 결과는 API 사용 가능 여부이며 장치 존재·권한 허용·연결 성공을 증명하지 않는다. 자동 장치 선택·권한 요청·주기적 하드웨어 탐색은 하지 않는다. `getAvailability()`의 false를 브라우저 미지원이나 전원 꺼짐으로 취급하지 않는다.

UI는 이 판정으로 공통 안내 하나를 현재 화면에 배치한다. OS 추정은 iOS용 도움말 선택에만 쓰며, API를 제공하는 iOS 브라우저를 막지 않는다. 모의 Transport는 실제 브라우저의 미지원 안내 대상이 아니다. Bluefy 링크와 검증 범위는 [설치 개선 과제 §3.3](sensor-program-installation-roadmap.md#33-설치-성공과-측정-지원은-별도)에 기록한다.

## 12. 구현 단계와 검증

### 12.1. 개발·빌드

앱 코드는 native ES Modules로 실행한다. `scripts/build.mjs`는 등록된 센서·활동의 내부 진입 HTML과 공통 앱 자원을 생성하는 작은 정적 빌드로 둔다. 자원 URL은 외부 `publicBaseUrl`과 기준 경로에서 계산한다. source definition과 생성된 진입 정보의 ID·버전 불일치는 빌드 오류다. 앱 외부의 주소 매핑·호스팅 설정은 다루지 않는다.

M1에서 `package.json`의 module 모드, 지원 중인 Node LTS 버전과 lockfile을 고정한다. JSDoc 계약은 TypeScript의 `allowJs/checkJs/noEmit` 검사로 확인하되 TypeScript는 개발 도구로만 쓴다. 기존 코드의 일괄 형식 변경과 타입 전환을 이식에 섞지 않는다. 테스트 명령은 다음 책임으로 구성한다. **실행 명령은 [M1 기반](m1-implementation.md), 홈·직접 진입·장치 준비와 남은 실물 검증은 [M2 구현 현황](m2-implementation.md)을 따른다.**

| 명령 | 책임 |
|---|---|
| `npm run dev` | 로컬 정적 서버·직접 진입 경로 제공 |
| `npm test` | Node 테스트 러너로 순수 도메인·codec·저장/세션 계약 테스트 |
| `npm run typecheck` | JSDoc 공개 계약과 import 의존성 검사 |
| `npm run test:browser` | 브라우저의 실제 IndexedDB·DOM·가상 표·탐색 테스트 실행 경로 |
| `npm run test:e2e` | 격리된 Chromium에서 기본 UI 전환 관련 6개 묶음과 실제 페이지·3D 복구 검사 실행 |
| `npm run build` | 내부 진입 HTML·자원 생성 및 레지스트리 정적 검증 |

브라우저 테스트는 원본 `tests/browser.html`·`browser.js`의 유효한 사례를 이식한다. 기존 DOM·저장 검사는 유지하고 기본 UI 전환 관련 묶음을 Playwright Test의 독립 BrowserContext에서 실행한다. 새 화면 크기·3D 복구 검사는 실제 최상위 페이지에서 사용자 입력과 준비 응답을 확인한다. 재시도 없이 최초 실패의 trace·화면·결과를 남기며 실제 장치 확인과 구분한다. [Node 테스트 러너][W-test]

### 12.2. 단계별 산출물

| 단계 | 구현 범위 | 통과 조건 |
|---|---|---|
| M1 | 카탈로그·도메인 계약·RunStore/Repository·공통 분석 이식, BMP280와 게이뤼삭 분리 | 같은 BMP280 픽스처의 수치·분석 결과가 원본과 일치. 자유 측정에는 가열 규칙이 없음. 기존 JSON 복원에 손실 없음. |
| M2 | 앱 홈·직접 진입·준비 조립·USB/BLE 어댑터·자기장 정의/HEX | BMP280와 자기장의 다른 필드·명령·보정 대기를 같은 앱에서 처리. [UX 재점검 인수 기준](m2-ux-review.md)과 실제 V2 설치·배터리 BLE 수신 확인. |
| M3 | 수업 공유 초안·v2 코덱·v1 호환·QR·재진입 | 교사 장치 없이 공유, 기존 Run 불변, 세 대표 경로에서 학생별 독립 기록, 손상 링크의 명시적 오류. |
| M4 | 복원·저장 실패·성능·접근성·실물 연결 경계 검증 | 사용자 행동부터 파일 보관까지 세 경로가 완결되고, 미저장 분석·기존 파일·추가 측정의 회귀가 없음. |

**구현 순서와 선행 조건**

- M1은 센서·활동·채널 계약과 대표 픽스처 → RunStore/Repository와 공통 계산 → Workspace·파일·분석 UI 연결 순으로 진행한다. BMP280 자유 측정과 게이뤼삭 활동이 같은 기반을 사용하는지 먼저 확인한다.
- M2의 준비·장치 연결과 M3의 수업 공유는 M1의 구성·데이터 계약을 사용한다. 계약이 안정된 부분은 병행할 수 있지만, 공유 구성에서 실제 준비·기록으로 이어지는 연결 검증은 M2 흐름을 갖춘 뒤 수행한다.
- 저장·계산·호환성 검증은 해당 구현과 함께 수행한다. M4는 누적된 기능의 통합 확인 단계이며 앞 단계의 핵심 검증을 미루는 단계가 아니다.

파일의 세부 분리, 내부 함수와 작업 묶음은 위 경계 안에서 구현자가 판단한다. 공개 계약이나 사용자 흐름이 달라질 때만 관련 설계를 갱신한다. 작업·테스트 운영 원칙은 [AGENTS.md](../AGENTS.md)를 따른다.

### 12.3. 유지할 핵심 검사

| 경계 | 검사할 실패·정상 사례 |
|---|---|
| 구성 | 불가능한 센서/활동 조합, 버전 누락, 수업 설정의 명령 덮어쓰기, 채널 ID 충돌 |
| 통신 | 분할·다중 CSV, 빈 값/0/미지원, 오래된 콜백, 재연결 버퍼, 자기장 보정 대기 |
| USB | 해시 불일치, V1 거부, 취소, 기록 중 설치 차단, 전송 후 BLE를 별도로 확인 |
| 세션 | 준비 미리보기 미저장, 이중 시작, pause/resume, 종료 중 도착값, 추가 측정, 화면 전환 |
| 저장 | 지연·실패·같은 묶음 재시도, 저장 중 추가 revision, 다른 탭, 삭제 실패의 전체 취소 |
| 분석 | 정렬/필터와 분석 대상 분리, 새 자료 반영 모드 차이, 제외·계산·되돌리기, 근거 고정 |
| 계산 | 순환·참조 누락·0 나눗셈·NaN, 상수 X/Y, 큰 시간값, Kelvin 템플릿과 단위 표시 |
| 파일·공유 | 구형 JSON v1/v2·CSV 픽스처, 참조 재연결, 압축 과대입력, HTML 문자열, v1 생략 기본값 |
| UI·브라우저 | 새 탭·새로고침·뒤로 가기, 차트/표 수명, 초점·키보드, IndexedDB 실제 트랜잭션 |
| 실물 | BMP280 배선·설치·수신, 자기장 보정·설치·수신, 재연결·USB 분리·배터리·장치 혼동 |

소스 코드를 그대로 재서술하는 테스트보다 위 계약을 검증한다. 기존 `.test.mjs`와 픽스처를 우선 이식하고 변경 범위의 검사부터 수행한다. 모의 BLE·메모리 Repository 통과를 실제 하드웨어·IndexedDB 검증으로 보고하지 않는다. 이번 문서 작성은 구현·성능·실물 검증 완료를 의미하지 않는다.

## 13. 새 센서·활동을 추가하는 절차

**새 센서:** definition과 codec을 등록하고, 펌웨어 소스·고정 HEX·해시·보드·라이선스·검증 기록을 추가한다. 배선·보정 안내와 대표 수신 픽스처를 넣은 뒤 공통 준비·측정·분석·공유 검사를 통과시킨다. 새로운 물리량이라는 이유만으로 RunStore·Workspace·차트 엔진을 수정하지 않는다.

**새 활동:** 호환 센서·준비 내용·사건 policy·분석 초안·질문을 등록한다. 같은 센서면 기존 펌웨어와 codec을 사용한다. 학생 행동이 기존 준비·측정·분석 계약 안에 들어오면 새 화면·새 세션을 만들지 않는다.

새 요구가 공통 계약을 벗어나면 먼저 계약과 기존 활동의 영향을 설계한다. 사용 사례 하나를 맞추기 위해 `if (sensorId === ...)`를 공통 저장·계산 모듈에 넣거나, 아직 사용하지 않는 범용 플러그인 API를 미리 구축하지 않는다.

## 14. 근거

아래 링크는 원본 구현의 사실과 외부 API의 근거다. 표에 제시한 목표 구조·제한값·단계는 이 앱의 설계 결정이다.

[G-program]: https://github.com/Cho-WH/bme280/blob/59c5c149450f970bace2deaa183857c275595853/gay-lussac/program-config.js
[G-programmer]: https://github.com/Cho-WH/bme280/blob/59c5c149450f970bace2deaa183857c275595853/gay-lussac/guide/programmer-adapter.js
[G-store]: https://github.com/Cho-WH/bme280/blob/59c5c149450f970bace2deaa183857c275595853/gay-lussac/data/run-store.js
[D-magnet]: https://github.com/Cho-WH/MicrobitSensorDashboard/blob/303a0bb957472d3a762ab05c6a2a043bedd29e8d/firmware/examples/magnetometer.js
[D-config]: https://github.com/Cho-WH/MicrobitSensorDashboard/blob/303a0bb957472d3a762ab05c6a2a043bedd29e8d/js/config.js
[W-idb]: https://github.com/jakearchibald/idb#transaction-lifetime
[W-papa]: https://www.papaparse.com/docs
[W-chart]: https://www.chartjs.org/docs/latest/general/performance.html
[W-lifecycle]: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
[W-test]: https://nodejs.org/api/test.html

공식 USB API의 기능과 범위는 [Micro:bit Foundation 문서](https://microbit-foundation.github.io/microbit-connection/)를 참고하되, 실제 호출은 이식한 고정 버전의 API와 테스트를 기준으로 한다.
