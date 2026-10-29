# 공통 장치 시각 자산

micro:bit V2 본체와 USB·배터리 연결에 사용하는 **편집 가능한 코드 기반 3D 자산**이다.
별도 [장치 살펴보기](../../viewers/devices/index.html)에서는 회전·확대해서 확인한다.
내장 센서 4종과 BMP280의 준비물·USB·배터리 안내에서는 같은 모델에서 생성한 PNG를 재사용하며
3D 런타임을 로드하지 않는다. BMP280·DS18B20은 배선 단계에서만 공통 배선 뷰어를 불러온다.
자기장 보정 중에는 센서 모듈의 자동 시범이 같은 본체 모델을 재사용한다. 조작용 뷰어를 띄우지 않으며 보정 시범을 볼 때만 런타임을 불러온다.
그림과 안내는 준비 완료·장치 연결 상태를 변경하지 않는다.
측정 화면의 센서 위치 안내도 같은 모델에서 생성한 정지 그림을 사용한다. 자기장·가속도는 뒷면 통합 칩,
온도는 메인 프로세서, 밝기는 앞면 LED 배열을 표시한다. 부품 역할은
[공식 V2.2 하드웨어 자료](https://tech.microbit.org/hardware/2-2-revision/)와
[보드 위치 설명](https://www.microbit.org/accessibility/full-text-tour/)을 기준으로 한다.

## 파일 배치

```text
public/assets/devices/
  manifest.json                 # 자산 ID·버전·기준·출처 목록
  microbit-v2/model.js           # 본체, 두께 있는 접점과 단자 위치
  microbit-v2/rear.js            # V2.21 사진 기반 후면 부품·회로·실크 인쇄
  microbit-v2/contact-layout.js  # 접점 구멍 위치와 표면 선의 구멍 경계 처리
  usb-micro-b/model.js           # Micro-B ↔ USB-A 케이블
  battery-2aaa/model.js          # 열린 AAA 2개 케이스, JST 플러그
  bmp280/model.js, spec.js      # BMP280 모듈과 이름 붙은 단자
  sensorbit/model.js, spec.js   # 확장 보드, 단자·인터페이스·본체 장착 위치
  ds18b20/model.js, spec.js     # 프로브와 세 가닥 리드
  terminal-3p/model.js, spec.js # SEN050007 터미널 모듈과 내부 연결
  wiring/assembly.js           # 단자·전기 연결·묶음 핀 순서 검사 (Three 의존 없음)
  wiring/scene.js              # 부품 조립, 개별/묶음/피복 케이블, 선택·분리 표시
  wiring/protocol.js           # 등록된 배선 보기 메시지 검증
  shared/connectors.js         # 핀·소켓·점퍼선 끝
  shared/legacy-primitives.js   # 기존 형상·재질·문자·소켓 도우미
  shared/cable.js               # 곡선 케이블
  scenes.js                    # 본체 / USB 연결 / 배터리 연결 조립
  posters/                     # 본체 / USB / 배터리 / BMP280 / 확장 보드 / 연결선 PNG
public/viewers/devices/         # 자산 확인·회전·확대·분리·PNG 내보내기
public/viewers/wiring/          # 공통 배선 뷰어, sensor=bmp280 또는 ds18b20
public/vendor/three-r180.js     # 기존 BMP280와 함께 사용하는 한 벌의 런타임
dev/device-assets/              # 기존 번들 추출 및 정지 이미지 생성 절차
```

모델이 형상과 부품 위치를, 장면이 배치와 연결 간격을, 뷰어가 카메라·조명·입력을 소유한다.
센서별 설명이나 준비 단계는 모델에 넣지 않는다. 카메라와 설명만 바꾸어 같은 모델을 재사용한다.
별도의 GLB·텍스처·CDN·새 런타임 패키지 설치는 필요하지 않다.

## 사용 계약

```js
import { createDeviceScene } from './scenes.js';
const device = createDeviceScene('battery'); // 'board' | 'usb' | 'battery'
scene.add(device.root);
device.setSeparation(12);       // 0–20 mm, 커넥터가 삽입축 방향으로 분리됨
device.setCellsVisible(false); // 스프링·접점·직렬 연결 확인
```

본체의 LED는 기본적으로 꺼져 있으며 개별 밝기를 지정할 수 있다. 열·행은 LED 면을 정면에서 봤을 때 왼쪽 위가 `(0,0)`, 오른쪽 아래가 `(4,4)`이고 밝기는 0–1이다.

```js
import { createMicrobitV2, setMicrobitLed } from './microbit-v2/model.js';
const board = createMicrobitV2();
setMicrobitLed(board, 2, 2, 1); // 가운데 LED 켜기
setMicrobitLed(board, 2, 2, 0); // 끄기
```

LED마다 본체 인스턴스 전용 발광 재질과 작은 반투명 빨간 빛무리를 사용한다. 빛무리는 32×32 알파 텍스처를 공유하며 꺼진 LED에서는 그리지 않는다. 한 칸의 점등은 다른 LED나 다른 본체에 영향을 주지 않으며, 광원·화면 전체 후처리를 추가하지 않는다. 밝기 변경은 장면의 다음 렌더링에 반영된다.

- 단위는 mm, 보드 중심이 원점이다. 앞면은 +Z, 상단은 +Y, 앞에서 볼 때 오른쪽은 +X다.
- `boardSpec.ports`는 소켓 입구, `boardSpec.parts`는 주요 부품의 초점 위치다.
- 플러그는 −Y 방향으로 삽입한다. 케이블·케이스의 치수는 교육용 근사다.
- 본체는 51.6 × 42 × 1.6 mm이며, 후면은 사용자가 제공한 V2.21 실물 사진을 참고했다.
  주요 부품·흰색 안내선과 로고·금색 테스트 접점을 표현한다. 작은 수동 부품과 회로선은
  식별을 돕는 단순 표현이며 전기 설계·제조용 데이터가 아니다. 다른 리비전의 모든 배치를
  대표하지 않는다. 안테나 옆 바코드·식별 스티커는 표시하지 않는다.
- 금속 접점은 앞·뒷면과 도금된 구멍 벽을 가진 한 덩어리로 만든다. PCB 구멍 벽과 접점
  벽이 겹치지 않도록 간격을 두고, 뷰어 카메라는 얇은 표면을 구별할 수 있는 깊이 범위를
  사용한다. 면의 중첩을 숨기려고 양면 재질이나 투명도를 사용하지 않는다.
  회로선과 안내선은 선 두께까지 고려해 접점 구멍 경계에서 잘라낸다.
- 큰 접점과 가는 핀은 하나의 1.27 mm 격자로 배치한다. 큰 접점은 네 칸을 차지하고
  가는 핀은 나머지 20칸에 놓인다. 큰 접점의 줄기와 가는 핀 사이의 여백·아래 끝선은
  동일하며, 가장 바깥의 두 핀만 기판 모서리의 곡선을 따른다.
- 배터리는 **1.5 V AAA 두 개의 직렬 연결(명목 3 V)**이다. 두 전지는 반대 방향이며
  음극 쪽 스프링, 반대쪽 양극 접점, 한쪽 끝의 직렬 연결 금속판과 빨강·검정 리드를 표현한다.
- LED 발광 재질 외의 재질과 문자 텍스처는 공유한다. 개별 인스턴스를 숨길 때 공유 자원을 폐기하지 않는다.
  뷰어가 완전히 종료될 때 고유 geometry/material/texture를 한 번씩 dispose한다.
- 안내용 PNG는 `dev/device-assets/render-posters.html`에서 공통 모델과 고정 시점으로 생성한다.
  [생성 절차](../../../dev/device-assets/README.md)를 따라 모델 수정 시 함께 갱신한다.
  자유 시점은 장치 페이지의 **장치 그림 저장**을 사용한다. PNG는 파생 자료이며 수정은
  모델에서 한다. 공통 자산 변경 시 `assetVersion`을 갱신하고 외형이 바뀌면 PNG와 원본 버전도 함께 갱신한다.
  1.3.5에서는 LED의 소등색을 중성 회색으로 바꾸고 본체가 포함된 안내 그림도 함께 갱신했다.
- 센서 guide는 공통 `deviceIllustrations`를 참조하고 BMP280는 센서·확장 보드·연결선 그림만 추가한다. 준비물 ID별 이미지와 USB·배터리
  그림을 등록된 센서 정의에서만 가져온다. 문구는 공통 UI 기본값·실험별 덮어쓰기 규칙을 따른다.
- BMP280와 sensor:bit 형상은 기존 모델에서 분리했으며, 연결선 끝 형상도 같은 함수를 사용한다.
  준비물 그림의 연결선은 수–암 예시다. 실제 단자 선택은 기존 준비물 도움말·배선 안내를 따른다.

## 외장 센서 연결 구성

센서별 `src/catalog/sensors/<id>/wiring.js`가 설명·단계 ID와 실제 연결 구성을 소유한다.
`wiringSetup.create(options, boardProfile)`은 부품 인스턴스와 케이블을 만들며, 안내 표와 강조할 선은 같은 `wiring` ID를 사용한다.
이 파일은 Three.js를 불러오지 않으므로 센서 선택 화면에서 3D를 미리 로드하지 않는다.

- 부품의 `spec.ports`는 이름별 위치·삽입 방향·접점 형태·커넥터 그룹·핀 순서를 가진다. 모델과 연결선은 같은 단자 정보를 참조한다.
- 확장 보드의 `interfaces`는 I2C, P1, P2 등의 역할을 그 보드의 실제 단자 ID로 매핑한다. `microbitPose`는 본체 장착 위치다.
  다른 보드는 spec과 모델을 등록해 교체한다. 지원하지 않는 인터페이스는 오류로 처리하며, 임의 핀으로 대체하지 않는다.
  현재 등록된 실물 보드는 sensor:bit V1.6 하나다. 다른 보드 선택 UI는 아직 제공하지 않는다.
- 케이블은 `leads`에 개별 전기 경로를 유지한다. `individual`은 독립 점퍼, `bundle`은 한 커넥터로 묶인 선,
  `sheathed`는 공통 피복을 가진 선이다. 묶음도 신호를 합치지 않으며, 연속 단자·핀 순서·피치를 검사한다.
- 젠더·터미널 모듈은 독립 부품이다. `bridges`가 입력과 출력의 내부 연결을 명시한다. 위치만 가까운 핀을 자동 연결하지 않는다.
- 보드 단자의 `net`과 센서 인스턴스의 `requires`를 연결 그래프로 검사한다. 단자 누락, 중복 점유,
  전원·접지·신호 간 단락, 잘못된 프로브 신호, 어댑터 내부 연결 누락은 장면 생성 전에 거부한다.
  이는 안내 데이터의 일관성 검사이며 전기 시뮬레이션이나 실물 호환성 인증은 아니다.
- 모델의 공유 재질·텍스처는 유지하고, 연결 강조·LED·글자 등 인스턴스 전용 재질과 geometry는 구성 교체 때 해제한다.
  커넥터 분리는 각 단자의 삽입 방향을 따른다. 보기 변경은 장치 연결·준비 완료·기록 상태를 바꾸지 않는다.

DS18B20은 사용자가 지정한 [SEN050007](https://www.devicemart.co.kr/goods/view?no=1287129)의
금속 프로브·피복 케이블·노출 리드와 DAT/VCC/GND 터미널 모듈을 사진에 근거해 모델링했다.
단자대 기판은 제품 설명의 23×20 mm 기준이며 탐침·연결선 길이와 작은 부품은 교육용 근사다.
사진·판매자 로고를 앱 자산으로 복제하지 않았다. 모듈의 저항 형상은 표현하되 사진만으로 저항값을 단정하지 않는다.
프로브 1개는 P1, 2개는 P1·P2에 각각 별도 모듈로 연결한다. DS18B20 안내는 암–암 개별 점퍼선 세 가닥으로 고정하고 프로브 개수만 선택한다. 묶음 케이블 지원은 공통 모델에 유지한다.

## 출처와 재사용

기존 `public/viewers/bmp280/index.html`의 고정 원본은
[Cho-WH/bme280@59c5c149](https://github.com/Cho-WH/bme280/tree/59c5c149450f970bace2deaa183857c275595853/bmp280-wiring)이다.
원본 HTML의 SHA-256은 `3212905c9963dd360791a43f1b7500bddd4dbeffcafee2f5153bda1fdd61fe47`이다.
Three.js r180·OrbitControls를 공유 ESM으로 추출하고, 기존 장면은 같은 동작의 `scene.js`로
옮겼다. 1.4.0에서 센서별 장면·bridge를 공통 배선 뷰어로 교체하고 중복 micro:bit 모델을 제거했다.
새 모델은 원본의 판·문자·소켓 형상과 본체 치수를 재사용·수정했다.

Three.js·OrbitControls는 [MIT](../../vendor/three-r180-LICENSE.txt)이며 기존 저작권 고지를
유지한다. 원 저장소의 사용자 작성 모델·뷰어에는 별도의 최상위 라이선스가 확인되지
않았으므로 Three.js의 MIT가 사용자 작성 코드에도 적용된다고 주장하지 않는다.
배터리 케이스·케이블과 후면 상세 표현은 이 저장소에서 추가했다.

부품 위치·역할 참고: [공식 V2 설명](https://www.microbit.org/accessibility/full-text-tour/),
[공식 회로 자료](https://tech.microbit.org/hardware/schematic/),
[공식 V2 배치 그림](https://github.com/microbit-foundation/dev-docs/blob/master/hardware/assets/microbit-overview-2.png).
공식 이미지는 확인에만 사용했으며 앱 자산으로 복사하지 않았다.

## 검사

장치 자산 변경은 `/tests/browser/?suite=devices`와 변경된 장면의 육안 확인을 수행한다.
접점 구멍과 회로선의 경계 변경은 `node --test tests/unit/device-surface.test.mjs`로 확인한다.
공유 엔진·기존 BMP280 장면 추출을 바꾸면 `/tests/browser/?suite=guide`도 확인한다.
준비물·USB·배터리 그림 연결은 같은 `guide` 검사와 해당 화면의 육안 확인으로 검증한다.
전체 검사는 저장소 [원칙](../../../AGENTS.md)에 따라 커밋 직전에만 실행한다.
