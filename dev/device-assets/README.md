# 기존 3D 런타임 분리

`extract-legacy.mjs`는 기존 BMP280 HTML의 Three.js r180와 OrbitControls를
공유 ESM으로 분리한 재현용 도구다. TypeScript 파서를 이미 설치된 개발 의존성에서 사용한다.

```sh
node dev/device-assets/extract-legacy.mjs /path/to/original/bmp280-wiring/index.html
```

입력은 `public/assets/devices/README.md`에 기록한 **원본 번들**이어야 한다.
이미 분리된 현재 HTML에는 실행할 수 없다. 생성 대상은 공유 런타임·기존 장면·기하 도우미이며
본체·USB·배터리의 새 모델은 덮어쓰지 않는다. BMP280·확장 보드·연결선 끝 형상은
`public/assets/devices/bmp280/model.js`로 분리해 기존 배선 뷰어와 이미지 생성기가 함께 쓴다.
원본 해시는 manifest에 보존한다.

## 안내 이미지 재생성

1. `npm run dev`로 로컬 앱을 실행하고 `/dev/device-assets/render-posters.html`을 연다.
2. 생성된 그림을 확인하고 변경한 모델에 해당하는 저장 링크로 PNG를 받는다.
   `board`, `usb`, `battery`, `bmp280`, `expansion-board`, `jumper-wires` 여섯 종류다.
3. `public/assets/devices/posters/`의 같은 파일을 교체한다. 본체는 1440×600, 연결 그림은 1440×900 투명 PNG다.
4. `public/assets/devices/manifest.json`의 `assetVersion`과 `posters.sourceAssetVersion`을 함께 갱신한다.

생성기는 `createDeviceScene`과 기존 BMP280의 공통 부품 함수를 직접 사용한다. 장치 형상을 복제하거나 별도로 수정하지 않는다.
시점·조명·여백 변경은 `render-posters.js`에서 관리한다. 이 개발용 페이지는 빌드에 포함하지 않는다.
