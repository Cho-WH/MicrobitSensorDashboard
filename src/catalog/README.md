# 센서·활동 모듈 등록

`modules.js`가 앱의 등록 지점이다. 각 센서의 `index.js`는 `definition`, `decode`,
`mockLine`, `guide`를 묶고, 활동의 `index.js`는 `definition`, `guide`, `policy`를 묶는다.
홈 목록, 일반 진입 주소, 통신 decoder, 준비 안내, 활동 policy가 이 등록을 함께 사용한다.
등록 시 중복 ID/버전, 실행 코드 누락, 활동의 필수 채널, 준비 단계 ID 충돌을 검사한다.

## 내장 센서를 추가할 때

1. `sensors/<id>/`에 측정 채널·단위·표시·연결 정책을 담은 `definition.js`, 원문을
   해석하는 `codec.js`, 준비물과 안내를 담은 `guide.js`를 만든다. 긴 문구는 `content.js`에 둔다.
2. `index.js`에서 위 파일들을 묶고 `modules.js`의 센서 목록에 한 번 등록한다.
   `/sensors/<id>/` 주소와 홈 카드는 자동으로 생긴다. build와 개발 서버도 같은 주소 목록을 쓴다.
3. 실제 프로그램 소스·검증된 HEX·해시를 준비하고 `src/device/firmware.js`의 허용 목록에
   등록한다. 이것은 장치 설치의 별도 검증 경계다. 내장 센서는
   `dev/firmware/targets.json`에 소스·규약을 추가하고 공통 빌드로 검토용 HEX를 생성한다.
   [펌웨어 빌드 절차](../../dev/firmware/README.md)에 따라 검증한 뒤 앱에 등록한다.
4. 정상·잘못된 UART 입력, 단위·범위, 모의 수신, 준비 완료 근거를 검사하고 실물에서
   설치·연속 수신을 확인한다. mock 성공을 하드웨어 검증으로 표시하지 않는다.

`definition`과 실험 context는 JSON으로 저장할 수 있는 데이터다. 함수와 뷰어 URL은
실행 모듈에만 둔다. 일반 진입에는 센서·활동의 최신 등록 버전을 사용하고, 저장된
실험의 실행 코드·안내는 ID와 버전을 정확히 찾아 사용한다. 없는 버전을 최신으로
대체하지 않는다. 기존 자료의 분석·내보내기는 저장된 정의 사본으로 계속 가능하다.

## 준비 안내의 고정 슬롯

공통 순서는 준비물 → **sensor.beforeProgram** → USB·프로그램 → 연결 →
**sensor.afterConnect** → 새 값 수신 → **activity.afterReception**이다.

- 외부 배선은 `beforeProgram`, 자기장 보정은 `afterConnect`, 배터리·용기 배치는
  `afterReception`에 둔다. 일반 내장 센서는 추가 슬롯 없이 공통 순서를 사용한다.
- 단계에는 `id`, `kind`, `scope`, `required`, `group`, `groupLabel`, `title`,
  `description`을 지정한다. 버튼 문구는 `action`으로 정한다.
- 지원 종류는 사용자 확인 `manual`, 보정 `calibration`, 배터리 수신 `battery`다.
  보정·배터리는 기존 관측 처리와 연결되므로 각각 `calibration`, `battery` ID를 쓴다.
  공통 단계 ID(`equipment`, `usb`, `program`, `connection`, `reception`)와
  UI 예약 ID(`summary`, `quick`)를 새 단계에 사용하지 않는다.
- `quickConfirm: true`는 준비된 장치 요약에 넣을 **센서의 수동 확인**에만 지정한다.
  연결·수신·보정·배터리 확인을 이 요약으로 대신할 수 없다.
- BMP280의 3D URL·배선표 제목·단자 도움말은 해당 센서의 `guide.viewer`에 있다.
  뷰어 어댑터는 기존 게이뤼삭 메시지 규약을 사용한다. 임의의 3D 뷰어를 자동 지원하는
  플러그인 체계는 아니다. 내장 센서는 이 자원을 요청하지 않는다.

활동은 같은 방식으로 `activities/<id>/index.js`를 등록한다. 일반 활동 주소는
`definition.sensorIds[0]`을 기본 센서로 사용한다. 다른 센서를 기본으로 삼으려면
호환 센서 순서를 명시적으로 정한다. 활동의 질문·사건·계산 제안은 정의에, 실행 규칙은
policy에 둔다.

`tests/unit/registry.test.mjs`는 검사용 추가 내장 센서와 활동으로 이 확장 경로를
검사한다. 검사용 센서는 운영 목록이나 펌웨어 허용 목록에 등록하지 않는다.
전체 검사는 `npm run typecheck`, `npm test`, `npm run build`와 `/tests/browser/`에서 실행한다.

온도·밝기·가속도는 이 절차로 등록된 내장 센서 예시다. 공통 숫자 해석은
`sensors/shared/decimal-codec.js`를 사용하고, 단위·열 순서·범위·모의 값은 각 모듈에 둔다.
모의 장치의 송신 간격은 파일에 저장된 설정이 아닌 펌웨어 허용 목록의 명목 간격을 따른다.
