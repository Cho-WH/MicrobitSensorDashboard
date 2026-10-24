# BMP280 배선 3D 안내 출처

준비물 이미지와 같은 형상을 쓰도록 BMP280·확장 보드·연결선 끝·헤더의 생성 함수를
`../../assets/devices/bmp280/model.js`로 분리했다. 배선 뷰어도 이 함수를 직접 가져온다.

`index.html`, `embed.css`, `embed-bridge.js`는 [Cho-WH/bme280](https://github.com/Cho-WH/bme280)의 commit `59c5c149450f970bace2deaa183857c275595853`, `bmp280-wiring/`에서 가져왔다. 처음에는 바이트 단위로 복사했으며, 공통 장치 자산 추가 시 HTML의 인라인 번들을 `scene.js`와 `../../vendor/three-r180.js`로 분리했다. 기존 장면 동작과 bridge는 유지하며 추가 모델·텍스처·CDN을 요구하지 않는다. 추출 절차와 새 자산은 [공통 장치 자산](../../assets/devices/README.md)을 따른다.

내장 Three.js revision 180의 저작권 및 MIT 라이선스 고지는 공유 런타임과 `three-r180-LICENSE.txt`에 보존되어 있다: Copyright 2010–2025 Three.js Authors, SPDX-License-Identifier: MIT. 원 저장소의 사용자 작성 뷰어·bridge·스타일에는 별도 최상위 라이선스가 확인되지 않았다. Three.js의 MIT 라이선스를 사용자 작성 코드 전체의 라이선스로 확대 해석하지 않는다.

| 파일 | SHA-256 (원본 바이트) |
| --- | --- |
| index.html | `3212905c9963dd360791a43f1b7500bddd4dbeffcafee2f5153bda1fdd61fe47` |
| embed.css | `882f56dd390a31868fb9cb6b36e9b4efe978496a0373d1cc2cf89a331cf5b0de` |
| embed-bridge.js | `2cc57ff3dfbb8a3fee03a7608aa6890ec588f536ff756d5ef37c9297a7aa040b` |

앱의 `src/guide/viewer-adapter.js`는 원본 메시지 계약을 유지한다. iframe은 사용자가 BMP280의 3D 안내를 열 때 생성된 주소로 로드한다. 다른 출처·다른 창·알 수 없는 응답·오래된 요청의 메시지를 무시하며, 실패 시 앱의 배선 표로 준비를 계속할 수 있다.
