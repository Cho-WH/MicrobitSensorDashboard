# Bluetooth 설치 시험실

M6의 G0–G4를 확인하는 **개발용 페이지**다. 공통 런타임 시험본 7개의 부분 전송, 모드 전환·재연결·수신 자동 시험, 로컬 명령 실행·JSON 결과 조회를 제공한다. 최초 시험본 B 설치와 복구는 USB로 한다. 정식 앱·배포 파일에는 포함하지 않는다.

**현재 상태:** 공통 런타임 안의 무본딩 부분 전송을 시험 중이다. 내장·외장 후보 교체/수신과 역할·시험 간 연결 유지 사례를 확인했으나, 최신 시험은 재연결·조회 재시도 한 번도 실패했다. 정식 앱에는 미통합이며 안정화 완료가 아니다. 성공·실패·검증 한계는 [설치 개선 설계 §8.4](../../docs/sensor-program-installation-roadmap.md#84-현재-검증-결과와-남은-작업)에서 관리한다. 본딩·전체 DFU는 제품 범위에서 제외했다.

## 빠른 시험과 로컬 명령

1. 개발 서버를 최신 코드로 실행하고 PC Chrome에서 http://localhost:8080/dev/bluetooth-install/ 을 연다. 다른 앱의 측정을 마치고 보드 연결을 해제한다.
2. **장치 선택·진단**에서 시험본이 설치된 보드를 한 번 선택한다. 브라우저의 장치 선택창은 사람이 조작한다.
3. 화면의 **선택 시험 시작**으로 실행하거나, **이 컴퓨터의 로컬 명령…허용**을 켠 뒤 아래 명령을 사용한다. 허용만으로 전송이 시작되지는 않는다.

```powershell
node dev/bluetooth-install/control.mjs status
node dev/bluetooth-install/control.mjs run builtin
node dev/bluetooth-install/control.mjs log
node dev/bluetooth-install/control.mjs cancel
node dev/bluetooth-install/control.mjs diagnose
node dev/bluetooth-install/control.mjs log > bluetooth-trial-result.log
```

기본 주소는 localhost:8080이며 다른 포트는 환경 변수 `LAB_TRIAL_URL`로 지정한다. 명령은 접수 결과를 즉시 반환하고 `status`로 진행·성공/실패를, `log`로 원문과 결과를 조회한다. 명령줄은 장치 선택창을 열거나 임의 코드·파일을 실행하지 않는다. 페이지에서 허용한 선택 보드에 등록된 시험만 실행한다.

| 시험 이름 | 교체 순서 | 준비·판정 범위 |
|---|---|---|
| `builtin` | 온도 → 가속도 → 자기장 → 밝기 → 온도 | 배선 없음. 자기장은 보정을 명시적으로 생략하고 수신만 확인 |
| `quick` | 밝기 → 온도 | 기존 후보 왕복 확인 |
| `bmp280` | BMP280 → 온도 | 센서 배선 필요. 결측·형식 오류·범위 밖 값은 실패. 실제 정확도는 기준 계측기와 비교 |
| `analog` | 아날로그 → 온도 | 현재 후보 P0·P1·P2, 알려진 입력 연결. 형식·0–1023 범위 판정이며 핀 연결·정확도 자동 증명 아님 |

실행 전 모든 대상·복귀 파일의 해시를 검사하고, 시작 보드의 등록 프로그램·런타임·메모리 범위를 확인한다. 각 단계는 모드 전환 → 같은 선택 장치 재연결 → 부분 전송 → 일반 모드/프로그램 확인 → 유효 측정값 3개 수신 → stop으로 진행한다. **진단→측정과 측정→다음 진단은 같은 GATT 연결을 유지한다.** 이전 모듈의 알림 구독과 이벤트 처리를 정리한 뒤 제어권을 넘기며, 역할 전환용 대기·해제·재연결은 하지 않는다. 모드/프로그램 재시작에는 새 연결에서 서비스와 식별값을 다시 읽고, 성공한 시험 종료에는 진단 연결을 유지해 다음 시험에 넘긴다. 명시적 장치 해제·실패·취소에는 연결을 정리한다. 로그의 `connectionRetained`와 `trace-trial-connection-retained`로 시험 간 유지 여부를 확인한다. 로그의 `connectionHandoff: same-gatt-v1`과 `trial-handoff`로 이전 방식과 구분한다.

기존 센서 codec을 사용하며 보정 정확도·장시간 안정성은 별도다. 현재 자동 시험은 설치 모드 진입·전송 완료 후 앱에서 즉시 끊지 않고 실제 해제 이벤트를 최대 6초 기다린다. 이벤트 뒤 고정 대기 없이 재연결하고 서비스·프로그램·실행 모드를 확인한다. 이 재연결·조회 자체가 실패하면 기존 1.2초 복구 간격 뒤 한 번만 더 연결·조회하며, 모드 명령이나 펌웨어 전송은 반복하지 않는다. 설치 모드 진입 뒤에는 기존 런타임·프로그램 식별값 유지도 확인한다. 이벤트 시간 초과·데이터 전송 실패는 그대로 중단하며 성공으로 취급하지 않는다. 시간 초과 뒤 상태 정리·재진단·재개는 별도의 복구 시도로 기록한다. 측정용 UART 연결·알림 구독 준비 중 실제 GATT 오류가 발생하면 연결을 정리하고 한 번 재시도한다. 시작 명령을 보낸 뒤의 오류·수신 단절이나 권한 거부는 재시도하지 않는다. 실패 뒤 자동으로 온도 이미지를 덮어쓰지 않는다. [연결 개발 원칙](../../docs/unified-sensor-lab-architecture.md#6-장치-통신과-펌웨어)은 기술 설계의 연결 계약을 따른다.

로컬 명령 통로는 개발 서버의 `/__dev/bluetooth-trial/*`다. loopback 접속·Host·Origin·명시적인 JSON 요청을 확인하며 내부 네트워크 주소나 외부 사이트에서는 제어할 수 없다. 활성 페이지는 하나이며 새로고침 시 다시 허용해야 한다. 5초 이상 응답이 없으면 대기 명령을 폐기하고 재전달하지 않는다. 페이지가 통로 상실을 감지하면 실행 중인 자동 시험도 중단한다. 작업·연결은 페이지가 소유하며 서버는 명령·결과만 중계한다.

로그는 화면 최대 1,500개, 서버는 현재·직전 페이지의 마지막 스냅샷만 메모리에 보관한다. 새로고침해도 직전 스냅샷을 `log`로 저장할 수 있지만 서버를 종료하면 사라진다. `passed`는 프로그램 식별·수신 계약 통과이며 실측 정확도·전원 차단 복구 성공을 뜻하지 않는다. 브라우저 모의 시험도 실물 증거와 구분한다.

임시 연결 관찰(`independentConnectionTrace: 1`): 장치 선택 시 독립 해제 이벤트 관찰자를 한 번 등록하고 모듈 정리 뒤에도 유지한다. 선택 장치의 GATT 연결·해제·서비스 조회 호출을 원래 인자·반환값으로 실행하며 시작/종료·호출 스택을 기록한다. 모드/종료 명령·시간 초과·진단 수신기 처리 여부·뒤늦은 정리도 기록한다. `connectionTrace`에는 최근 관찰 2,000개를 패킷 로그와 별도로 보존한다. 모든 기록에 단조 시각·연결 상태·화면 표시 상태를 남긴다. `latestConnectionId`는 관찰 당시 최신 연결 시도 번호이고 `operationConnectionId`/`ownerConnectionId`는 작업이 시작된 연결 번호다. 해제 이벤트 자체에는 연결 번호가 없으므로 최신 번호를 해당 이벤트의 원래 연결이라고 단정하지 않는다. 새로고침하면 관찰자와 번호가 초기화된다. 이 로그는 개발 시험용이며 정상 연결 순서·대기·재시도 정책을 변경하지 않는다.

## 현재 시험: 온도 시험본 B

`node dev/firmware/build-pairing-trial.mjs`로 고정 캐시에서 시험본을 만든다. 페이지 상단의 **무선 교체용 시험본 B 받기**와 하단 **시험본 B로 복구 · HEX 받기**는 같은 로컬 산출물을 가리킨다. 기존 배포본 A는 시험 종료 후 복귀하는 접힌 영역에서만 제공하며 무선 교체 시험용이 아님을 표시한다. 배포 앱에는 포함되지 않는다.

1. 수신을 중단하고 V2를 USB로 연결한다. 받은 `temperature-pairing-trial-v1.hex`를 `MICROBIT` 드라이브에 복사한다.
2. 재부팅 후 진단해 런타임 `5f21a4c8e2b240e5`와 일반 실행 모드 1을 확인한다. 프로그램 식별값은 `570021009100fc00`이다.
3. 시험본 USB 설치 확인란을 체크하고 **앱에서 설치 모드 요청** → 같은 보드 재연결로 모드 0을 확인한다. 앱 요청이 실패하면 안내된 A+B+리셋 조작으로 비교한다.
4. **일반 실행 모드 요청** 후 재연결해 모드 1을 확인하고 온도 수신을 시작한다. 연결된 진단 모듈이 있으면 같은 GATT를 측정 모듈에 넘긴다. 연결이 실제로 끊긴 경우에만 다시 연결한다.

시험본의 빌드 출처·해시는 산출물의 .build.json 및 [빌드 안내](../firmware/README.md)를 따른다. 실물 판정은 [설치 개선 설계 §8.4](../../docs/sensor-program-installation-roadmap.md#84-현재-검증-결과와-남은-작업)에 모아 둔다.

## 실행·첫 시험

### 전체 애플리케이션 교체 — 종료한 조사 절차

1. 시험본 B 보드를 선택·진단하고 설치 모드를 요청한 뒤 같은 보드에 재연결해 모드 0을 확인한다. 먼저 **온도 → 온도 전체 재설치**를 시험한다.
2. **파일 검사·DFU 모드 요청**은 BIN·56바이트 init의 SHA-256·실행 영역을 검증하고, 같은 연결에서 V2·모드·시험본 식별값을 다시 읽는다. DFU 진입 특성의 본딩 여부와 응답 구독·명령 접근 거부를 기록한다.
3. 주변 다른 보드를 끄고 같은 보드임을 확인한 뒤 **DFU 장치 선택**에서 직접 선택한다. 이름은 `DfuTarg`로 바뀔 수 있다. 브라우저 ID/이름만으로 전환 전후 동일성을 자동 증명하지 않으며 사용자 확인을 로그에 구분한다. 진입 응답이 없었으면 실제 DFU 장치가 된 경우에만 선택하고, 그렇지 않으면 USB로 복구한다.
4. **전체 교체 시작**은 파일을 재검증하고 제어·데이터 특성을 확인한다. 새 init으로 시작해 애플리케이션의 처음부터 모든 바이트를 보낸다. 객체마다 오프셋·CRC32를 모두 확인한 뒤 실행한다. 이미지 SHA-256은 init에 항상 포함한다. 이전 전송 자동 재개·실패 자동 재전송·검사 실패 객체 건너뛰기는 없다.
5. 최종 실행 응답과 프로그램 확인은 별도다. **선택 장치 재연결**로 원래 보드의 일반 모드·대상 프로그램을 확인한 뒤 온도를 수신한다. 마지막 실행 중 단절되면 응답 미확인으로 남긴다. 이후 밝기 전체 설치 → 온도 전체 설치로 확대한다.

온도 **188,640바이트**, 밝기 **188,816바이트**이며 `0x1c000`부터 런타임·센서 코드를 포함한다. 상한은 `0x77000`이다. 기존 공식 V2 해석기·고정 HEX 리더를 재사용하며 `export-partial-trials.mjs`가 부분/전체 산출물을 함께 만든다. `firmware/full-programs.js`에 원본 HEX·BIN·init 해시를 고정한다. init의 `hash_size`는 항상 32다.

**전체 DFU의 선행 확인:** 공식 full-flash는 bonded 장치를 전제하고 V2 부트로더 기본 설정은 `NRF_DFU_BLE_REQUIRES_BONDS=1`이다. 현재 시험본은 open-link를 유지한다. 부분 전송 성공이 전체 DFU 권한 성공을 뜻하지 않는다. 실제 특성과 응답을 먼저 확인하고, 보안 설정 변경이나 OS 페어링이 필요하면 별도 비교 후보·사용 흐름을 합의한다. 이번 준비에서 보안 설정·배포 펌웨어는 변경하지 않았다. 중단 시 USB 시험본 B로 복구하며 무선 재개는 후속 검증이다.

전체 DFU는 본딩형 진입 알림 구독 중 실패하여 이미지 전송 전에 중단한 조사 경로다. 제품 범위에서 제외하며 공통 런타임 부분 교체로 진행한다.

### 부분 전송 절차 — 현재 채택한 경로

자동 시험은 주 화면에서 사용한다. 다음 수동 절차는 접힌 영역에서 개별 동작을 조사할 때 사용한다.

1. 시험본 B 보드를 선택·진단하고 설치 모드를 요청한다. 같은 장치에 재연결해 모드 0을 확인한다.
2. 등록된 전송 시험본을 선택하고 **무선 전송 시작**을 누른다. 파일 SHA-256과 헤더를 검증한 뒤, 같은 연결에서 보드 상태·런타임·영역을 다시 읽는다. 불일치 시 펌웨어 데이터는 보내지 않는다.
3. 64바이트씩 4개 패킷으로 보내고 ACK를 기다린다. 명시적인 NACK만 같은 블록을 새 순번으로 재전송하며 최대 3번 시도한다. 시간 초과·응답 오류·중단에는 연결을 종료하고 완료 명령을 보내지 않는다.
4. 100%는 데이터 전송 단계다. 종료 요청 후 **선택 장치 재연결**에서 일반 실행 모드와 대상 프로그램 식별값을 읽어야 프로그램 확인으로 표시한다. 이 값은 전체 메모리를 다시 계산한 SHA-256이 아니다.
5. 온도→밝기→온도로 비교하고 마지막 온도 수신을 확인한다. 밝기 시험본으로 식별된 동안 온도 수신 버튼은 비활성이다. 중간 단절·전원 차단 후 회복은 아직 별도 실물 검증 대상이며 필요하면 USB 시험본을 다시 복사한다.

전송 자료는 `node dev/firmware/export-partial-trials.mjs`가 공식 V2 해석기와 기존 고정 `nrf-intel-hex@1.4.0`으로 생성한다. 7개 파일의 런타임을 바이트 단위로 비교한 뒤 프로그램 영역만 `firmware/*.bin`과 해시 목록으로 저장한다. 브라우저에서 새 HEX 라이브러리를 중복 번들하지 않는다. 생성 전 7개 시험본을 빌드해야 한다. 전체 DFU 산출물은 기존 온도/밝기만 유지한다.

### 진단과 로그

저장소의 개발 서버(`npm run dev`)에서 `http://localhost:8080/dev/bluetooth-install/`을 PC Chrome·Edge로 연다. 서버 포트가 다르면 주소를 맞춘다. 내부 IP의 HTTP는 Web Bluetooth 보안 조건을 충족하지 않는다. 휴대폰 시험은 신뢰할 수 있는 HTTPS 개발 주소가 마련된 뒤 진행하며 브라우저 보안 설정을 끄지 않는다.

1. 기존 앱의 기록을 마치고 저장한 뒤 장치 연결을 해제한다. 이 페이지는 다른 탭의 Session·RunStore를 제어하지 않는다.
2. 온도 배포본이 설치된 V2를 준비하고 시험 구분·OS 페어링 기록·보드/파일 메모를 입력한다. 과거 연결 오류가 남아 있다면 기록을 지우기 전 상태부터 보관한다.
3. **장치 선택·진단**을 누른다. 모델·서비스·현재 모드·런타임/프로그램 영역을 읽는다. 서비스 없음, 접근 거부, 응답 오류·시간 초과를 구분한다. 조회는 GATT 명령을 보내 응답을 받지만 프로그램 메모리를 쓰거나 모드를 바꾸지 않는다.
4. 온도 프로그램임을 확인하고 **온도 수신 시작**으로 UART 수신을 비교한다. 진단의 알림 구독을 해제하고 같은 GATT 연결을 측정 모듈에 넘긴다. `start`/`stop`만 보내며 원문·수신 줄 수·경과 시간을 기록한다. 수동 수신 중단은 연결도 종료한다. 일반 실행과 센서 종류를 자동 식별했다고 판단하지 않는다.
5. **JSON 저장** 또는 **로그 복사**로 결과를 보관한다. UTC 시각·브라우저·단계·응답 바이트·입력한 조건을 기록한다. 로그에는 장치 식별 정보가 포함되며 외부 서버로 전송하지 않는다. 최근 1,500개 항목만 유지하고 잘린 개수를 기록한다. 화면은 최근 80개만 표시한다. 로컬 제어를 켜면 서버 메모리에도 스냅샷을 전달한다.

## 모드 전환과 제한

- 부분 전송 조회는 `0xEE` 상태와 `0x00` 영역 1·2, 쓰기는 `0x01`과 `0x02`를 사용한다. 전체 전송은 별도의 Secure DFU 서비스·객체 명령을 사용한다. 임의 GATT 패킷 입력은 없다. 설치는 보드 저장소를 초기화할 수 있어 일반 사용자 프로그램·보드 저장 자료 보존 경로로 제공하지 않는다.
- 상태 응답은 3바이트, 영역 응답은 18바이트의 유효 내용을 읽는다. CODAL의 고정 길이 특성에서 오는 20바이트 응답도 지원하며 여분은 해석하지 않는다. 영역 해시는 항상 8바이트만 사용한다. 원문 로그는 여분까지 보존한다.
- `0xFF` 모드 전환은 V2 모델·프로토콜 버전 1·현재 모드를 확인한 뒤 명시적 수동 버튼 또는 사용자가 시작·허용한 자동 시험에서만 보낸다. 설치 모드 요청에는 유효한 영역과 **해당 보드에 시험본을 USB 설치했다는 사용자 확인**도 필요하다. 이 확인은 소프트웨어가 검증한 펌웨어 식별이 아니다. 자동 시험은 확인란을 대신 체크하지 않고 등록된 시험본 식별값·메모리 조건을 검사하여 실행한다.
- 현재 내장 배포본의 런타임 식별값 `11f3cd7e54807276`이면 확인란을 체크해도 설치 모드 요청을 막는다. 해당 설정의 `pairing_mode: 0` 때문에 재부팅 표식만 남기는 실험을 하지 않기 위해서다. 다른 값이라는 사실만으로 시험본임을 증명하지는 않는다.
- 전환 요청은 재부팅 표식을 저장할 수 있다. 전송 성공·예상 단절은 모드 변경 성공이 아니다. 수동 시험은 **선택 장치 재연결**, 자동 시험은 같은 선택 장치 재연결로 새 상태를 읽은 뒤 요청 모드와 비교한다. 장치 식별이 달라져 재연결이 안 되면 보드 표시를 확인하고 명시적으로 재선택한다. 주변 첫 장치로 자동 연결하지 않는다.
- 시간 초과·잘못된 응답에는 연결을 종료한다. 요청 식별자가 없는 프로토콜에서 늦은 응답을 다음 요청의 성공으로 재사용하지 않는다. 페이지 이동 시 진행 작업·연결을 정리한다.
- 설치 모드 후보는 먼저 USB로 마련해야 한다. 실제 절차·통과 조건은 [설치 개선 설계 §8](../../docs/sensor-program-installation-roadmap.md#8-개발검증-계획)을 따른다. 현재 배포 HEX·설정·네이티브 캐시는 변경하지 않았다.

## 파일·검사

- `diagnostics.js`: GATT 진단·모드 요청·검증된 전송. 시간 제한·연결 수명·명령 직렬화를 소유한다.
- `partial-flash.js`: 파일 검증·보드 호환 판정·패킷·ACK/NACK 처리. 전송 완료와 재연결 검증을 구분한다.
- `trial-runner.js`, `test-plans.js`: 자동 시험 순서·재연결·수신 판정. 기존 센서 codec과 BLE 모듈을 재사용한다.
- `bridge-server.mjs`, `bridge-client.js`, `control.mjs`: 로컬 명령·진행/결과 조회. 서버는 BLE 연결을 소유하지 않는다.
- `full-image.js`: 전체 이미지 영역·실행 벡터·SHA-256·init 검증.
- `secure-dfu.js`: 전체 객체 전송·CRC·실행 응답·시간 제한·단절·취소. 장치 선택과 모드 진입은 화면·진단 모듈이 맡는다.
- `page.js`: 사용자 조작·로그·시험 조건·온도 수신 화면. 기존 `createBleClient`와 브라우저 지원 판정, 펌웨어 목록을 재사용한다. 실험 DB·localStorage에 쓰지 않는다.
- `index.html`, `style.css`: 기존 토큰·폰트를 사용하는 개발 화면. 정식 앱 메뉴·라우트에는 연결하지 않는다.

관련 검사만 실행한다.

```sh
node --test tests/unit/bluetooth-diagnostics.test.mjs tests/unit/bluetooth-flashing.test.mjs tests/unit/bluetooth-full-dfu.test.mjs
node --test tests/unit/bluetooth-trial-runner.test.mjs tests/unit/bluetooth-trial-bridge.test.mjs
npx playwright test tests/e2e/bluetooth-diagnostics.spec.mjs
```

모의 검사는 응답 해석·요청 제한·시간 초과/단절·늦은 응답·복귀 UI를 확인하며 실물 설치 증거가 아니다. 기존 빌드의 복사 목록은 `dev/`와 `tests/`를 포함하지 않아 이 페이지와 검사용 모듈은 `dist/` 배포에서 제외된다. 별도의 새 패키지나 제품용 전송 엔진은 추가하지 않았다. 전송 단계 검증 뒤 재사용 로직은 정식 모듈로 옮기고 임시 화면은 정리한다.

## 프로토콜 근거

전체 전송은 다음 고정 소스를 검토했다. 외부 소스 파일을 새로 복제·번들하지 않았다.

- microbit-connection `12cbc608`, MIT: [전체 영역 추출](https://github.com/microbit-foundation/microbit-connection/blob/12cbc608be4f5cfb0496b822ae6636389d8b97a4/packages/microbit-connection/src/bluetooth/flashing/flashing-full.ts), [init 생성](https://github.com/microbit-foundation/microbit-connection/blob/12cbc608be4f5cfb0496b822ae6636389d8b97a4/packages/microbit-connection/src/bluetooth/flashing/nordic-dfu.ts). 해시 검사 생략 분기는 사용하지 않는다.
- [web-bluetooth-dfu 1.2.1 / `95fd509`](https://github.com/thegecko/web-bluetooth-dfu/blob/95fd509a5279ae4463f3e12f1cd21565e870027c/src/secure-dfu.ts), MIT: 재사용 후보를 검토했지만 선택적 CRC·불일치 후 진행 가능성·응답 시간 제한 부재·자동 재시도와 단절 정리 부족 때문에 그대로 채택하지 않았다. 프로토콜을 참고해 이번 시험 범위에 한정한 웹 어댑터를 작성했다. 제품용 엔진 채택은 별도다.
- CODAL v0.3.5 [Nordic buttonless DFU 초기화](https://github.com/lancaster-university/codal-microbit-v2/blob/f5d1682fc3882022d3d5a7facb1fddb4b0ea7b52/source/bluetooth/MicroBitBLEManager.cpp), V2 부트로더 `4215a2b` [기본 본딩 설정](https://github.com/microbit-foundation/v2-bootloader/blob/4215a2beb79e30f9c1435965235512353fcd4c9a/bootloader/microbit/config/sdk_config.h), [microbit_app 검증](https://github.com/microbit-foundation/v2-bootloader/blob/4215a2beb79e30f9c1435965235512353fcd4c9a/nRF5SDK_mods/components/libraries/bootloader/dfu/nrf_dfu_validation.c). 설정 파일만으로 현재 보드의 빌드 조건·실물 접근 성공을 단정하지 않는다.

고정 공식 소스를 참고해 진단 명령을 구현했으며 새 외부 소스 파일을 복제·번들하지 않았다. 기존 UART 모듈·공유 자원의 출처 고지는 원래 파일을 따른다.

- CODAL V2 v0.3.5, MIT: [명령·UUID·상태 규격](https://github.com/lancaster-university/codal-microbit-v2/blob/f5d1682fc3882022d3d5a7facb1fddb4b0ea7b52/docs/bluetooth/MicroBitPartialFlashing.md), [부팅 모드 처리](https://github.com/lancaster-university/codal-microbit-v2/blob/f5d1682fc3882022d3d5a7facb1fddb4b0ea7b52/model/MicroBit.cpp#L210).
- microbit-connection, MIT, 조사 커밋 `12cbc608`: [모드·영역 응답 참고 구현](https://github.com/microbit-foundation/microbit-connection/blob/12cbc608be4f5cfb0496b822ae6636389d8b97a4/packages/microbit-connection/src/bluetooth/services/partial-flashing-service.ts). 이 라이브러리를 웹 전송 지원 제품으로 채택했다는 뜻은 아니다.
- 부분 전송의 블록 주소·순번·NACK 처리 참고: 같은 커밋의 [전송 흐름](https://github.com/microbit-foundation/microbit-connection/blob/12cbc608be4f5cfb0496b822ae6636389d8b97a4/packages/microbit-connection/src/bluetooth/flashing/flashing-partial.ts), CODAL v0.3.5 [실제 쓰기/종료 처리](https://github.com/lancaster-university/codal-microbit-v2/blob/f5d1682fc3882022d3d5a7facb1fddb4b0ea7b52/source/bluetooth/MicroBitPartialFlashingService.cpp). 프로토콜을 자체 웹 어댑터로 구현했으며 Capacitor/네이티브 전송 코드를 번들하지 않는다. 기존 HEX 해석 의존성 출처·MIT 라이선스는 [USB 라이브러리 고지](../../public/vendor/microbit-usb-LICENSES.md)를 따른다.
