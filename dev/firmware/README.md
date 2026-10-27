# 펌웨어 빌드·배포

센서 프로그램을 검증 가능한 설치 파일로 만드는 절차다. 보드의 명령·측정값·상태·LED 동작은 [센서 프로그램 공통 동작 규약](../../docs/sensor-program-contract.md), 앱의 설치·재연결은 [설치 개선 설계](../../docs/sensor-program-installation-roadmap.md)를 따른다.

## 현재 배포와 보존 정책

| 센서 | 현재 정식 펌웨어 |
|---|---|
| 온도·밝기·가속도·자기장·BMP280 | `sensor-lab-<센서명>-v1` |

정식 V1은 새 `sensor-lab-*` ID를 사용한다. 이전 `*-uart` 계열과 ID·버전이 충돌하지 않으며, 과거 자료의 메타데이터를 새 V1으로 바꾸지 않는다. 정식 V1 이전 설치 파일(HEX·BIN·TS·빌드 기록)은 제거했다. `src/device/stale-firmware.js`에는 과거 자료의 해석·호환되는 이어 측정에 필요한 ID·버전·해시·통신 규약만 남긴다. stale 항목에는 다운로드 주소가 없으며 USB·무선 재설치를 허용하지 않는다. 새 설치는 정식 V1의 새 실험에서 진행한다.

현재 5종은 같은 B 공통 런타임(`pairing_mode: 1`, open-link)으로 빌드한다. USB용 HEX와 무선용 부분 BIN은 **같은 센서 프로그램**이며, BIN은 검증한 HEX에서 추출한다. 공통 런타임이 다른 보드·최초 준비·전송 손상은 USB 설치로 처리한다. 앱의 설치 허용 보드는 micro:bit V2다.

- 채택한 배포본은 ID·버전·해시를 고정한다. 같은 버전의 파일을 수정하지 않고 새 버전을 발행한다.
- 새 실험은 현재 버전, 과거 자료는 명시적으로 보존한 버전을 해석한다. 저장된 버전·해시·codec을 최신 값으로 덮어쓰지 않는다.
- 개발 중 임시 버전은 호환용 배포본으로 누적하지 않는다. 후보는 Git 비추적 `built/`에서 관리하고 채택한 결과만 `public/firmware/`에 넣는다. 제거한 자기장 임시 v3·v4 번호는 재사용하지 않는다.
- 설치·연결 확인은 센서 정확도 검증과 별개다. 상세 실물 근거는 [설치 설계 §8.4](../../docs/sensor-program-installation-roadmap.md#84-현재-검증-결과와-남은-작업)에만 남긴다. 부분 검증을 이유로 전체 `hardwareVerified`를 참으로 바꾸지 않는다.

## 파일의 역할

| 파일·폴더 | 역할 |
|---|---|
| [targets.json](targets.json) | 센서별 소스·추가 소스·ID·버전·규약 선언과 고정 도구 버전 |
| [pxt-template.json](pxt-template.json) | core + Bluetooth의 기본 설정. 정식 공통 런타임의 `pairing_mode: 1`을 기본으로 사용한다. |
| [build.mjs](build.mjs) | 현재 후보 빌드·내장 소스·설정·V2 해석 검증 |
| [publish.mjs](publish.mjs) | 채택할 5종의 입력·공통 런타임 확인 후 배포 파일 발행 |
| [sensor-display.ts](../../firmware/common/sensor-display.ts) | 공통 기본 간격·상태 표시. `additionalSources`로 포함 |
| [wireless-firmware.js](../../src/device/wireless-firmware.js) | 발행기가 생성하는 현재 배포 메타데이터 |
| [firmware.js](../../src/device/firmware.js) | 앱의 현재 설치 허용 목록과 과거 식별 정보 해석 |
| `built/projects/`, `built/artifacts/` | 생성 작업 폴더와 검증된 후보. Git 비추적 |
| [public/firmware/](../../public/firmware/) | 배포 HEX·부분 BIN·다운로드 소스·빌드 기록·라이선스 |

`targets.json`의 `protocol`은 선언일 뿐 소스를 자동 수정하지 않는다. ID·버전·표시 이름은 이 파일 한 곳에서 선언하며 발행기가 그대로 사용한다. `releases`는 기본 빌드·런타임 비교·발행 대상 5종을 지정한다. 후보도 배포본과 같은 `<펌웨어 ID>-v<버전>` 이름으로 `built/artifacts/<센서>/`에 생성한다.

## 현재 빌드·배포 절차

저장소의 Node 버전을 사용한다. 최초 개발 의존성 설치는 `dev/firmware/`에서 실행한다.

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

이후 저장소 루트에서 실행한다.

```sh
# 정식 V1 센서 5종의 후보 빌드 (기본 명령)
npm run build:firmware

# 대상 목록 / 정식 센서 하나 / 배포본과 정확히 일치하는지 재빌드 확인
npm run build:firmware -- --list
npm run build:firmware -- magnetometer
npm run build:firmware -- magnetometer --check

# 개발 예제는 이름을 명시했을 때만 빌드
npm run build:firmware -- analog-raw

# 후보들의 현재 소스·HEX·V2 네이티브 영역 일치 확인
node dev/firmware/check-common-runtime.mjs

# 채택된 5종의 검증된 파일과 현재 버전 목록을 발행
npm run publish:firmware

# 배포본 해시·소스·USB/무선 일치와 프로그램 동작의 모의 검사
npm run check:firmware
```

1. 센서 프로그램과 규약을 수정하고 영향받는 동작을 검사한다. 새 센서 등록은 [센서·활동 등록 절차](../../src/catalog/README.md)를 따른다.
2. 채택할 버전을 `targets.json`에서 정한다. 현재 발행기는 5종을 함께 검증하므로 다른 센서의 후보도 현재 소스와 일치해야 한다.
3. 빌드는 HEX에 내장된 소스·설정, 공식 V2 해석 결과, 도구·런타임 해시를 확인한 뒤 후보를 남긴다. 컴파일 전에 낡은 `binary.hex`를 제거하며 실패한 결과로 마지막 검증 후보를 교체하지 않는다.
4. 발행기는 모든 센서의 입력과 네이티브 영역 일치를 먼저 확인하고 HEX·BIN·TS·빌드 기록과 앱 목록을 생성한다. 이미 발행한 같은 버전의 HEX 내용 변경은 거부한다.
5. 변경한 동작에 필요한 USB·무선 실물 확인을 수행하고 확인 범위만 기록한다. 원본 로그는 Git 비추적 경로에, 날짜·결과·한계는 짧은 요약에 둔다.

빌드 성공, 파일 발행, 앱 배포, 실기기 확인은 각각 별개다. 앱 등록·배포가 빌드만으로 자동 완료되지 않는다. 소스만 수정해도 기존 보드의 프로그램은 바뀌지 않는다.

## 공통 런타임과 검증 경계

공식 [MakeCode CLI](https://makecode.com/cli)와 [micro:bit target](https://github.com/microsoft/pxt-microbit/tree/v9.1.1)을 사용한다. [lockfile](package-lock.json)은 `pxt@0.5.1`, `pxt-microbit@9.1.1`, `pxt-core@13.0.1`과 전이 의존성을 고정한다. 앱은 개발 의존성을 로드하지 않는다.

- `runtime-cache-pairing/`는 현재 B용 공식 컴파일 결과다. `runtime-provider.cjs`는 기본적으로 고정 캐시만 사용하고 미등록 compile key·해시 손상을 거부한다. 최초 네이티브 이미지는 공식 클라우드 컴파일 결과이며 C++를 로컬에서 재빌드했다는 뜻이 아니다.
- 새 네이티브 입력이 필요할 때만 `node dev/firmware/build.mjs <대상> --fetch-runtime`으로 공식 이미지를 확보하고, 고정 해시로 다시 빌드한다. 같은 키의 변경된 이미지는 덮어쓰지 않는다.
- 센서별 TypeScript 루프·드라이버는 교체 가능한 프로그램 영역에 둔다. 같은 계열은 런타임 식별값·시작 주소뿐 아니라 네이티브 영역의 실제 바이트가 일치해야 한다.
- 외부 확장의 커밋·파일 해시·전이 의존성·라이선스를 고정한다. 네이티브 API·Bluetooth 설정이 달라지면 새 런타임 계열로 검증하고 USB로 전환한다. 미래 센서를 위해 임의 기능을 미리 넣지 않는다.
- 현재 B는 런타임 `5f21a4c8e2b240e5`, 프로그램 시작 `0x49000`, 허용 끝 `0x73000`이다. 향후 모든 계열에 이 값을 고정하지 않는다. 런타임 호환은 센서 채널·단위·저장 자료 호환과 별개다.
- HEX 해시는 UTF-8 텍스트의 CRLF만 LF로 정규화해 계산한다. 공백·BOM은 제거하지 않는다. BIN은 원본 바이트를 검증한다. `.build.json`에 입력·설정·도구·런타임·소스·산출물 해시와 검증 근거를 남긴다.
- Universal HEX에 V1·V2 이미지가 있어도 앱의 지원 범위는 V2다. CODAL·MakeCode·Nordic 구성요소의 출처·버전·라이선스는 [펌웨어 고지](../../public/firmware/NOTICES.md)를 보존한다.

## 명령과 기록의 구분

`npm run build:firmware`와 `--all`은 정식 센서 5종을 빌드한다. `analog-raw`·`temperature-light`는 대상 이름을 명시해야 하며 기본 발행 목록에 들어가지 않는다. 모든 대상은 같은 정식 공통 런타임 설정을 사용한다. 과거 `pairing_mode: 0` 빌드 경로와 `:wireless` 명령은 제거했다.

빌드는 비추적 후보만 만들고, `npm run publish:firmware`가 검증 후 배포 파일을 갱신한다.
