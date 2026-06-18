# Firmware Examples

MakeCode JavaScript에서 열어 쓸 수 있는 간단한 예제들입니다.

새 센서를 처음 만들 때는 상위 폴더의 `template.js`를 복사하고 `sendSample()`만 바꾸는 방식을 권장합니다.

## `magnetometer.js`

기본 예제입니다. 범용 템플릿의 첫 실행 확인용으로 두고, 새 센서를 만들 때는 `template.js`를 복사해 시작하는 것을 권장합니다.

- 시작 명령: `magnet` 또는 `start`
- 전송 순서: `x,y,z,strength`
- 웹앱 기본 설정과 호환됩니다.

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
