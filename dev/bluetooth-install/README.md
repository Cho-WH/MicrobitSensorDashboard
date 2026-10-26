# Bluetooth 설치 시험실

정식 앱 개발에 앞서 부분 교체 B·비본딩 전체 교체 C의 연결·전송·새 수신을 확인하는 개발 페이지다. 실행 코드는 배포 앱에 포함되지 않는다. **현재 개발 기준은 [설치·연결 설계](../../docs/sensor-program-installation-roadmap.md)**이며, 이 문서는 실행 방법과 도구 제한만 다룬다.

2026-10-27 기준 부분 B 16왕복·32회, 전체 C 2왕복·4회를 확인했다. 자동 복구 정책은 채택했고 정식 앱 통합·리셋 안내 UI는 미구현이다. [핵심 검증 결과](../../docs/sensor-program-installation-roadmap.md#84-현재-검증-결과와-남은-작업).

## 빠른 시험과 로컬 명령

```powershell
npm run dev
```

PC Chrome에서 아래 화면을 연다. B/C는 런타임이 다르므로 시험 종류를 바꿀 때 해당 HEX를 USB로 먼저 설치한다. 다른 탭의 측정/설치 작업과 경쟁하지 않도록 한 시험 화면만 연결한다.

| 시험 | 화면·초기 준비 | 대상 |
|---|---|---|
| 부분 B | [B 화면](http://localhost:8080/dev/bluetooth-install/) → 시험본 B 받기 → `MICROBIT` 드라이브에 복사 | 공통 런타임의 등록 후보 7개 |
| 전체 C | [C 화면](http://localhost:8080/dev/bluetooth-install/unbonded.html) → 온도 C HEX 받기 → USB 설치 | 비본딩 온도·밝기, 주변 시험 보드 한 대만 켜기 |

브라우저에서 보드를 선택하고 **이 컴퓨터의 로컬 명령…허용**을 켠다. C는 **시험 보드 한 대만 켬**도 확인한다. 장치 선택은 사용자 동작이며 CLI가 선택창을 자동 조작하지 않는다. 허용만으로 시험이 시작되지는 않는다.

```powershell
node dev/bluetooth-install/control.mjs status
node dev/bluetooth-install/control.mjs diagnose
node dev/bluetooth-install/control.mjs run quick
node dev/bluetooth-install/control.mjs log
node dev/bluetooth-install/control.mjs cancel
```

`run`은 B 화면용이다. C에서는 다음을 사용한다.

```powershell
node dev/bluetooth-install/control.mjs unbonded quick
node dev/bluetooth-install/control.mjs unbonded temperature
node dev/bluetooth-install/control.mjs unbonded light-level
node dev/bluetooth-install/control.mjs unbonded verify
```

명령은 하나씩 실행한다. 접수 후 `status`의 종료 상태를 확인하고 `log`를 저장한다. `verify`는 앞선 전송 결과의 보드·프로그램·새 수신 확인만 실행한다. 기본 서버는 localhost:8080이며 다른 포트는 `LAB_TRIAL_URL`로 지정한다. `passed`는 프로그램 식별·수신 계약 통과이며 센서의 물리 정확도 검증을 뜻하지 않는다.

| B 시험 이름 | 순서·조건 |
|---|---|
| `quick` | 밝기 → 온도 |
| `builtin` | 온도 → 가속도 → 자기장 → 밝기 → 온도. 자기장 보정은 명시적으로 생략하고 수신만 확인 |
| `bmp280` | BMP280 → 온도. 센서 배선 필요, 결측은 실패 |
| `analog` | 아날로그 P0/P1/P2 → 온도. 원시값 형식/범위 검사와 실제 입력 정확도 구분 |

이벤트 시간만 비교하는 별도 연결 시험은 의도적으로 자동 재시도 없이 첫 연결 결과를 기록한다. 제품 연결 정책 검증용 왕복과 혼동하지 않는다.

## 연결 정책과 실패 확인

- B/C 공통: 즉시 연결·조회하고 일시적 실패 후 **2초·4초·8초**, 총 4회 시도한다. 서비스·특성을 새로 가져오며 모드 명령·펌웨어 전송·측정 시작은 이 루프 밖에 둔다.
- 재부팅의 실제 해제 이벤트는 최대 10초 기다린다. 명령 쓰기 완료 뒤 이벤트가 없으면 연결을 정리하고 상태 조회로 진행한다. C 전송 종료는 기존 라이브러리가 처리하며 연결 해제를 앱 부팅 완료로 간주하지 않는다.
- 서비스·특성 조회는 호출마다 2초로 제한한다(B/C 진단·UART, C DFU 사전 준비). 연결·응답 제한과 전송 라이브러리는 유지한다. 기존 실물 결과는 변경 전 기록이며 2초 제한은 실물 재확인 전이다.
- 상태/로그의 정책 버전은 `connection-backoff-2-4-8-discovery-2s-v2`이다. `connection-retry-*`에 단계·시도·원래 오류·경과·대기를 기록한다. 진단↔UART 인계와 성공 종료에서는 유효 연결을 유지한다.
- **제품에서 확정한 소진 처리:** “micro:bit 뒤쪽의 리셋 버튼을 한 번 누른 뒤 다시 시도해 주세요.” 다시 시도는 새 연결·상태 확인부터 수행한다. 정식 안내 UI는 미구현이며 현재 시험 페이지의 일반 오류/USB 문구를 최종 제품 문구로 사용하지 않는다.
- 권한 거부·취소·다른 보드·식별 불일치·전송 손상은 별도 처리한다. 필요하면 같은 시험본 HEX로 USB 복구한다. 자동 재전송·검사 생략·OS 등록 삭제는 하지 않는다.

## 비본딩 전체 교체 — 시험본 C 빠른 시작

```powershell
node dev/firmware/build-unbonded-trial.mjs
```

C는 `security_mode: 1`·`open: 1`·`pairing_mode: 1`, 런타임 `d6ba9f94efcc2d28`이다. 일반 실행의 비본딩 진입 특성 0003과 응답 `20 01 01`을 확인하고, 같은 선택 보드의 DFU 서비스·제어/전송 특성이 준비되면 원본 라이브러리를 호출한다. B의 본딩형 0004 경로로 대체하지 않는다.

`@thib3113/web-bluetooth-dfu@2.4.0`의 원본 번들을 `new SecureDfu()`로 사용한다. 기본 100B·인위적 대기 0ms·PRN 0이며 20B/10ms 같은 제한을 추가하지 않는다. 전체 `update()`를 자동 재시도하지 않는다. [출처·버전·MIT 라이선스·제한](vendor/web-bluetooth-dfu-2.4.0/README.md).

온도 188,640B·밝기 188,816B의 애플리케이션과 56바이트 init을 검증한다. SoftDevice·부트로더는 전송하지 않는다. 전송 최종 응답, 보드 프로그램 확인, 새 수신을 따로 기록한다. B의 구형 전체 DFU 화면·자체 전송기는 과거 조사용이며 현재 C 전송 엔진이 아니다.

## 파일과 검증

| 파일 | 역할 |
|---|---|
| `connection-retry.js` | B/C 공통 연결 준비 재시도 |
| `diagnostics.js`, `partial-flash.js` | V2 모드·영역 조회, 부분 전송·ACK·완료 요청 |
| `trial-runner.js`, `test-plans.js` | B 시험 순서·식별·수신 판정, 명령 허용 목록 |
| `unbonded.js`, `full-image.js` | C 시험 조율·원본 라이브러리 호출, 파일/영역/init 검증 |
| `page.js`, `index.html`, `unbonded.html` | 개발 화면·사용자 동작·로그. 제품 상태 관리로 그대로 이식하지 않음 |
| `bridge-client.js`, `bridge-server.mjs`, `control.mjs` | loopback 명령/결과 통로. BLE 연결 소유자는 브라우저 |
| `results/` | 원본 근거. 현재 판단은 설계의 요약을 먼저 확인 |

부분 전송은 20B 패킷 4개로 64B 자료를 보내며 명시적인 NACK에만 같은 블록을 새 순번으로 최대 3회 시도한다. 응답 시간 초과·잘못된 ACK·중간 단절을 연결 준비 재시도로 감싸지 않는다. 등록 파일·보드 런타임·영역 검증과 기존 센서 codec을 재사용한다.

시험 파일은 [펌웨어 빌드 안내](../firmware/README.md)를 따른다. B의 런타임은 `5f21a4c8e2b240e5`, 온도 프로그램은 `570021009100fc00`이다. 현재 배포본 `11f3cd7e54807276`은 `pairing_mode: 0`이므로 시험본 B처럼 취급하지 않는다. 배포 HEX·manifest·기존 캐시는 실험으로 자동 갱신하지 않는다.

관련 동작을 수정할 때만 해당 검사를 실행한다. 문서 변경에 전체 검사를 돌리지 않는다.

```powershell
node --test tests/unit/bluetooth-diagnostics.test.mjs tests/unit/bluetooth-flashing.test.mjs tests/unit/bluetooth-trial-runner.test.mjs
node --test tests/unit/bluetooth-trial-bridge.test.mjs
npx playwright test tests/e2e/bluetooth-diagnostics.spec.mjs
```

## 로컬 제어와 로그의 한계

서버는 loopback·같은 출처·명시적 JSON 요청을 확인한다. 활성 페이지는 하나이며 새로고침 시 다시 허용해야 한다. 5초 이상 응답이 없으면 대기 명령을 폐기하고 재전달하지 않는다. 페이지가 제어 통로 상실을 감지하면 자동 시험도 중단한다.

브라우저는 최근 일반 로그 1,500개·독립 추적 2,000개를, 서버는 현재·직전 페이지의 마지막 스냅샷을 보관한다. 서버 종료 시 메모리 기록은 사라진다. 독립 추적의 연결 번호·호출 스택은 진단용이며 해제 이벤트 자체의 원래 연결 번호를 보장하지 않는다.

**미해결: 전송 로그 2MB 제한.** 연속 16왕복 성공 뒤 17번째에 `로컬 제어 끊김: 로그 크기 초과`로 중단됐다. Bluetooth 실패나 자동 복구 소진으로 판정하지 않는다. 단순히 체크를 다시 켜도 같은 로그 크기면 다시 끊길 수 있다. 장시간 시험 재개 전에는 원본 로그를 보존하고 전송 스냅샷의 중복·크기 처리를 보완해야 한다. 사용자 결정으로 해당 수정과 추가 시험은 보류했다.

## 프로토콜·라이선스 근거

- [CODAL V2 v0.3.5 명령·UUID](https://github.com/lancaster-university/codal-microbit-v2/blob/f5d1682fc3882022d3d5a7facb1fddb4b0ea7b52/docs/bluetooth/MicroBitPartialFlashing.md), MIT. 고정 소스를 참고한 부분 전송/진단 구현이며 Capacitor 전송 코드를 번들하지 않는다.
- microbit-connection `12cbc608`, MIT: [부분 전송](https://github.com/microbit-foundation/microbit-connection/blob/12cbc608be4f5cfb0496b822ae6636389d8b97a4/packages/microbit-connection/src/bluetooth/flashing/flashing-partial.ts), [모드·영역 조회](https://github.com/microbit-foundation/microbit-connection/blob/12cbc608be4f5cfb0496b822ae6636389d8b97a4/packages/microbit-connection/src/bluetooth/services/partial-flashing-service.ts), [전체 영역 추출](https://github.com/microbit-foundation/microbit-connection/blob/12cbc608be4f5cfb0496b822ae6636389d8b97a4/packages/microbit-connection/src/bluetooth/flashing/flashing-full.ts), [init 생성](https://github.com/microbit-foundation/microbit-connection/blob/12cbc608be4f5cfb0496b822ae6636389d8b97a4/packages/microbit-connection/src/bluetooth/flashing/nordic-dfu.ts).
- 과거 자체 DFU 조사의 참고: [web-bluetooth-dfu 1.2.1 / `95fd509`](https://github.com/thegecko/web-bluetooth-dfu/blob/95fd509a5279ae4463f3e12f1cd21565e870027c/src/secure-dfu.ts), MIT. 현재 C에서 사용하는 2.4.0 원본 번들과 구분한다.
- V2 부트로더 `4215a2b`: [기본 설정](https://github.com/microbit-foundation/v2-bootloader/blob/4215a2beb79e30f9c1435965235512353fcd4c9a/bootloader/microbit/config/sdk_config.h), [microbit_app 검증](https://github.com/microbit-foundation/v2-bootloader/blob/4215a2beb79e30f9c1435965235512353fcd4c9a/nRF5SDK_mods/components/libraries/bootloader/dfu/nrf_dfu_validation.c). 설정 소스만으로 시험 보드의 실제 빌드 조건을 단정하지 않는다.
- HEX 해석·기존 의존성은 [USB 라이브러리 고지](../../public/vendor/microbit-usb-LICENSES.md), 현재 C 번들은 [vendor 고지](vendor/web-bluetooth-dfu-2.4.0/README.md), 재연결 공식 근거는 [설계 §7](../../docs/sensor-program-installation-roadmap.md#7-공식-근거와-구현-선택)을 따른다.

원본 실험 로그는 로컬 보존·Git 추적 제외이며, 공유되는 근거는 핵심 집계와 본 문서의 결과 요약이다.
