# 센서 실험실 · Microbit Sensor Lab

micro:bit 센서를 선택하고 장비 준비·측정·저장·분석까지 이어서 사용하는 교육용 웹앱입니다.

**[센서 실험실 열기](https://cho-wh.github.io/MicrobitSensorDashboard/)** · [모의 장치로 살펴보기](https://cho-wh.github.io/MicrobitSensorDashboard/?mock=1)

## 사용하기

1. 내장 자기장·온도·밝기(조도)·가속도 또는 외장 BMP280 센서를 선택합니다. 게이뤼삭 활동도 선택할 수 있습니다.
2. 장비 준비 안내에 따라 micro:bit V2에 해당 센서의 프로그램을 USB로 설치합니다.
3. Bluetooth로 연결합니다. 자기장은 앱에서 보정 시작 또는 이번 보정 생략을 선택합니다.
4. 새 값이 연속으로 들어오는 것을 확인한 뒤 측정 화면에서 기록을 시작합니다.
5. 기록을 마치고 저장된 자료를 분석하거나 전체 실험 JSON·측정값 CSV로 내보냅니다.

프로그램 설치와 무선 연결은 해당 Web USB·Web Bluetooth 기능을 지원하는 브라우저에서 사용하세요.
HTTPS 또는 localhost가 필요합니다. 모의 장치는 실제 센서 측정이 아닙니다.
실험 자료는 사용하는 브라우저에 보관되므로 다른 기기로 옮길 때는 전체 실험 JSON을 사용합니다.

저장된 실험에서 이름을 바꾸거나 삭제할 수 있고, 조작 기록의 메모는 측정을 마친 뒤에도 수정할 수 있습니다.
게이뤼삭 활동은 일시정지 중 물 추가·장치 변화를 기록하고 추가 측정 시 조건 변화와 메모를 남깁니다.
분석 CSV를 저장할 때는 필요한 계산 열을 선택합니다.

원본 게이뤼삭 앱의 전체 실험 JSON v1/v2와 CSV를 가져올 수 있습니다. 호환되는 실제 장치 기록의 JSON은
측정 화면에서 연결·수신 확인을 한 뒤 기록 재개 또는 추가 측정으로 이어갑니다. 파일을 여는 것만으로 기록하지 않습니다.
CSV와 호환되지 않는 파일은 분석용으로 사용합니다. 현재 앱에서 보관한 JSON은 현재 앱에서 다시 엽니다.

기본 주소에서 새 센서 실험실이 열립니다. `lab.html`도 같은 앱이며 센서·활동 주소로 직접 들어갈 수 있습니다.
Luminous 디자인을 기본 사용하며 준비는 어두운 장면, 측정·분석은 밝은 자료 표면으로 구성합니다. [디자인 안내](docs/design/README.md)를 참고하세요.
도구 미리보기에서 소개 주소의 링크 복사·QR 표시·확대·PNG 저장을 제공합니다. 모바일에서는 제목 옆 ‘도구 공유’ 버튼으로 엽니다.
교사 JSON 자료 공유는 아직 미구현입니다. 현재 상태와 M5–M8 후속 작업은 [문서 안내](docs/UNIFIED-PLAN-INDEX.md)에서 확인할 수 있습니다.
이전 대시보드의 설정 편집·압축 cfg 공유·구형 설정 링크 복원은 구현 범위에 넣지 않습니다.

## 로컬 개발과 배포

Node.js 24.18 이상, 25 미만을 사용합니다.

```sh
npm ci
npm run dev
```

`npm run dev`의 기본 주소는 `http://localhost:8080/`입니다.
같은 네트워크의 다른 기기에서도 접속하려면 PowerShell에서 `$env:LAB_HOST='0.0.0.0'`을 설정하고 실행한 뒤 `http://<PC의 내부 IP>:8080/lab.html`을 엽니다.
내부 IP의 HTTP 접속은 화면 확인과 파일의 임시 분석에 사용할 수 있습니다. Bluetooth 측정·USB 설치는 HTTPS가 필요하며, Web Locks가 없는 환경에서는 영구 저장을 사용하지 않습니다.
작업 중에는 변경의 영향을 받는 검사만 실행합니다. 경로 수정은 `node --test tests/unit/routes.test.mjs`,
브라우저 탐색은 `/tests/browser/?suite=navigation`처럼 묶음을 선택합니다. 여러 묶음은 `?suite=app,records`로 지정합니다.
자동 브라우저 검사는 독립 Chromium에서 실행합니다.

```sh
npx playwright install chromium
npm run test:e2e -- --grep workspace
```

`npm run test:e2e`는 브라우저 검사 묶음과 실제 페이지·탭 종료 복원·3D 실패 복구 검사를 실행합니다.
검사마다 새 브라우저 환경과 별도 8081 서버를 사용하므로 열려 있는 앱의 실험 자료·장치 권한과 분리됩니다.
실패하면 `test-results/`에 화면·네트워크·콘솔 추적을 남깁니다. `npx playwright show-trace <trace.zip>`으로 확인합니다.
UI 검사는 실제 앱 구조·스타일을 사용하며 모의 장치 입력은 실물 검증과 구분합니다.

작업 중 타입 검사는 타입·의존성 변경 시, 빌드는 빌드 산출물에 영향이 있을 때 실행합니다.
커밋 직전에만 타입·전체 단위·빌드·전체 브라우저 검사를 함께 실행합니다:
`npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`.
정적 빌드 결과는 `dist/`에 생성됩니다. 자세한 검사 원칙은 [AGENTS.md](AGENTS.md)를 따릅니다.

GitHub Pages는 `.github/workflows/pages.yml`로 `main`의 타입 검사·단위 검사·빌드가 성공한 뒤
`dist/`를 배포합니다. 저장소 Settings → Pages의 Source는 **GitHub Actions**를 사용합니다.
루트 홈, 다섯 센서, 게이뤼삭 활동의 진입 페이지를 함께 생성하므로 직접 진입과 새로고침을 지원합니다.
기존 대시보드의 `js/`·`styles.css`는 배포하지 않습니다.

공유 링크의 기본 공개 주소는 `src/app/deployment.js`에서 관리합니다. 배포 시 `PUBLIC_BASE_URL` 환경 변수에 HTTPS 앱 루트를
지정하면 빌드가 공유 링크 설정과 OG·canonical 주소에 함께 반영합니다. 끝의 `/`를 정규화하고 검색 매개변수·인증 정보가 있는 주소는 거부합니다.
개발 서버 주소는 공유 링크에 자동으로 사용하지 않습니다. 공유 관련 검사는 `node --test tests/unit/tool-link.test.mjs tests/unit/routes.test.mjs`와
`npx playwright test tests/e2e/tool-share.spec.mjs`로 실행합니다.

향후 공식 주소는 **`https://lab.sco.pe.kr/`**로 확정했습니다. 포털 `sco.pe.kr`과 별도의 Cloudflare Worker로 앱을 운영하고,
후속 교사 자료 공유 API를 같은 앱 주소 아래에 추가할 계획입니다. 현재는 위 GitHub Pages 주소를 계속 사용합니다.
주소 이전 시 브라우저의 실험 자료·장치 권한은 자동 이전되지 않으므로 기존 주소의 JSON 내보내기 경로를 유지합니다.
[도메인 연결·배포 전환 계획](docs/unified-sensor-lab-architecture.md#124-도메인-연결과-배포-전환)에서 현재 구성과 예정 작업을 구분합니다.

## 구조와 개발 문서

- [문서 안내·진행 상태](docs/UNIFIED-PLAN-INDEX.md)
- [기획](docs/unified-sensor-lab-plan.md) · [기술 설계](docs/unified-sensor-lab-architecture.md)
- [센서·활동 모듈 등록](src/catalog/README.md)
- [공통 장치 3D 자산](public/assets/devices/README.md) · [장치 자산 확인 페이지](public/viewers/devices/index.html)
- [펌웨어 빌드·프로토콜](dev/firmware/README.md)
- [센서 프로그램 설치 개선 설계](docs/sensor-program-installation-roadmap.md) (M6 Bluetooth 부분 교체 · 개발 시험 중, 제품 미통합)
- [저장·파일 계약](docs/unified-sensor-lab-architecture.md#8-저장복원파일) · [구현·검증 이력](docs/history/README.md)

## 라이선스와 출처

저장소의 [LICENSE](LICENSE)와 [외부 자원 고지](THIRD_PARTY_NOTICES.md)를 참고하세요.
재사용한 라이브러리·그림·펌웨어 런타임에는 각각의 원본 라이선스와 고지가 적용됩니다.
