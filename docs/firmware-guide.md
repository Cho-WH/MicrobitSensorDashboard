# MakeCode 펌웨어 준비 가이드

이 문서는 웹앱의 **MakeCode에서 편집하기** 버튼을 눌렀을 때 사용자가 어떤 순서로 MakeCode 프로젝트를 열고, 필요한 만큼 수정하고, HEX 파일을 받아 micro:bit에 넣는지 안내한다.

## 전체 흐름

1. 웹앱 **사용 안내**에서 MakeCode 공유 프로젝트를 새 탭으로 연다.
2. MakeCode 편집창에서 템플릿 코드를 확인하거나 고친다.
3. MakeCode의 **Download** 버튼으로 `.hex` 파일을 받는다.
4. micro:bit에 HEX를 넣고 대시보드에서 **디바이스 연결**을 누른다.

## 1. 웹앱에서 MakeCode 열기

1. 대시보드 상단의 **사용 안내**를 연다.
2. **MakeCode에서 편집하기** 버튼을 누른다.
3. 새 탭에서 MakeCode 편집창이 열리고 템플릿 프로젝트가 로드될 때까지 기다린다.
4. 필요한 부분을 확인하거나 수정한 뒤 **Download** 버튼으로 HEX 파일을 받는다.

이 웹앱의 버튼은 MakeCode `#pub` 공유 링크를 열기 때문에 사용자가 따로 **Edit** 버튼을 찾을 필요가 없다. 새 탭에 편집 화면이 뜨면 코드를 그대로 쓰거나, 필요한 부분만 고친 뒤 바로 다운로드하면 된다.

진행 단계:

`사용 안내 열기` → `MakeCode에서 편집하기` → `편집창에서 확인/수정` → `Download`

## 2. MakeCode에서 확인할 것

기본 magnet 예제는 웹앱과 통신하기 위해 Bluetooth UART로 `x,y,z,strength` 순서의 숫자 CSV 한 줄을 보낸다. 처음에는 블록을 많이 바꾸기보다, 값이 어떤 순서로 전송되는지만 확인해도 충분하다.

필수 규칙:

- 웹앱이 연결되면 펌웨어는 시작 명령 `start`를 받는다.
- micro:bit는 센서 값을 쉼표로 구분한 한 줄 CSV로 보낸다.
- 값의 개수와 순서는 웹앱 **실험 설정**의 CSV 필드 순서와 같아야 한다.

MakeCode 블록 캡처 자리:

- 기본 magnet 예제의 `sendSample` 블록 부분
- 후에 실제 MakeCode 블록 캡처로 교체
- HTML 문서에서는 넉넉한 크기의 placeholder로 표시

MakeCode 블록이 `x,y,z,strength` 순서로 값을 보내면, 웹앱의 **실험 설정**도 같은 순서로 둔다. 색상 선택, 위아래 이동, 삭제, 기본 표시 체크박스는 핵심 흐름에서 생략한다.

| CSV 키 | 화면 이름 | 단위 | 소수점 |
| --- | --- | --- | --- |
| `x` | X 축 | uT | 2 |
| `y` | Y 축 | uT | 2 |
| `z` | Z 축 | uT | 2 |
| `strength` | Strength | uT | 1 |

## 3. HEX 파일을 micro:bit에 넣기

1. micro:bit를 USB 케이블로 컴퓨터에 연결한다.
2. 컴퓨터에 **MICROBIT** 드라이브가 나타나는지 확인한다.
3. MakeCode 화면 아래쪽의 **Download** 버튼을 누른다.
4. 브라우저가 받은 `microbit-xxxx.hex` 파일을 **MICROBIT** 드라이브로 복사한다.
5. 복사가 끝나면 micro:bit가 자동으로 다시 시작한다. LED 표시가 안정될 때까지 잠시 기다린다.

참고: MakeCode에서 WebUSB 페어링을 사용하면 Download 버튼으로 바로 전송할 수도 있다. 수업 안내에서는 가장 익숙하고 기기 차이가 적은 `.hex` 파일 복사 흐름을 기본으로 설명한다.

## 4. 웹앱으로 돌아와 연결하기

1. 대시보드 탭으로 돌아온다.
2. **디바이스 연결** 버튼을 누르고 목록에서 **BBC micro:bit**를 선택한다.
3. Bluetooth 또는 위치 권한 요청이 나오면 허용한다. Android에서는 위치 권한이 켜져 있어야 검색된다.
4. 첫 데이터가 들어오면 카드, 그래프, 데이터 로그가 자동으로 바뀐다.
5. 수업 기록이 필요하면 화면 하단의 **CSV 다운로드** 버튼을 누른다.

## 참고 자료

- [MakeCode: Sharing your project](https://makecode.microbit.org/share)
- [MakeCode: Downloading a program to the micro:bit](https://makecode.microbit.org/courses/csintro/making/activity)
- [MakeCode: WebUSB](https://makecode.microbit.org/device/usb/webusb)
