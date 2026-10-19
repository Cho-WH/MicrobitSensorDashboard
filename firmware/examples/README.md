# Firmware Examples

MakeCode JavaScript에서 열어 쓸 수 있는 간단한 예제들입니다.

새 센서를 처음 만들 때는 상위 폴더의 `template.js`를 복사하고 `sendSample()`만 바꾸는 방식을 권장합니다.

## `magnetometer.js`

통합 센서 실험실용 자기장 v2 프로그램입니다. 앱에서 보정을 선택한 뒤 수신합니다.

- 준비 명령: `prepare`; 선택: `calibrate` 또는 `skip`; 중단: `stop`
- 상태: `@mag,2,choice`, `@mag,2,calibrating`, `@mag,2,calibrated`, `@mag,2,skipped`
- 전송 순서: `x,y,z,strength`
- 보정 완료 또는 생략 후 100ms 간격으로 µT 값을 보냅니다.
- 기존 대시보드의 `start` 규약과 다릅니다. 범용 센서는 `template.js`에서 시작하세요.
- [고정 빌드와 검증 절차](../../dev/firmware/README.md)를 사용합니다.

## `temperature.js`

온도 값 하나만 보냅니다.

- 시작 명령: `start`
- 전송 순서: `temperature`
- `js/sensor-config.js`의 `fields`도 temperature 하나로 바꾸면 됩니다.

## `temperature-light.js`

온도와 밝기를 함께 보냅니다.

- 시작 명령: `start`
- 전송 순서: `temperature,light`
- `js/sensor-config.js`의 `fields`도 같은 순서로 설정합니다.
