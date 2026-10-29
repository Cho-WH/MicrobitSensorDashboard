# M5 배포와 검증 기록

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

## 2026-10-30 확인 상태

- 기준: `origin/main`의 `a91fa75`에서 M5 변경만 추가. 미병합 한 점 기록·DS18B20·MLX90393 기능은 배포 범위에 포함하지 않는다.
- 로컬 확인: 경로·공유 단위 검사 6개, Cloudflare 라우팅·공유·JSON 이전 브라우저 검사 3개, 하위 경로 빌드 브라우저 검사 2개 통과. Wrangler 배포 dry run 통과.
- 커밋 전 타입 검사·전체 단위 검사 238개·빌드를 통과했다. 일반 브라우저 검사 58개 중 57개는 최초 통과했다. 종료 검사 1건은 첫 표본 수신 전 종료할 수 있던 테스트 선행 조건을 보완했고, 해당 파일의 두 검사를 3회 반복해 모두 통과했다. 동일한 보완이 센서 작업 브랜치에도 있어 그 수정과 형태를 맞췄다. 저장 자료·분석 보존 assertion은 유지했다.
- 다른 origin으로 JSON을 가져온 뒤 원자료·사건·분석 설정과 기존 저장 자료 보존을 확인했다. 한 점 기록은 현재 main의 미구현 기능이므로 이 검증에 포함하지 않았다.
- 후속 병합 확인: `codex/m8-2-point-recording`의 `e412949`와 M5를 합친 임시 복사본에서도 빌드와 Cloudflare 검사 3개를 통과했다. DS18B20 등 추가된 등록 경로와 자료별 분석 형식의 JSON 복원을 확인했다. 앱·배포 설정은 자동 병합되고, `UNIFIED-PLAN-INDEX.md`의 인접한 M5·M6 상태 행만 문서 충돌이 있었다. 병합 시 M5는 main의 배포 상태, M6·M8은 작업 브랜치의 구현 상태를 유지한다. 원래 작업 브랜치와 미커밋 변경은 수정하지 않았다.
- 운영 Worker·도메인, 포털 실행 링크: 아직 전환 전. 실제 반영 결과를 확인한 뒤 이 기록을 갱신한다.
- 미확인: 새 origin에서 사용자의 USB/Bluetooth 장치 선택·권한 승인 및 실물 수신. 자동 검사는 실기기 인수를 대체하지 않는다.

일회성 화면 확인과 원본 검사 로그는 Git에서 제외된 `.local/logs/m5/`에만 보관한다.
