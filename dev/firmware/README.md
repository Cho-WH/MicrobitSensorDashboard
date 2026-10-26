# 센서 펌웨어 빌드

`targets.json`에서 센서별 **원본 소스·ID·버전·프로토콜**을 지정하고 공통 빌드로 HEX를 만든다.
앱의 센서 등록과 설치 허용 목록은 별도다. 빌드 성공만으로 학생용 센서가 추가되거나
`public/firmware/`의 배포 파일이 교체되지는 않는다.

## 실행

저장소의 Node 버전을 사용한다. 최초 한 번 이 폴더에서 개발 의존성을 설치한다.

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

저장소 루트에서:

```sh
npm run build:firmware -- --list
npm run build:firmware -- magnetometer
npm run build:firmware -- temperature
npm run build:firmware -- light-level
npm run build:firmware -- accelerometer
npm run build:firmware -- bmp280
npm run build:firmware -- analog-raw
npm run build:firmware -- temperature-light
npm run build:firmware -- --all
npm run check:firmware
```

이 폴더에서는 `npm run build -- <이름>`도 가능하다. 이름을 생략하면 기존처럼
자기장을 빌드한다. `--check`는 지정 대상의 재빌드 결과·다운로드 소스·프로토콜이
설치 허용 목록 및 배포 파일과 정확히 일치하는지 검사한다. 자기장·온도·밝기·가속도에
`--check`를 사용할 수 있다. 빌드 전용인 `bmp280` v2·`analog-raw`·`temperature-light`는 미등록 버전/프로그램 오류로 컴파일 전에 중단한다.
`npm run check:firmware`는 기존처럼 자기장을 검사한다.

| 빌드 이름 | 원본 | 시작 명령 | CSV 순서 | 명목 간격 | 앱 등록 |
|---|---|---|---|---|---|
| `magnetometer` | `firmware/examples/magnetometer.js` | `prepare` | X, Y, Z, 크기 | 100 ms | 자기장 v2 |
| `temperature` | `firmware/examples/temperature.js` | `start` | 보드 온도 (°C) | 1000 ms | 내장 온도 |
| `light-level` | `firmware/examples/light-level.js` | `start` | 밝기 (0–255 상대값) | 100 ms | 내장 밝기(조도) |
| `accelerometer` | `firmware/examples/accelerometer.js` | `start` | X, Y, Z, 크기 (mg) | 100 ms | 내장 가속도 |
| `bmp280` | `firmware/examples/bmp280.js` + `firmware/drivers/bmp280.ts` | `bme` | 온도 °C, 빈 습도 자리, 압력 hPa | 100 ms | 수정 v2 후보만. 앱은 원본 v1 유지 |
| `analog-raw` | `firmware/examples/analog-raw.js` | `start` | P0, P1, P2 원시 ADC 값 (0–1023) | 100 ms | 기반 검증용. 앱 미등록 |
| `temperature-light` | `firmware/examples/temperature-light.js` | `start` | 온도, 밝기 | 1000 ms | 빌드 예제만 |

자기장 v2는 이 저장소의 소스를 수정해 앱에서 보정 여부를 선택하도록 한다. 예전 대시보드의 `firmware/legacy/magnetometer.hex`는
시작 명령이 다르므로 이 빌드의 입력으로 사용하지 않는다. BMP280는 게이뤼삭의 고정 HEX를
그대로 유지한다. HEX의 내장 소스·설정을 조사한 뒤 Bosch 보정식과 일괄 읽기를 사용하는 v2 후보를 별도 빌드 대상으로 추가했다. v1과 같은 바이너리를 재현한 것이 아니며 배포 파일·기존 저장 자료는 변경하지 않았다.

BMP280 후보는 0x76/0x77의 장치 ID와 보정 계수를 확인한 뒤 온도·압력 6바이트를 한 번에 읽는다.
Bosch DS001-26 §8.1의 부동소수점 보정으로 °C·Pa를 계산하고 전송할 때만 hPa로 바꾼다.
습도는 측정하지 않는다. 장치 없음·잘못된 계수·건너뛴 측정은 `,,`로 보내며 이전 값을 재사용하지 않는다.
후보의 부분 무선 설치·수신 사례는 확인했지만 기준 계측 비교와 연결 안정화는 미완료다. 아날로그 예제는 P0/P1/P2를 순서대로 읽으며 동시 샘플이나 물리량 환산을 제공하지 않는다.

## 자기장 v2 규약

개행으로 끝나는 `prepare`에 `@mag,2,choice`로 응답하고 선택을 기다린다.
앱의 `calibrate`에는 `@mag,2,calibrating`을 보낸 뒤 MakeCode 보정을 실행한다.
루틴이 반환되면 `@mag,2,calibrated`를 보내고 숫자 송신을 시작한다.
`skip`에는 `@mag,2,skipped`로 응답하고 보정 루틴 없이 송신한다.
보정 진행 중에는 다른 선택 명령을 무시하고 수치를 읽거나 보내지 않는다.
`stop`은 송신과 현재 요청을 무효화한다. 연결 해제는 보드를 재시작하며,
새 연결은 다시 선택을 기다린다. A/B 버튼을 생략 명령으로 사용하지 않는다.
미배포 v1 펌웨어 호환은 제공하지 않는다. 앱에서 v2를 다시 설치해야 한다.

## 입력과 결과

- `targets.json`: 대상별 소스 경로, 선택적인 `additionalSources`의 로컬 TS 파일명→소스 경로, 산출물 ID·버전, 프로젝트 이름·설명, 통신 규약.
  `protocol`은 소스 동작을 기록하는 선언이며, 이 값을 바꿔도 소스가 자동 수정되지는 않는다.
- `pxt-template.json`: 공유하는 core + Bluetooth UART. 현재는 open-link와 `pairing_mode: 0`인 기존 연결 설정.
  toolchain 버전은 `targets.json`에서 가져와 프로젝트에 넣는다.
- `built/projects/<이름>/`: 생성된 `pxt.json`, LF로 정규화한 `main.ts`, MakeCode 작업 파일.
- `built/artifacts/<이름>/`: 검증을 통과한 `<id>-v<버전>.hex`, `.ts`, `.build.json` 후보.
  `built/`는 Git에서 제외한다. 실패한 컴파일이나 검증 결과로 마지막 검증 후보를 바꾸지 않는다.

빌드는 고정된 도구 버전과 네이티브 이미지 해시를 확인하고, 새 HEX를 컴파일한 뒤 공식
micro:bit V2 해석기로 읽는다. HEX에 내장된 `main.ts`와 프로젝트 설정도 입력과 비교한다.
검증이 끝나면 해시·소스·설정·도구·네이티브 이미지·통신 규약을 빌드 기록에 남긴다.
과거 작업 폴더의 `binary.hex`를 새 빌드 성공으로 오인하지 않도록 컴파일 전에 제거한다.

## 다른 내장 센서 추가

1. `firmware/examples/<이름>.js` 또는 `.ts`에 BLE UART 프로그램을 작성한다.
2. `targets.json`의 `targets`에 항목을 하나 추가한다. 고유한 키·ID·프로젝트 이름과
   소스 경로, 버전, 실제 시작 명령·CSV codec ID·명목 간격을 지정한다.
3. `npm run build:firmware -- <이름>`을 실행한다. 공통 스크립트나 PXT 설정을 복제할 필요가 없다.
4. 소스의 시작·중단·열 순서·단위·간격을 검사하고, HEX를 실제 장치에 설치해 수신을 확인한다.
5. 앱에 도입할 때 검증한 HEX·TS·빌드 기록을 `public/firmware/`로 옮기고 출처·라이선스를
   보존한다. `src/device/firmware.js`에 ID·버전·해시·규약을 명시적으로 등록한 뒤,
   [센서 모듈 등록 절차](../../src/catalog/README.md)를 따른다. 빌드가 이 단계를 자동 수행하지 않는다.

같은 ID·버전의 배포 파일이 바뀌면 `--check`는 실패한다. 기존 해시를 자동으로 갱신하지 말고
변경 사유와 기존 자료 호환성을 확인한 후 새 버전으로 등록한다. 현재 앱의 펌웨어 허용 목록은
ID별 단일 설치 버전을 제공하므로 여러 버전을 동시에 설치 지원할 때는 그 계약도 별도 확장한다.

## 고정 도구와 네이티브 런타임

공식 [MakeCode CLI](https://makecode.com/cli)와
[micro:bit target](https://github.com/microsoft/pxt-microbit/tree/v9.1.1)을 사용한다.
lockfile은 `pxt@0.5.1`, `pxt-microbit@9.1.1`, `pxt-core@13.0.1` 및 하위 의존성을 고정한다.
최초 npm 설치는 네트워크가 필요하며, 앱은 이 개발 의존성을 로드하지 않는다.

`runtime-cache/`는 이 core + Bluetooth 설정을 공식 MakeCode 클라우드 컴파일러에서 만든
V1·V2 네이티브 이미지다. C++ 런타임을 소스부터 다시 빌드한다는 뜻은 아니다.
`offline.cjs`는 고정된 PXT 버전의 네이티브 이미지 요청을 이 캐시로 연결한다. CLI의
`--force`는 변경 가능한 `node_modules` 캐시를 건너뛰게 하며, 어댑터는 요청된 compile key와
원본 바이트 해시를 검사한다. 등록되지 않은 키는 클라우드 요청 없이 실패한다.

현재 프로필은 core + bluetooth, main.ts와 명시적으로 등록한 로컬 JS/TS 추가 소스를 지원한다.
추가 소스는 TS 파일로 빌드하며 내장 내용·파일 해시를 검사하고 다운로드용 `.ts`에는 실행 순서대로 합친다. 추가 네이티브 라이브러리나
Bluetooth 설정 변경이 필요하면 공통 프로필·캐시 키·해시·라이선스·빌드 검사를 함께 검토한다.
소리 등 새로운 API가 이 런타임에서 제공되는지는 해당 소스로 실제 빌드해 확인해야 한다.

**M6의 확정 방향:** open-link를 유지한 공통 런타임으로 모든 센서 프로그램을 빌드하고,
그 안에서는 센서 실행 코드를 Bluetooth로 부분 교체한다. 최초 준비·런타임 변경·비호환은
USB로 처리하며 본딩/전체 DFU는 제품 범위에서 제외한다. 공통 입출력은 런타임에,
기존 API를 쓰는 TypeScript 센서 드라이버는 교체 영역에 둔다. 로컬 다중 소스와 현재 시험 프로필의
런타임/영역 비교는 구현했다. 외부 확장 패키지·추가 네이티브 프로필의 일반화는 미구현이다. BMP280 입력 조사와
`cppDependencies` 활용 조건 등은 [설치 개선 설계 §9](../../docs/sensor-program-installation-roadmap.md#9-공통-런타임-구축과-확장-설계)에 둔다.

**M6 온도 시험본 B:** `pairing_mode: 0`은 과거 GATT 연결 문제를 피하려던 설정이다.
표준 설치 모드 진입 활성화와 평상시 연결 보안은 구분한다. `pairing-trial.mjs`는 기존 온도 계획을 재사용하고
`pairing_mode: 1`만 변경한다. 원본 소스·도구·다른 보안 설정과 배포 파일은 유지한다.

```sh
node dev/firmware/build-pairing-trial.mjs
node dev/firmware/build-pairing-trial.mjs light-level
node dev/firmware/build-pairing-trial.mjs --all
node dev/firmware/check-common-runtime.mjs
node dev/firmware/export-partial-trials.mjs
# 새 런타임을 공식 컴파일러에서 확보할 때만 명시적으로 사용:
node dev/firmware/build-pairing-trial.mjs --fetch-runtime
```

`runtime-cache-pairing/`에 공식 컴파일 결과의 키·해시·수집 시각을 별도로 고정했다. `trial-runtime.cjs`는
기본 실행에서 이 캐시만 읽고 미등록 키·손상을 거부한다. `--fetch-runtime`도 동일 키의 변경된 이미지를 덮어쓰지 않는다.
새 캐시를 받을 때는 공식 요청 경로로 확보 후 해시 검증을 거쳐 오프라인으로 다시 빌드한다.
고정 도구·런타임의 라이선스는 기존 [펌웨어 고지](../../public/firmware/NOTICES.md)를 따른다.

결과는 `built/artifacts/<대상>-pairing-trial/<대상>-pairing-trial-v1.{hex,ts,build.json}`이다. 이 파일명의 v1은 시험 산출물 이름이며 실제 펌웨어 버전은 빌드 기록을 따른다. 현재 7개 대상이 빌드된다. `check-common-runtime.mjs`는 현재 입력·HEX 해시와 V2 런타임 바이트를 대조해 `built/artifacts/common-runtime-report.json`을 생성한다. 새 후보를 개발 페이지의 전송 허용 목록에 자동 추가하지 않는다.
`export-partial-trials.mjs`는 명시적으로 등록한 7개 HEX의 런타임 일치를 바이트 비교하고 `dev/bluetooth-install/firmware/`에 부분 전송 BIN·해시 목록을 생성한다. 종료한 전체 DFU 조사용 온도/밝기 전체 애플리케이션 BIN·56바이트 init도 기존대로 보존한다. 전체는 `0x1c000`부터 `0x77000` 미만의 실행 이미지만 추출하며 SoftDevice·부트로더를 제외한다. init SHA-256은 생략하지 않는다. 기존 `dev/usb-library`의 고정 의존성을 재사용한다. 전체 DFU 첫 실물 시험은 진입 알림 구독 중 단절돼 이미지 전송 전 실패했다. 상세 기록은 설치 개선 설계 §8.4를 따른다.
2026-10-26 생성 온도 HEX SHA-256은 `cc80091a1d612acf540150c45a19eaf43663fab18f167c348fd64b7fdd7be09c`,
V2 런타임 식별값은 `5f21a4c8e2b240e5`, 프로그램 시작 주소는 `0x49000`이다.
기존 소스 일치·설정 단일 변경·공식 V2 해석·내장 소스/설정 일치·고정 캐시 재빌드를 확인했다.
공통 후보 7개의 런타임 식별값·시작 주소·네이티브 바이트 일치를 확인했다. 실물에서는 내장 4종·BMP280·센서 미연결 아날로그 원시 입력의 교체·수신 사례를 확인했지만, 재시작 뒤 재연결은 제한된 재시도에도 실패했다. 결합 예제 실물·측정 정확도·중단 복구·제품 통합은 미완료다. 상세 성공·실패 범위는 [현재 검증 결과](../../docs/sensor-program-installation-roadmap.md#84-현재-검증-결과와-남은-작업)에서 관리한다.

V1·V2를 포함하는 Universal HEX를 생성하지만 앱의 설치 허용 보드는 V2다. CODAL V2
`v0.3.5`, classic runtime `v2.2.0-rc6`의 출처·고지는
[펌웨어 고지](../../public/firmware/NOTICES.md)에 있다.

## 이번 검증 결과와 한계

2026-10-20 자기장 v2는 보정 선택·진행·완료 상태를 추가했다. 재빌드와 배포 파일 일치 검사를 통과한 SHA-256:

```text
d683634aa1b7ecaa18ab1578f5e20bd3ddf637eb1ba0c4c546b51e8a13c76b56
```

당시 다섯 빌드 대상 모두 실제 컴파일과 V2 해석·내장 소스·설정 검사를 통과했다. 현재 확장 후보의 결과는 위 M6 기록을 따른다.
온도·밝기·가속도는 연결이 끊기면 송신을 중단하고, 재연결 뒤 새 `start`를 기다린다.
밝기의 첫 API 호출은 준비용으로 버리며 이후 실제 0은 그대로 송신한다. 준비 중 중단·재연결도
이전 시작 요청을 되살리지 않는다. 가속도는 ±8g 설정이며 중력을 포함한 mg 원값을 보낸다.
정식 Node 검사는 대상 선택, 입력 충돌, 캐시 손상, 실패 후 후보 보존, 다섯 배포 HEX의
해시·설치 가드, 시작·중단·재연결·CSV 순서·명목 간격 및 밝기 준비 경합을 확인한다.
해시는 설치기와 동일하게 UTF-8의 CRLF만 LF로 바꾼 뒤 계산하며 공백이나 BOM을 제거하지 않는다.

실제 보드 설치·무선 성능·센서 정확도·나침반 보정 정확도는 이번에 검증하지 않았다.
기존 허용 목록과 새 빌드 기록 모두 `hardwareVerified: false`를 유지한다.
