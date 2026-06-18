# Forking Guide

이 문서는 이 저장소를 포크해서 자기만의 micro:bit 센서 웹앱을 만들고 싶은 개발자를 위한 안내다. 설정만 조금 바꾸는 수준을 넘어, 수업 주제나 실험 목적에 맞게 펌웨어와 웹 UI를 함께 다듬는 상황을 기준으로 한다.

## 어떤 프로젝트에 적합한가

이 템플릿은 다음과 같은 프로젝트에 잘 맞는다.

- micro:bit가 하나 이상의 센서 값을 주기적으로 보내는 프로젝트
- 브라우저에서 실시간 값, 차트, 로그, CSV 저장을 보여 주고 싶은 프로젝트
- GitHub Pages처럼 정적 호스팅으로 배포하고 싶은 프로젝트
- 학생이나 교사가 코드를 읽고 고쳐볼 수 있어야 하는 교육용 프로젝트

서버 저장, 사용자 계정, 여러 장치 동시 연결, 복잡한 바이너리 통신이 필요한 프로젝트라면 이 템플릿을 출발점으로 삼되 구조를 더 크게 바꿔야 할 수 있다.

## 포크 후 처음 확인할 것

1. `?mock=1`로 웹앱이 브라우저에서 정상 표시되는지 확인한다.
2. 기본 Magnetometer 예제를 MakeCode에서 빌드해 실제 micro:bit 연결 흐름을 확인한다.
3. 웹앱 **실험 설정**의 필드 순서와 `firmware/examples/magnetometer.js`의 전송 순서를 비교해 본다.
4. README와 사용 안내 문구에서 프로젝트 이름, 대상 사용자, 실험 목적에 맞지 않는 표현을 표시해 둔다.

이 과정을 거치면 무엇을 설정으로 해결할지, 무엇을 UI나 펌웨어 코드로 바꿔야 할지 감이 잡힌다.

## 센서 데이터 모델 정하기

먼저 웹앱이 보여 줄 값을 정한다.

- 각 값의 이름: 예를 들어 `temperature`, `light`, `humidity`
- 표시 이름과 단위: 예를 들어 `온도`, `C`
- 표시 자리수: 정수인지 소수 한 자리인지
- 차트에 처음부터 보여 줄 값
- CSV에 남기고 싶은 값

이 결정은 웹앱 **실험 설정** 또는 포크 프로젝트의 기본 설정에 반영된다. 필드 순서는 펌웨어가 보내는 CSV 값 순서와 같아야 한다.

## 펌웨어와 웹앱을 함께 바꾸는 흐름

1. `firmware/template.js` 또는 가까운 예제를 복사한다.
2. `sendSample()`에서 보낼 값을 정하고 comma로 이어 보낸다.
3. 시작 명령을 정한다. 새 프로젝트는 보통 `start`를 쓰면 충분하다.
4. 웹앱 **실험 설정**의 시작 명령, CSV 필드, 기본 표시 항목을 맞춘다.
5. 보정이나 준비 시간이 필요한 센서라면 `connectionText`를 프로젝트 상황에 맞게 바꾼다.
6. `?mock=1`로 UI를 먼저 보고, 그 다음 실제 micro:bit로 확인한다.

펌웨어와 웹앱 중 하나만 먼저 크게 바꾸기보다, 작은 데이터 한 줄이 끝까지 표시되는지 확인하면서 넓혀 가는 편이 안전하다.

## MakeCode Bluetooth 설정 확인

이 웹앱은 Web Bluetooth로 micro:bit의 **Bluetooth UART service**에 연결한다. MakeCode 공식 문서에서는 UART를 `bluetooth.startUartService()`로 시작하는 Bluetooth service로 설명하며, 다른 장치가 이 service를 사용하려면 micro:bit의 Bluetooth 연결 설정이 맞아야 한다.

MakeCode 프로젝트를 새로 만들거나 공유 프로젝트를 갱신할 때는 다음 설정을 먼저 확인한다.

1. MakeCode 편집창 오른쪽 위 톱니바퀴 메뉴에서 **Project Settings**를 연다.
2. Bluetooth 항목에서 **No Pairing Required: Anyone can connect via Bluetooth.** 옵션을 선택한다.
   - 한국어 UI에서는 `페어링이 필요하지 않습니다. 누구나 블루투스를 통해 연결할 수 있습니다.`로 보일 수 있다.
3. 설정을 저장한 뒤 **Download**로 HEX를 다시 만들고 micro:bit에 플래시한다.

이 설정만으로 Web Bluetooth GATT 연결이 안정되지 않으면 같은 설정창에서 **Edit Settings As text**를 열고 `yotta.config.microbit-dal.bluetooth` 값을 아래처럼 만든다.

```json
"yotta": {
  "config": {
    "microbit-dal": {
      "bluetooth": {
        "enabled": 1,
        "open": 1,
        "pairing_mode": 0,
        "whitelist": 0,
        "security_level": null
      }
    }
  }
}
```

여기서 특히 중요한 값은 `"pairing_mode": 0`이다. `pairing_mode`가 켜져 있으면 micro:bit가 페어링 절차를 기대하는 설정으로 빌드될 수 있고, Web Bluetooth로 바로 UART service에 붙는 흐름에서는 브라우저나 OS에 남아 있는 예전 페어링 정보와 충돌할 수 있다. 이 프로젝트처럼 브라우저가 micro:bit를 선택한 뒤 곧바로 Bluetooth UART service에 연결하는 UX에서는 `open: 1`, `pairing_mode: 0`, `whitelist: 0` 조합으로 “페어링 없이 연결 가능한 프로젝트”임을 분명히 맞춰 두어야 원활하게 연결될 수 있다.

저장 후 다시 HEX를 다운로드해 micro:bit에 플래시한다. 이미 OS나 브라우저에 예전 Bluetooth 정보가 남아 있으면, OS Bluetooth 설정에서 기존 micro:bit 페어링을 삭제한 뒤 다시 연결한다.

참고 문서: MakeCode [Bluetooth UART Service](https://makecode.microbit.org/reference/bluetooth/start-uart-service), MakeCode [Bluetooth Pairing](https://makecode.microbit.org/reference/bluetooth/bluetooth-pairing), Cardboard Robots [LOFI Control App](https://cardboard.lofirobot.com/lofi-control-app-info/?__im-cjwrbpjo=15768850763210836362)

## UI를 특화할 때 볼 파일

- `index.html`: 화면에 보이는 기본 구조와 사용 안내 모달
- `styles.css`: 레이아웃, 색상, 카드와 로그 스타일
- `js/ui/live-stats.js`: 최신 값 카드
- `js/ui/sensor-chart.js`: 차트 표시
- `js/ui/data-log.js`: 로그 테이블과 CSV 다운로드
- `js/ui/connection-panel.js`: 연결 상태, 안내 문구, 오류 메시지

대부분의 프로젝트는 실험 설정의 압축 공유 링크, QR 코드, 안내 문구만으로도 충분히 다른 수업용 앱처럼 사용할 수 있다. 포크해서 기본값이나 화면 레이아웃까지 바꾸려면 `sensor-config.js`, `index.html`, `styles.css`를 조정하면 된다.

## 프로토콜을 유지할지 바꿀지

기본 CSV 프로토콜은 값 개수가 정해져 있고 모두 숫자인 프로젝트에 적합하다.

CSV를 그대로 쓰면 좋은 경우:

- 한 줄에 한 샘플이면 충분하다.
- 값의 의미가 `fields` 순서로 설명된다.
- 브라우저가 받은 시각을 timestamp로 써도 된다.

다른 형식을 고민할 만한 경우:

- 센서 상태, 오류, 보정 진행률 같은 메시지를 자주 보내야 한다.
- 샘플마다 필드 구성이 달라진다.
- 여러 종류의 이벤트를 구분해야 한다.
- timestamp를 micro:bit 쪽에서 직접 보내야 한다.

이 경우에도 먼저 `docs/protocol.md`의 CSV v1을 이해한 뒤, 필요한 만큼만 확장하는 것을 권장한다.

## 배포 전 체크리스트

- `?mock=1`에서 필드 수를 바꿔도 카드, 차트, 로그가 자연스럽게 보이는가
- 실제 micro:bit에서 첫 데이터가 들어오는가
- CSV 다운로드 파일명과 헤더가 프로젝트에 맞는가
- 사용 안내 모달과 README가 실제 펌웨어/센서와 맞는가
- GitHub Pages 또는 정적 서버에서 HTTPS로 열리는가
- 원본 Magnetometer 프로젝트 이름이나 링크가 의도치 않게 남아 있지 않은가

문서를 완벽하게 길게 쓰는 것보다, 사용자가 처음 실행하고 개발자가 다음 수정 지점을 찾을 수 있게 유지하는 것이 중요하다.
