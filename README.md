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

기본 주소에서 새 센서 실험실이 열립니다. `lab.html`도 같은 앱이며 센서·활동 주소로 직접 들어갈 수 있습니다.
현재 소스는 Luminous 디자인을 기본 사용합니다. 준비는 B안의 어두운 장면, 측정·분석은 밝은 자료 표면을 사용하며 별도 테마 선택은 필요하지 않습니다. [디자인 적용·검토 기록](docs/design/README.md)에서 범위를 확인할 수 있습니다.
이전 대시보드의 설정·QR 공유 UI는 제공하지 않습니다. 새 앱의 수업 설정 링크·QR은 M3 범위로 아직 구현하지 않았습니다.

## 로컬 개발과 배포

Node.js 24.18 이상, 25 미만을 사용합니다.

```sh
npm ci
npm run dev
```

`npm run dev`의 기본 주소는 `http://localhost:8080/`입니다.
작업 중에는 변경의 영향을 받는 검사만 실행합니다. 예를 들어 경로 처리를 수정하면
`node --test tests/unit/routes.test.mjs`, 탐색 흐름을 수정하면
`/tests/browser/?suite=navigation`에서 해당 검사를 실행합니다.
타입 검사는 타입·의존성 변경 시, 빌드는 빌드 산출물에 영향이 있을 때 실행합니다.

커밋 직전에만 `npm run typecheck`, `npm test`, `npm run build`와
`/tests/browser/`의 전체 브라우저 검사를 실행합니다.
정적 빌드 결과는 `dist/`에 생성됩니다. 자세한 검사 원칙은 [AGENTS.md](AGENTS.md)를 따릅니다.

GitHub Pages는 `.github/workflows/pages.yml`로 `main`의 타입 검사·단위 검사·빌드가 성공한 뒤
`dist/`를 배포합니다. 저장소 Settings → Pages의 Source는 **GitHub Actions**를 사용합니다.
루트 홈, 다섯 센서, 게이뤼삭 활동의 진입 페이지를 함께 생성하므로 직접 진입과 새로고침을 지원합니다.
기존 대시보드의 `js/`·`styles.css`는 배포하지 않습니다.

## 구조와 개발 문서

- [기획](docs/unified-sensor-lab-plan.md) · [기술 설계](docs/unified-sensor-lab-architecture.md)
- [M2 구현·검증 범위](docs/m2-implementation.md) · [실기기 확인 기록](docs/hardware-acceptance-2026-10-19.md)
- [센서·활동 모듈 등록](src/catalog/README.md)
- [공통 장치 3D 자산](public/assets/devices/README.md) · [장치 자산 확인 페이지](public/viewers/devices/index.html)
- [펌웨어 빌드·프로토콜](dev/firmware/README.md)
- [저장·파일 계약](docs/m1-implementation.md)

## 라이선스와 출처

저장소의 [LICENSE](LICENSE)와 [외부 자원 고지](THIRD_PARTY_NOTICES.md)를 참고하세요.
재사용한 라이브러리·그림·펌웨어 런타임에는 각각의 원본 라이선스와 고지가 적용됩니다.
