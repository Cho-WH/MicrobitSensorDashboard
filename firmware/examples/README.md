# 센서 프로그램 소스와 예제

앱에 설치하는 센서 프로그램의 원본 소스다. 사용자에게는 앱이 제공하는 검증된 설치 파일을 안내한다.

- 동작·통신·표시 기준: [센서 프로그램 공통 동작 규약](../../docs/sensor-program-contract.md)
- 현재 버전·검증·산출물 관리: [펌웨어 빌드·배포](../../dev/firmware/README.md)
- 앱의 채널·단위·해석 등록: [센서·활동 모듈](../../src/catalog/README.md)

| 소스 | 용도 |
|---|---|
| [temperature.js](temperature.js) | 내장 보드 온도. 일반 센서의 연결·시작·중단 구조를 참고할 출발점 |
| [light-level.js](light-level.js) | 내장 상대 밝기. LED 광센서 준비와 요청 무효화 포함 |
| [accelerometer.js](accelerometer.js) | 내장 가속도 X/Y/Z·크기 |
| [magnetometer.js](magnetometer.js) | 앱에서 선택하는 보정과 이번 부팅 중 완료 기억. 통신 규약 v2 |
| [bmp280.js](bmp280.js) | 현재 앱의 BMP280 프로그램. [드라이버](../drivers/bmp280.ts)의 보정식·일괄 읽기 사용 |
| [analog-raw.js](analog-raw.js) | 개발용 P0/P1/P2 원시 ADC 예제. 물리량 환산·앱 등록 전 |
| [temperature-light.js](temperature-light.js) | 개발용 온도·밝기 결합 예제. 앱 미등록 |

등록 5종은 [공통 표시 모듈](../common/sensor-display.ts)을 함께 빌드한다. 새 센서는 `targets.json`의 `additionalSources`에 이 모듈을 포함하고, UART 준비 후 `SensorDisplay.start(true)`를 한 번 호출한다. 연결·송신·보정 전환 시 `setMode()`를 호출하며 표시를 별도로 복제하지 않는다. 조도처럼 LED를 쓰면 안 되는 측정은 `start(false)`로 지정한다. 측정 루프는 공통 `DEFAULT_SAMPLE_INTERVAL_MS`(100ms)를 사용하며 내장 온도는 1000ms 예외다.

새 프로그램은 최신 배포 소스와 공통 동작 규약을 함께 참고한다. 예제를 복사했다고 연결·취소·센서별 준비 조건이 자동 충족되는 것은 아니다. 공통 UX 규칙은 센서별로 임의 변경하지 않으며, 네이티브 입력 변경 여부는 빌드 절차에서 확인한다.

소스 수정 후 새 펌웨어의 빌드·배포와 보드 설치가 필요하다. 과거 자료의 버전·해시·원자료를 새 소스에 맞춰 변경하지 않는다. 외부 드라이버와 보존된 배포본의 [출처·라이선스](../../public/firmware/NOTICES.md)를 유지한다.
