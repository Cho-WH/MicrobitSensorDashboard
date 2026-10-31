# M5 배포와 검증 기록

## 2026-10-31 구심가속도 활동·둘러보기 릴리스 검증

- 구현 기준: main `3e13aa6`. 구심가속도 탐구·2쪽 보고서·공통 수식과 그래프 UI·센서 및 활동 둘러보기를 포함한다.
- 타입 검사·전체 단위 318개·빌드 통과. 일반 브라우저 111개는 둘러보기 진입에 맞춘 테스트 보완 및 검사 로그 충돌 항목 재실행을 포함해 통과했다. 대용량 기록·가져오기 2개, Cloudflare 경로 검사 3개, 하위 경로 배포본 검사 2개도 통과했다.
- USB/Bluetooth 실기기 수신과 구심가속도 센서 프로그램의 실물 검증은 포함하지 않는다. 운영 배포는 해당 main 산출물로 진행하며 Worker의 버전 메시지에 소스 커밋을 남긴다.

## 배포 기준

- 운영 앱은 `main`에 반영된 코드의 `dist/`만 `sensor-lab` Worker에 배포한다. 작업 브랜치를 운영에 직접 배포하지 않는다.
- 공식 주소는 `https://lab.sco.pe.kr/`다. 포털의 `scope-portal` Worker와 분리하고 별도 `workers.dev`·미리보기 주소는 제공하지 않는다.
- 사용자 확인상 센서 실험실은 기존 공개 배포가 없으므로 이전 안내·별도 구버전 빌드는 만들지 않는다. M7의 경계는 [설계 §12.4](unified-sensor-lab-architecture.md#124-도메인-연결과-배포-전환)를 따른다.

## 실행 방법

Node 24.18과 잠금 파일의 Wrangler 4.155.0을 사용한다.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run test:e2e:cloudflare
npm run test:e2e:build
npx wrangler deploy --dry-run
```

`build`는 `dist/`를 만든다. 공유 링크·QR은 공식 주소를 사용하고, 화면 이동·파일·기기 준비 자원은 설치 위치를 기준으로 읽는다.

Cloudflare의 수동 배포 명령은 `npx wrangler deploy`이며 유효한 로컬 인증이 필요하다. 플러그인으로 배포할 때에도 같은 검증된 `main` 산출물과 Wrangler의 경로·공개 주소 설정을 적용한다. `scope-portal`이나 다른 Worker를 덮어쓰지 않는다.

`.github/workflows/cloudflare.yml`은 `main`에서만 수동 실행할 수 있게 준비했다. **자동 배포 연결은 보류** 상태다. 추후 대상 계정·zone에 한정된 CI 토큰을 저장소 secret `CLOUDFLARE_API_TOKEN`으로 등록하고 첫 배포를 확인한 뒤 `push: branches: [main]`을 활성화한다. 계정 ID는 공개 가능한 배포 식별자로 Wrangler에 기록하며 토큰 값은 코드·문서에 남기지 않는다. ‘계정 API 토큰 쓰기’는 앱 배포에 필요하지 않다.

후속 작업 브랜치는 main에 병합한 뒤 새 main 버전을 빌드·배포한다. 최초 배포 SHA나 센서 목록에 고정하지 않는다. 진입 페이지는 레지스트리에서 자동 생성하고 Cloudflare 검사는 등록된 모든 경로를 순회한다. 병합 때 `wrangler.jsonc`, 공개 주소 설정, `/lab` 별칭과 Pages 자동 배포 해제 상태를 유지한다.

## 기존 배포 경로와 복구

GitHub Pages의 main 푸시 자동 배포를 해제했다. 기존 워크플로는 main에서 수동 실행하는 경우에만 동작하며 이번 작업에서 별도 Pages 버전을 배포하지 않는다.

새 주소에 문제가 생기면 같은 `lab.sco.pe.kr`에서 호환되는 이전 Worker 버전으로 복구한다. 포털 링크만 옛 주소로 되돌리면 새 주소에 저장한 실험이 따라오지 않는다.

## 2026-10-30 초기 배포 확인

- 기준: `origin/main`의 `a91fa75`에서 M5 변경만 추가. 미병합 한 점 기록·DS18B20·MLX90393 기능은 배포 범위에 포함하지 않는다.
- 로컬 확인: 경로·공유 단위 검사 6개, Cloudflare 라우팅·공유·JSON 이전 브라우저 검사 3개, 하위 경로 빌드 브라우저 검사 2개 통과. Wrangler 배포 dry run 통과.
- 커밋 전 타입 검사·전체 단위 검사 238개·빌드를 통과했다. 일반 브라우저 검사 58개 중 57개는 최초 통과했다. 종료 검사 1건은 첫 표본 수신 전 종료할 수 있던 테스트 선행 조건을 보완했고, 해당 파일의 두 검사를 3회 반복해 모두 통과했다. 동일한 보완이 센서 작업 브랜치에도 있어 그 수정과 형태를 맞췄다. 저장 자료·분석 보존 assertion은 유지했다.
- 다른 origin으로 JSON을 가져온 뒤 원자료·사건·분석 설정과 기존 저장 자료 보존을 확인했다. 한 점 기록은 현재 main의 미구현 기능이므로 이 검증에 포함하지 않았다.
- 후속 병합 확인: `codex/m8-2-point-recording`의 `e412949`와 M5를 합친 임시 복사본에서도 빌드와 Cloudflare 검사 3개를 통과했다. DS18B20 등 추가된 등록 경로와 자료별 분석 형식의 JSON 복원을 확인했다. 앱·배포 설정은 자동 병합되고, `UNIFIED-PLAN-INDEX.md`의 인접한 M5·M6 상태 행만 문서 충돌이 있었다. 병합 시 M5는 main의 배포 상태, M6·M8은 작업 브랜치의 구현 상태를 유지한다. 원래 작업 브랜치와 미커밋 변경은 수정하지 않았다.
- 운영 배포 완료: 앱 main [`051faec`](https://github.com/Cho-WH/MicrobitSensorDashboard/commit/051faec7566b296dff591a7a3faeb0fe9c7ad736)의 산출물을 Cloudflare 플러그인 인증으로 업로드했다. Worker 버전은 `cf0534df-5f0c-416c-b112-507c1a85bd83`, 배포 ID는 `0be22c55-6a28-4d5a-809a-e8c9c5c92faa`다. 계정 API 토큰을 발급하지 않고 자산 업로드 세션·Worker 업로드·Custom Domain 설정 쓰기를 실제 확인했다.
- [lab.sco.pe.kr](https://lab.sco.pe.kr/)의 HTTPS 200, 등록된 진입 경로 6개, `/lab.html` 정규화와 검색 매개변수, QR·펌웨어·JSON 파일 열기, 데스크톱·작은 화면을 확인했다. 공용 DNS 두 곳과 일반 로컬 DNS에서 새 주소가 확인된다. `workers.dev`·미리보기는 비활성이고 포털 루트는 기존 `scope-portal`에 연결돼 있다.
- 포털 main [`e8a68a4`](https://github.com/Cho-WH/scope-portal/commit/e8a68a4d85d5d953ce37fed45120566c87143a4b)의 이름·기능·지원 환경·대표 이미지·실행 주소를 반영했다. 기존 포털 빌드 `2670bc2b-6f7e-47d9-864e-01134da88080` 성공 후 [소개 페이지](https://sco.pe.kr/tools/sensor/)에서 새 앱을 여는 실제 조작과 배포 이미지 일치를 확인했다. 로컬 콘텐츠·Astro 검사·빌드와 관련 브라우저 검사 3개도 통과했다.
- 미확인: 새 origin에서 사용자의 USB/Bluetooth 장치 선택·권한 승인 및 실물 수신. 자동 검사는 실기기 인수를 대체하지 않는다.

일회성 화면 확인과 원본 검사 로그는 Git에서 제외된 `.local/logs/m5/`에만 보관한다.

## 2026-10-30 센서 작업 병합·운영 반영

- 최신 `origin/main`의 `f51bad7`을 센서 작업 브랜치에 충돌 없이 병합했다. 문서의 오래된 M5/M6 상태를 정리하고, DS18B20·MLX90393 카드에 센서 정의 기반 `beta` 표시와 공통 버블 도움말을 추가했다.
- 배포 소스는 main의 `8eff16168bb894dcff0e939aaf3e433e4c564356`이다. 한 점 기록·실험 메모·분석 개선, DS18B20·MLX90393 도구와 펌웨어를 포함한다. 로컬 main과 원격 main에 반영한 동일 빌드를 Cloudflare 플러그인 인증으로 배포했다.
- 병합본 검증: 타입 검사·단위 284개·빌드·일반 브라우저 93개·대용량 기록 및 가져오기 2개·Cloudflare 배포 경로 3개·하위 경로 배포본 2개·Wrangler dry run 통과. 대용량 검사는 36,000행·600점 및 DB 변환·JSON/CSV 왕복을 포함한다.
- 운영 Worker 버전은 `3cd0171e-5a00-40b3-ade1-5309947eaa5f`, 배포 ID는 `0b7ffc89-e14f-49a6-b99f-706d1757562b`이며 100% 반영됐다. `workers.dev`·미리보기와 GitHub Pages 자동 배포는 비활성, Cloudflare 자동 배포 연결은 보류 상태를 유지한다.
- 공식 주소에서 등록 경로 8개, 1440px/320px beta 도움말, `/lab.html` 별칭·검색 매개변수를 확인했다. 홈 HTML·센서 목록·두 새 센서 HEX의 바이트가 로컬 배포본과 일치하며 브라우저 실행 오류는 없었다. 원본 결과·화면은 비추적 `.local/logs/release/`에 보관한다.
- 새 주소에서 USB/Bluetooth 실기기 권한·수신, DS18B20·MLX90393 실물 안정성은 여전히 미확인이다. 위 소프트웨어 검증으로 실기기 인수를 대체하지 않는다. 이 절을 추가한 후속 문서 커밋은 배포 이력만 기록하며 운영 앱의 소스 기준은 위 SHA다.
