# 디자인 검토 경로

`npm run dev`로 로컬 서버를 실행한다. 이 폴더는 빌드 배포 대상이 아니다.

- `preparation-comparison.html`: 준비물·배선·프로그램·연결의 A/B 실제 캡처 비교. 캡처는 `docs/design/review/v1/preparation-{light|dark}-{단계}.png`다.
- `preparation.html?variant=light` / `?variant=dark`: 실제 앱의 준비 화면. 같은 화면의 A/B 버튼으로 단계·확인 상태를 유지하며 비교한다. `step=equipment|wiring|program|connection`, `sensor=bmp280|magnetometer|…`를 선택할 수 있다. BMP280가 기본이다.
- `index.html?state=recording`: 측정 화면의 고정 시각·모의 입력 검토. `idle`, `preview`, `paused`, `disconnected`, `error`와 `theme=legacy`를 지원한다. 이 페이지에서만 시계를 고정한다.
- `render-scene.html`: 기존 공통 모델의 카메라·조명으로 장치 PNG를 다시 렌더링한다.

준비 비교와 측정 검토는 실제 DOM·Controller·기존 모의 BLE를 사용하며, 각 페이지마다 별도의 검토용 IndexedDB를 사용한다. 검토를 마치면 하단의 자료 정리 버튼으로 해당 DB와 실행 중인 뷰를 정리한다. 실물 USB/BLE 검증 결과로 해석하지 않는다.

측정 화면 회귀 검사는 `/tests/browser/?suite=luminous`에서 다섯 센서·화면 크기 조합을 연속으로 검사한다. 실행 버튼을 누른 것만으로 통과한 것은 아니며, 마지막의 전체 통과 표시를 확인한다.

## 준비 A/B의 차이

A는 기존 밝은 준비 화면의 배치를 따르며 프로그램도 같은 표현으로 맞춘다. B는 프로그램의 남색 무대와 설명/장치 배치를 모든 준비 단계로 확장한다. 두 안 모두 직선 단계 탭·기존 준비 확인·장치 그림 크기 조절을 사용한다. B의 3D 작업면은 배선 색과 작은 글자를 보존하기 위해 밝게 유지한다. 사용자가 B안을 선택하여 새 디자인의 준비 화면에 적용했다. A안과 최초 비교 캡처는 보관하며, B 직접 조작 경로는 다듬은 현재 B안을 보여 준다. V2 공통화·배포는 진행하지 않았다.
