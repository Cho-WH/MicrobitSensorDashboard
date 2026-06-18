# Firmware Guide

이 문서는 MakeCode JavaScript에서 센서 펌웨어를 만드는 기본 흐름과, 포크 프로젝트에서 자주 하게 되는 판단을 설명한다.

## 1. 새 센서 만들기

새 센서를 만들 때 먼저 맞출 곳은 두 군데다.

1. micro:bit 펌웨어의 `sendSample()` 함수
2. 웹앱의 `js/sensor-config.js`

두 곳의 값 순서가 반드시 같아야 한다.

## 2. 기본 템플릿

기본 템플릿은 `firmware/template.js`에 있다. 새 센서를 만들 때는 이 파일을 복사하고 `sendSample()`부터 바꾸는 것을 권장한다.

```javascript
let streaming = false
let command = ""

bluetooth.startUartService()

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    command = command.trim().toLowerCase()

    if (command == "start") {
        streaming = true
        basic.showIcon(IconNames.Yes)
    } else {
        streaming = false
        basic.clearScreen()
    }
})

basic.forever(function () {
    if (streaming) {
        sendSample()
        basic.pause(1000)
    } else {
        basic.pause(50)
    }
})

function sendSample () {
    // Replace this line with your sensor values.
    bluetooth.uartWriteLine(convertToText(input.temperature()))
}
```

MakeCode 환경에서 `trim()` 또는 `toLowerCase()`가 동작하지 않는 경우에는 명령 비교를 단순하게 바꿔도 된다.

```javascript
if (command == "start") {
```

## 3. 여러 값 보내기

예를 들어 온도와 밝기를 같이 보내려면 micro:bit는 다음 순서로 전송한다.

```javascript
function sendSample () {
    bluetooth.uartWriteLine(
        convertToText(input.temperature()) + "," +
        convertToText(input.lightLevel())
    )
}
```

웹앱 설정도 같은 순서로 맞춘다.

```javascript
fields: [
  { key: 'temperature', label: '온도', unit: 'C', digits: 1 },
  { key: 'light', label: '밝기', unit: '', digits: 0 }
]
```

## 4. 포크 프로젝트에서 정할 것

특화 프로젝트를 만들 때는 다음 항목을 먼저 정하면 좋다.

- 샘플링 간격: 빠른 변화가 필요한지, 배터리와 안정성을 더 우선할지
- 시작 명령: 기본값 `start`를 쓸지, 기존 예제 호환을 위해 다른 명령을 받을지
- 보정 과정: Magnetometer처럼 사용자가 움직여야 하는 준비 단계가 있는지
- 화면 안내: 첫 데이터 전 안내 문구가 센서 상황에 맞는지
- 전송 값 순서: CSV 순서와 `sensor-config.js`의 `fields` 순서가 같은지

처음에는 값 하나를 끝까지 표시해 본 뒤 여러 값으로 늘리는 흐름을 권장한다.

## 5. HEX 빌드

저장소에는 HEX 파일을 포함하지 않는다. MakeCode에서 필요한 예제 JS를 열고 사용자가 직접 HEX를 빌드한다.

권장 흐름:

1. `firmware/template.js` 또는 `firmware/examples/*.js` 중 하나를 MakeCode에 붙여 넣는다.
2. 필요한 센서 값과 `sensor-config.js`의 `fields` 순서를 맞춘다.
3. MakeCode에서 HEX를 빌드한다.
4. 빌드한 HEX를 micro:bit에 복사한다.
5. 웹앱의 `?mock=1` 확인 후 실제 micro:bit 연결을 확인한다.

## 6. Magnetometer 예제

Magnetometer는 이 템플릿의 기본 예제다. 자기장 센서는 compass calibration이 필요할 수 있어 `firmware/examples/magnetometer.js`를 일반 템플릿과 별도로 유지한다.

- 기본 명령: `magnet`
- 기존 원본 펌웨어 전송 순서: `x,y,z,strength`
- 설정과 펌웨어 순서를 반드시 같이 확인한다.

기본 설정은 기존 펌웨어 호환을 위해 다음 순서를 사용한다.

```javascript
fields: ['x', 'y', 'z', 'strength']
```

펌웨어 전송 순서를 바꾸지 않는다면 `sensor-config.js`도 펌웨어와 같은 순서로 맞춰야 한다.
