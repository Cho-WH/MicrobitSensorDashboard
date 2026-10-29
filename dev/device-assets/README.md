# 기존 3D 런타임 분리

`extract-legacy.mjs`는 기존 BMP280 HTML의 Three.js r180와 OrbitControls를
공유 ESM으로 분리한 재현용 도구다. TypeScript 파서를 이미 설치된 개발 의존성에서 사용한다.

```sh
node dev/device-assets/extract-legacy.mjs /path/to/original/bmp280-wiring/index.html /path/to/new-output
```

입력은 `public/assets/devices/README.md`에 기록한 **원본 번들**이어야 한다.
이미 분리된 현재 HTML에는 실행할 수 없다. 초기 이식 결과를 **새 출력 폴더**에 재현하는 도구다.
현재 유지보수하는 모델과 공통 배선 뷰어를 덮어쓰는 갱신 도구가 아니다.
BMP280·sensor:bit·연결선 끝은 현재 각각의 모델·공통 connector 모듈로 분리되어 있다.
원본 해시는 manifest에 보존한다.

## 안내 이미지 재생성

1. `npm run dev`로 로컬 앱을 실행하고 `/dev/device-assets/render-posters.html`을 연다.
2. 생성된 그림을 확인하고 변경한 모델에 해당하는 저장 링크로 PNG를 받는다.
   `board`, `usb`, `battery`, `reset`, `bmp280`, `expansion-board`, `jumper-wires`와
   `ds18b20`, `terminal-3p`, `sensor-temperature`, `sensor-motion`, `sensor-light`를 제공한다.
   `?only=ds18b20,terminal-3p`처럼 지정하면 바뀐 모델만 생성한다.
3. `public/assets/devices/posters/`의 같은 파일을 교체한다. 본체·리셋 확대는 1440×600, 연결 그림은 1440×900 투명 PNG다.
4. `public/assets/devices/manifest.json`의 `assetVersion`을 갱신한다. 전체 재생성 시 `posters.sourceAssetVersion`,
   일부만 생성했으면 `posters.sourceVersions`에 해당 이미지의 원본 버전을 기록한다.

생성기는 `createDeviceScene`과 기존 BMP280의 공통 부품 함수를 직접 사용한다. 장치 형상을 복제하거나 별도로 수정하지 않는다.
시점·조명·여백 변경은 `render-posters.js`에서 관리한다. 이 개발용 페이지는 빌드에 포함하지 않는다.
`reset`은 USB 포트·리셋 버튼·배터리 잭 주변을 확대하며, 실제 모델의 버튼 좌표를 투영해 화살표를 표시한다.
센서 위치 그림은 1440×1100 투명 PNG다. 같은 모델과 주황색 화살표를 사용하고,
온도·통합 센서는 `boardSpec.parts` 좌표를 투영한다. 밝기는 앞면 LED 배열을 표시한다.
센서 그림 추가 버전은 1.3.6이며 기존 모델 형상은 바뀌지 않았다.

추가로 `calibration`은 자기장 보정 시범의 시작 자세를 같은 장면에서 생성한다.
`src/catalog/sensors/magnetometer/calibration.png`에 저장하며 공통 모델의 `assetVersion` 1.3.5을 사용한다.
보정 시범의 시점·조명·모델이 바뀌면 이 그림도 함께 갱신한다.
