# 센서 프로그램 설치 방법 개선 과제

> 조사일: 2026-10-25 · 상태: **USB 안내 통합 적용**, 모바일·무선 설치는 후속 제안·미구현·실물 미검증
> 범위: 이 앱의 micro:bit V2 센서 프로그램 설치·준비·측정 복귀. 네이티브 앱 제작이나 라이브러리 교체를 승인한 문서가 아니다.

## 1. 조사 결론과 용어

**우리 센서 프로그램을 먼저 설치하지 않아도, 기존 프로그램이 지원하는 전송용 Bluetooth 모드로 새 프로그램을 받을 수 있다.** 공식 안내는 리셋 세 번, 또는 A+B를 누른 채 리셋을 눌렀다 놓는 진입 방법을 제시한다. 정상 진입 여부를 LED로 확인하고 모바일 앱의 장치 확인 절차를 따른다. 진입이 안 되거나 이전 Python 프로그램 등이 영향을 주면 컴퓨터에서 간단한 MakeCode HEX를 넣어 복구하도록 안내한다. 따라서 “최초 설치는 언제나 USB 필수”, “아무 코드도 없는 보드도 항상 버튼만으로 무선 설치 가능” 모두 지원 설명으로 사용하지 않는다. [공식 모바일 안내](https://microbit.org/get-started/user-guide/mobile/)

학생 안내에서는 **센서 프로그램 설치**, **전송용 Bluetooth 모드**, **측정용 Bluetooth 연결**을 구분한다. 공식 사용자 문서의 펌웨어 업데이트는 인터페이스 칩의 소프트웨어 갱신을 의미하므로, 센서 HEX 전송과 혼용하지 않는다. 내부 코드의 기존 firmware 계약은 이 용어 정리만으로 바꾸지 않는다. [공식 펌웨어 설명](https://microbit.org/get-started/user-guide/firmware/)

## 2. 현재 앱에서 확인한 사실

| 영역 | 현재 구현 및 근거 |
|---|---|
| 설치 | [programmer.js](../src/device/programmer.js)의 WebUSB 전체 전송. 공식 `@microbit/microbit-connection` 1.0.0을 고정 사용한다. HTTPS·API 지원, 파일 해시, V2 보드, 기록/저장 가드를 확인한다. |
| 프로그램 선택 | [firmware.js](../src/device/firmware.js)가 다섯 센서의 파일·버전·해시·codec·시작 명령을 소유한다. 현재 모두 V2 대상이다. |
| 무선 기능 | [ble-client.js](../src/device/ble-client.js)는 측정용 UART 통신이다. 앱 내 Bluetooth 프로그램 전송, 외부 설치 앱 호출·결과 수신은 구현하지 않았다. |
| 준비 단계 | [steps.js](../src/guide/steps.js)의 별도 USB 확인 단계를 제거하고 필수 프로그램 설치 단계에 연결 안내를 통합했다. 데이터 케이블 그림·주의사항과 설치/기설치 선택, 오류·재시도는 유지한다. 센서별 배선 등 설치 전 준비 단계는 그대로 조립한다. |
| 설치 근거 | [progress.js](../src/guide/progress.js)는 앱에서 관찰한 설치 성공과 사용자 확인을 구분한다. 다운로드·앱 전환만으로 설치 성공을 만들 수 없다. |
| 프로그램 설정 | [pxt-template.json](../dev/firmware/pxt-template.json)은 `enabled:1`, `open:1`, `pairing_mode:0`, `whitelist:0`이다. UART 통신을 위한 현재 설정만으로 전송 모드·DFU·무선 재설치 가능 여부를 단정할 수 없다. BMP280 이식 HEX는 별도 출처이므로 같은 설정으로 간주하지 않는다. |

기존 [실물 확인 기록](history/hardware-acceptance-2026-10-19.md)은 USB 설치와 측정을 다룬다. 모바일 무선 설치의 검증 근거로 확대하지 않는다.

## 3. 공식 절차를 기준으로 한 설치 경로

### 3.1. Android: USB 우선, 공식 앱은 대안

공식 사이트는 Android 브라우저와 USB 케이블을 우선 권장한다. USB-C–Micro-B 데이터 케이블 또는 적절한 어댑터로 연결하고, 브라우저에서 장치를 선택해 전송한다. 별도 HEX는 공식 WebUSB 도구에서 파일 선택 → 전송 → 장치 선택 → 완료 확인 순서로 넣을 수 있다. [Android 공식 안내](https://support.microbit.org/support/solutions/articles/19000065804-using-the-micro-bit-on-android), [공식 HEX 전송 도구](https://microbit.org/tools/webusb-hex-flashing/)

케이블이 없으면 공식 Android 앱에서 MakeCode 프로그램을 Bluetooth로 보낼 수 있다. 다만 **우리 앱에서 내려받은 고정 HEX를 Android 앱으로 전달하는 정확한 가져오기 경로는 미검증**이다. iOS의 공유 메뉴 절차를 Android에 그대로 복사하지 않는다. USB 전송 후 기존 페어링 정보가 맞지 않으면 공식 안내의 장치 등록 해제·재페어링 절차를 참고한다. [Android 앱 및 문제 해결](https://support.microbit.org/support/solutions/articles/19000065804-using-the-micro-bit-on-android)

### 3.2. iPhone·iPad: 공식 앱으로 HEX 전달

공식 iOS 안내에는 두 경로가 있다. 문서의 UI 명칭은 실제 앱 버전에 따라 재확인이 필요하다.

1. **MakeCode 프로젝트:** Chrome의 MakeCode에서 다운로드 → micro:bit 앱 열기 → 앱 안에서 프로그램 전송. 이는 MakeCode의 앱 연계 기능이며 임의 센서 HEX 링크가 같은 방식으로 자동 실행된다는 뜻은 아니다. [공식 iOS 안내](https://support.microbit.org/support/solutions/articles/19000117215-micro-bit-ios-app-creating-and-sending-programs-on-an-apple-ipad-or-iphone)
2. **MakeCode에서 열리지 않는 HEX:** Chrome에서 다운로드 → `Open in…`의 micro:bit 앱 선택 → 편집기에서 파일 인식 오류가 나면 앱 홈으로 돌아가기 → `My programs`에서 가져온 파일 선택 → `Send to micro:bit` → 전송용 모드·페어링 안내에 따라 전송. 편집기 인식 실패와 전송 가능 여부가 다르다는 점이 핵심이다. [공식 HEX 파일 전송 안내](https://support.microbit.org/support/solutions/articles/19000157424)

두 번째 안내의 원래 `/a/solutions/` 링크는 조사 시 로딩 화면만 반환했다. 위 공개 `/support/solutions/` 주소에서는 본문을 확인했다(문서 수정일 2024-02-15).

참고로 V2 Python HEX는 다운로드한 파일을 공유 메뉴로 공식 앱에 보내는 별도 안내도 있다. 이 안내가 Safari를 예로 든다고 해서 모든 HEX에 같은 전달 경로가 보장되지는 않는다. **센서별 배포 HEX가 어느 경로로 열리고 전달되는지를 먼저 확인한다.** [공식 Python HEX 안내](https://support.microbit.org/support/solutions/articles/19000139629-python-editor-using-the-micro-bit-ios-app-to-flash-the-micro-bit-with-an-ipad)

### 3.3. 설치 성공과 측정 지원은 별도

iOS 공식 앱의 무선 전송 성공은 이 웹앱의 실시간 측정 지원을 뜻하지 않는다. 조사 시 MDN 호환성 데이터는 Safari/iOS Safari의 Web Bluetooth 미지원을 표시한다. Android Chrome의 Web Bluetooth 지원과도 구분해야 한다. 현재 앱의 측정 가능 여부는 `navigator.bluetooth.requestDevice` 등 실제 기능으로 판단하고, 설치·측정·파일 분석을 한 개의 모바일 지원 여부로 묶지 않는다. [MDN 호환성 데이터](https://github.com/mdn/browser-compat-data/blob/main/api/Bluetooth.json), [Chrome Web Bluetooth 설명](https://developer.chrome.com/docs/capabilities/bluetooth)

따라서 iOS에서는 우선 “장치에 프로그램을 넣는 보조 경로”로 검토한다. 설치 후 지원되는 다른 기기에서 측정하거나, 저장 파일을 분석하는 경로를 구분해 안내해야 한다. iOS에서 설치부터 실시간 측정까지 완결하려면 별도 연결 수단의 설계·검증이 필요하다.

**측정용 브라우저 대안(2026-10-25 확인):** Bluefy는 iPhone·iPad에서 Web Bluetooth API를 제공한다고 개발사가 명시하며 한국 App Store에 배포되어 있다. 이 앱은 미지원 iOS 환경에서만 [Bluefy 설치 링크](https://apps.apple.com/kr/app/bluefy-web-ble-browser/id1492822055)를 표시하고, 설치 후 실험실 주소를 그 브라우저에서 다시 열도록 안내한다. iOS라는 이유만으로 막지 않고 실제 API 지원을 우선한다. [개발사 설명](https://bluefy.app/index.html)

이는 센서 프로그램의 무선 설치 기능 추가가 아니다. micro:bit에 해당 프로그램이 먼저 설치되어 있어야 하며, **Bluefy에서 이 실험실의 다섯 센서 연결·연속 수신·기록·저장은 아직 실물 미검증**이다. OS·브라우저 버전, 재연결·화면 전환·백그라운드 제한과 Web Locks·파일 저장까지 실물 인수 기준에 포함한다. 브라우저를 바꾸면 IndexedDB 자료가 자동으로 이동하지 않으므로 실험 파일 내보내기·가져오기로 옮긴다.

## 4. 권장 구현 순서 — 후속 제안

2026-10-26 후속 계획 분리에 따라 설치 개선은 [M6](unified-sensor-lab-plan.md#101-후속-단계와-미구현-작업)에서 관리한다. 아래 2번은 M6-1, 3번은 M6-2에 대응한다. 4번의 앱 내부 무선 설치 타당성 검토는 별도 검토 목록이며 M6 완료 조건에 포함하지 않는다. 이미 적용한 USB 안내 통합은 미구현 작업에서 제외한다. 무선 설치·네이티브 앱 제작은 아직 채택하지 않았다.

| 순서 | 과제 | 완료 조건 |
|---|---|---|
| 1 (적용) | USB 확인 단계를 프로그램 설치 화면에 통합 | 데이터 케이블 그림·안내, 설치/기설치 선택, 설치 오류·재시도 유지. 과거 USB 확인 ID는 재사용하지 않으며 기존 기록을 변경하지 않는다. |
| 2 | 설치 환경별 안내와 고정 HEX 다운로드 | “노트북” 한정 문구를 정리한다. WebUSB 가능 여부로 직접 설치를 제공하고, 다른 방법은 보조 조작으로 제시한다. 기존 manifest의 파일·버전·검증 규칙을 재사용한다. |
| 3 | 공식 모바일 앱을 통한 외부 설치 안내 | 아래 실물 검증을 통과한 OS·센서만 안내한다. 정확한 파일 전달 방법과 설치 후 복귀 경로를 제공한다. |
| 4 | 앱 내부 무선 설치 타당성 판단 | 기존 네이티브 구현 재사용 가능성과 유지 비용, 프로그램 설정 변경·측정 호환성을 별도 설계한다. 당장 자체 DFU 엔진을 만들지 않는다. |

새 UI를 적용한다면 주 조작은 `USB로 프로그램 설치`, 보조 조작은 `프로그램 파일 받기`와 `다른 설치 방법`, 기설치 경로는 `이미 올바른 프로그램이 있어요`를 후보로 둔다. 지원되지 않는 환경에 실제로 동작하지 않는 설치 버튼을 주 행동으로 남기지 않는다. Bluetooth 안내는 필요한 경우에만 열고 공통 준비 단계를 다시 늘리지 않는다.

현재 공개된 공식 연결 라이브러리 문서는 USB 전송은 웹, Bluetooth 전송은 Capacitor 네이티브 iOS/Android 경로로 구분한다. **현재 앱의 고정 1.0.0 번들과 공개 최신 문서는 동일한 계약으로 간주하지 않는다.** 단순 버전 교체나 PWA 설치만으로 웹 Bluetooth 전송·iOS 측정이 생기지 않는다. [라이브러리 플랫폼 지원표](https://microbit-foundation.github.io/microbit-connection/)

## 5. 재사용 및 상태 경계

- 센서별 파일·코덱·명령은 현재 manifest/센서 모듈에 둔다. USB와 다운로드용 프로그램 목록을 복제하지 않는다. 센서별 if 문을 공통 UI에 늘리지 않는다.
- 외부 전송은 우선 사용자 안내와 고정 파일 제공으로 다룬다. OS/브라우저 이름은 도움말 선택의 보조 정보이며, 실제 권한·보안 컨텍스트·API 판정을 대체하지 않는다.
- 다운로드 성공·공유 완료·외부 앱에서 돌아왔다는 사실은 `installedThisSession`이나 `device-observed` 근거가 아니다. 확인된 외부 설치 결과를 직접 받을 계약이 없으면 기존 `user-confirmed` 경로를 사용한다.
- 설치 뒤 기존 측정 연결과 새 연결을 구분하고, 실제 새 수신으로 측정 준비를 확인한다. UART 값이 정상이어도 프로그램 버전·설치 대상 장치의 동일성을 증명한 것으로 저장하지 않는다.
- 기록 중 외부 설치를 권하지 않는다. Session의 기록 종료, RunStore 저장, Transport 연결 해제는 기존 소유자가 맡는다. 안내 페이지 이동·모바일 앱 전환에서 원자료·분석·입력 초안이 유실되지 않아야 한다.
- 페어링/보안 설정을 바꾸려면 파일 해시·프로그램 버전·기존 BLE 연결 동작까지 영향을 검토한다. 현재 적용 범위는 USB 안내의 설치 단계 통합이며 HEX·설치기·무선 전송 방식은 변경하지 않는다.

## 6. 실물 검증 과제와 인수 기준

첫 실험은 외부 배선이 없는 **내장 온도**로 시작하고, 성공 후 나머지 센서로 넓힌다. 테스트 기록에는 OS·브라우저·공식 앱 버전, 보드 리비전, 기존/대상 HEX 이름·버전·해시, 전원, 실제 절차와 결과를 남긴다. 다음 항목은 모두 미수행이다.

| 검증 대상 | 확인할 내용 |
|---|---|
| 시작 프로그램 | 출고 프로그램, 간단한 MakeCode, 우리 온도 프로그램, Python 프로그램에서 전송 모드 진입·복구 차이 |
| 버튼 진입 | 리셋 세 번, A+B+리셋, A+B를 누른 채 전원 연결의 실제 동작. 모든 HEX에서 같다고 가정하지 않음 |
| iOS 파일 전달 | iPhone/iPad 각각 고정 HEX 다운로드·공유·My programs 노출·전송. MakeCode 편집 시 원본이 재컴파일되는 경로와 직접 전송을 구분 |
| Android 경로 | Chrome USB 데이터 케이블·어댑터·권한·완료, 공식 앱의 외부 HEX 가져오기 및 무선 전송 |
| 첫 설치 후 재설치 | 우리 프로그램 설치 후에도 전송 모드로 재진입해 다른 센서로 바꾸거나 되돌릴 수 있는지. `pairing_mode:0`의 영향 포함 |
| 다섯 센서 | BMP280·자기장 v2·온도·밝기·가속도별 전송, UART 시작 명령·채널·단위·보정 흐름. 게이뤼삭은 BMP280 프로그램 재사용을 확인 |
| 실패 복구 | 취소, Bluetooth 권한 거부, 전송 중 연결 단절, 앱 전환·종료, 배터리 부족 후 재시도 또는 USB 복구. 성공으로 오표시하지 않음 |
| 교실의 여러 보드 | 선택한 보드만 변경되는지, 전송 모드 장치가 여러 대인 경우의 식별·오선택 방지 |
| 설치 후 수업 | 지원 기기에서 새 수신 → 기록 → 저장 → 분석. 외부 앱 연결을 정리한 뒤 재연결, 탭 복귀·새로고침의 자료 보존 |

여러 보드 검증에는 구체적 근거가 있다. 공식 라이브러리는 open-link 펌웨어의 iOS DFU에서 여러 보드가 부트로더 모드이면 다른 장치를 선택할 위험을 기록한다. 이는 **해당 라이브러리 경로의 알려진 제한**이며 공식 모바일 앱 전체에 그대로 발생한다고 단정하지 않는다. 우리 설정과의 관계를 확인하고, 확인 전 실험은 보드 한 대로 진행한다. [공식 알려진 제한](https://microbit-foundation.github.io/microbit-connection/#known-limitations)

## 7. 검증·문서 유지 기준

이번 결과는 공식 문서 및 로컬 코드 확인이다. 일반 문서에 기재된 지원을 우리 HEX의 실물 통과로 보고하지 않는다. 앱/OS 지원과 파일 공유 절차는 바뀔 수 있으므로 구현 착수 때 공식 문서를 다시 확인한다. 문서의 수정일과 이번 조사일을 구분한다.

후속 구현에서는 기존 programmer·준비 진행·파일 검증·저장 보존 테스트를 보완한다. 모바일 실물 전송은 데스크톱 모의 테스트로 대체하지 않는다. 일회성 파일 전달 실험 도구는 종료 후 제거하고, 유효한 실패/복귀 계약만 회귀 검사에 남긴다.

설치 경로를 실제 제공할 때 [기획](unified-sensor-lab-plan.md)과 [기술 설계 §6.3](unified-sensor-lab-architecture.md#63-usb-설치식별)의 해당 계약만 갱신한다. 현재 기본 경로인 USB 설치 → Bluetooth 측정은 유지한다.
