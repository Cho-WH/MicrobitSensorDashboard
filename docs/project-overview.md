# Project Overview

이 문서는 포크 개발자와 AI 에이전트가 프로젝트 구조를 빠르게 파악하기 위한 기술 개요다. 일반 사용자는 먼저 `README.md`의 빠른 시작을 보면 된다.

## 전체 흐름

```text
micro:bit firmware
  -> Nordic UART BLE
  -> js/bluetooth.js
  -> js/utils/parseSample.js
  -> js/state.js
  -> UI modules and CSV download
```

micro:bit는 한 줄 CSV 데이터를 보내고, 웹앱은 기본 설정 또는 압축 URL 공유 설정의 필드 순서에 맞춰 값을 해석한다. 이후 상태 저장소에 샘플을 쌓고, 카드·차트·로그·CSV 다운로드가 같은 데이터를 사용한다.

## 설정 계층

- 주요 파일: `js/sensor-config.js`, `js/config.js`, `js/ui/experiment-settings.js`, `vendor/qrcodegen.js`, `vendor/simple-qrcode.js`
- 역할: 기본 설정, deflate-raw 압축 `cfg` 인코딩/디코딩, 앱 제목, 시작 명령, CSV 파일명, 필드 목록, 단위, 색상, 공유 링크와 QR 표시
- 일반 사용자는 웹앱의 **실험 설정** UI에서 바꾸고, 포크 개발자는 기본값을 코드로 바꿀 수 있다.

필드 순서는 펌웨어의 CSV 전송 순서와 같아야 한다. 단순 센서 교체라면 대부분 펌웨어의 `sendSample()`과 웹앱의 실험 설정만 맞추면 된다.

## 통신 계층

- 주요 파일: `js/bluetooth.js`, `js/ui/connection-panel.js`
- 역할: Web Bluetooth 연결, Nordic UART characteristic 선택, 알림 수신, 시작 명령 전송, 연결 상태 안내
- 보통은 그대로 사용하고, 장치 선택 방식이나 연결 UX를 바꿀 때 수정한다.

다른 BLE 서비스나 여러 장치 연결을 지원하려면 이 계층을 중심으로 확장하게 된다.

## 데이터와 상태 계층

- 주요 파일: `js/utils/parseSample.js`, `js/state.js`, `js/utils/csv.js`
- 역할: CSV 라인 파싱, 샘플 히스토리 관리, 선택 필드 관리, CSV 생성
- 프로토콜을 바꾸거나 저장 형식을 바꿀 때 살펴볼 영역이다.

현재 구조는 한 줄에 한 샘플, 모든 값은 숫자라는 가정을 둔다. 이 가정을 바꾸려면 `docs/protocol.md`도 함께 업데이트하는 것이 좋다.

## UI 계층

- 주요 파일: `index.html`, `styles.css`, `js/ui/*`
- 역할: 연결 패널, 필드 선택, 최신 값 카드, 차트, 로그 테이블, 사용 안내
- 포크 프로젝트의 성격을 가장 잘 드러내는 영역이다.

실험 설정만 바꿔도 기본 UI는 자동으로 변한다. 프로젝트 주제에 맞춘 설명, 색상, 레이아웃, 추가 경고나 계산이 필요하면 이 계층을 수정한다.

## 펌웨어와 문서

- 주요 파일: `firmware/template.js`, `firmware/examples/*`, `docs/*`
- 역할: MakeCode 예제 제공, 데이터 전송 규칙 설명, 포크 개발 흐름 안내

포크한 프로젝트에서는 README와 사용 안내 모달도 실제 센서와 수업 흐름에 맞게 바꾸는 것이 좋다.

## 개발 문서 지도

- `docs/forking-guide.md`: 포크 후 자기 프로젝트로 발전시키는 흐름
- `docs/protocol.md`: micro:bit와 웹앱 사이의 데이터 규칙
- `docs/firmware-guide.md`: MakeCode 펌웨어 작성과 실전 판단
- `firmware/examples/README.md`: 예제별 시작 명령과 전송 순서

이 프로젝트는 작은 정적 앱으로 유지하는 것을 기본값으로 삼는다. 다만 포크한 프로젝트의 목적이 분명하다면 UI, 프로토콜, 배포 방식은 자유롭게 바꿔도 된다.
