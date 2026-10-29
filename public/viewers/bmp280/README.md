# BMP280 배선 3D 안내 출처

이 문서는 초기 이식 출처를 보존한다. 실행 자원은 [공통 배선 뷰어](../wiring/index.html?sensor=bmp280)로 대체했다.
BMP280·확장 보드·연결선 끝·헤더의 생성 함수는 [공통 장치 자산](../../assets/devices/README.md)에서 관리한다.

`index.html`, `embed.css`, `embed-bridge.js`는 [Cho-WH/bme280](https://github.com/Cho-WH/bme280)의 commit `59c5c149450f970bace2deaa183857c275595853`, `bmp280-wiring/`에서 가져왔다. 처음에는 바이트 단위로 복사했으며, 공통 장치 자산 추가 시 HTML의 인라인 번들을 `scene.js`와 `../../vendor/three-r180.js`로 분리했다. 기존 장면 동작과 bridge는 유지하며 추가 모델·텍스처·CDN을 요구하지 않는다. 추출 절차와 새 자산은 [공통 장치 자산](../../assets/devices/README.md)을 따른다.

내장 Three.js revision 180의 저작권 및 MIT 라이선스 고지는 공유 런타임과 `three-r180-LICENSE.txt`에 보존되어 있다: Copyright 2010–2025 Three.js Authors, SPDX-License-Identifier: MIT. 원 저장소의 사용자 작성 뷰어·bridge·스타일에는 별도 최상위 라이선스가 확인되지 않았다. Three.js의 MIT 라이선스를 사용자 작성 코드 전체의 라이선스로 확대 해석하지 않는다.

| 파일 | SHA-256 (원본 바이트) |
| --- | --- |
| index.html | `3212905c9963dd360791a43f1b7500bddd4dbeffcafee2f5153bda1fdd61fe47` |
| embed.css | `882f56dd390a31868fb9cb6b36e9b4efe978496a0373d1cc2cf89a331cf5b0de` |
| embed-bridge.js | `2cc57ff3dfbb8a3fee03a7608aa6890ec588f536ff756d5ef37c9297a7aa040b` |

현재 뷰어는 `sensor-lab-wiring` 메시지 계약을 사용한다. 같은 출처·같은 창·요청 ID와 응답 단계를 검사하고, 네트워크/WebGL 실패 시 배선표를 제공한다. 과거 실행 코드·DOM 클릭 bridge는 유지하지 않는다.
