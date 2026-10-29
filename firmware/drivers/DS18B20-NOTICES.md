# DS18B20 드라이버 출처

`ds18b20.ts`는 아래 구현을 참고·변형한 MIT 소스다. 두 구현을 외부 패키지로
설치하거나 C++ 네이티브 코드를 공통 런타임에 추가하지 않는다.
저작권·MIT 전문은 드라이버 안에 보존하여 HEX 내장 소스와 합본 TS에도 포함한다.

| 참고 소스 | 고정 버전 | 사용 범위 |
|---|---|---|
| [Tinkertanker/ELECFREAKS environment.ts](https://github.com/tinkertanker/pxt-iot-environment-kit/blob/babda2ad46be9ec861ad94e5fd258c4a938c6331/environment.ts) | v5.2.1, `babda2ad46be9ec861ad94e5fd258c4a938c6331` | 자바실험실 펌웨어의 의존 드라이버. TypeScript GPIO LOW→HIGH→입력 전환 참고 |
| [Bill Siever dstemp.cpp](https://github.com/bsiever/microbit-dstemp-2wire/blob/509e06fafc23d0cc14e0aeccb0d8fc17c72c6e68/dstemp.cpp) | `509e06fafc23d0cc14e0aeccb0d8fc17c72c6e68` | CRC-8, 9바이트 읽기, 휘발성 설정 표식, 12비트 변환 대기 참고 |

2026-10-29에 확인한 원본 파일 바이트 SHA-256:

- `environment.ts`: `165e382bd52b6f1bfc6bfb333818bf1218669cc072677a501953e61432`
- `dstemp.cpp`: `c0af0dbdd1a5d750e026f27887f8cc71884a0c4b050387629ba9160a173ce1e1`

원본 라이선스: [ELECFREAKS MIT](https://github.com/tinkertanker/pxt-iot-environment-kit/blob/babda2ad46be9ec861ad94e5fd258c4a938c6331/LICENSE),
[Bill Siever MIT](https://github.com/bsiever/microbit-dstemp-2wire/blob/509e06fafc23d0cc14e0aeccb0d8fc17c72c6e68/LICENSE.txt).
Bill의 C++ 파일은 SparkFun weather:bit 기반이라는 출처도 명시한다.

배선·내부 풀업 설정의 참고는 [자바실험실 DS18B20](https://javalab.org/ko/microbit_ds18b20/) 및
해당 페이지의 `microbit-javalab-mbl-v6.hex` 내장 소스다. 자바실험실 앱 코드·그림·HEX 자체는
이 저장소에 복제하지 않는다. 센서 규격은 [DS18B20 Rev 6, 2019-07](https://www.analog.com/media/en/technical-documentation/data-sheets/ds18b20.pdf)을 따른다.

두 참고 구현과 다른 점: 3선 별도 전원, 변환 중/완료 확인, 실패값 재사용 금지,
대기 중 연결·명령 무효화, 공통 UART·LED 수명 적용. GPIO 호출 비용과 BLE 인터럽트가
실제 슬롯 시간을 바꾸므로 원본의 실물 검증 결과를 이 포트의 검증 결과로 간주하지 않는다.
