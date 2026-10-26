# 센서 프로그램 소스와 예제

이 폴더에는 앱에 배포하는 내장 센서 프로그램의 소스와 빌드 전용 예제가 있습니다. 학생용 설치는 앱에서 제공하는 고정 HEX를 사용합니다.

| 소스 | 용도 |
|---|---|
| [magnetometer.js](magnetometer.js) | 앱에서 보정 시작·생략을 선택하는 자기장 v2 |
| [temperature.js](temperature.js) | 내장 보드 온도 |
| [light-level.js](light-level.js) | 내장 상대 밝기 |
| [accelerometer.js](accelerometer.js) | 내장 가속도 X/Y/Z·크기 |
| [temperature-light.js](temperature-light.js) | 온도·밝기 결합 예제. 빌드 전용이며 앱 센서로 등록하지 않음 |

시작 명령·상태 응답·CSV 순서·명목 송신 간격은 [고정 빌드와 센서별 통신 규약](../../dev/firmware/README.md)을 따릅니다. 자기장 v2는 일반 예제의 start 흐름과 다릅니다. 명목 대기 간격은 실제 수신 주기를 보증하지 않습니다.

새 프로그램은 [template.js](../template.js)를 출발점으로 검토할 수 있습니다. 현재 앱의 채널·단위·해석은 [센서 모듈](../../src/catalog/README.md)에 등록하며 옛 대시보드의 설정 파일을 수정하지 않습니다. 소스 수정 뒤에는 고정 빌드·검증을 거쳐 설치 허용 목록과 배포 HEX를 함께 갱신해야 합니다.

BMP280는 이 폴더의 공통 빌드 대상이 아니며 원본의 고정 HEX를 사용합니다. [출처와 라이선스](../../public/firmware/NOTICES.md)를 참고하세요.
