# V1 준비 장면과 장치 표시

`luminous-board.png`와 `luminous-usb.png`는 `dev/design/render-scene.html`에서
공통 `createDeviceScene` 모델을 렌더링한 1200×1000 투명 PNG다.
모델은 `public/assets/devices/`의 현재 코드와 출처를 따르며, V1에서는 형상·단자·배선을 변경하지 않았다.

카메라·광원·회전·여백은 `dev/design/render-scene.js`에서 관리한다.
본체 그림은 측정 화면의 장치 표시, USB 그림은 준비 화면의 대표 장면에만 사용한다.
그림은 실제 연결 상태나 펌웨어 설치 성공의 근거가 아니다.
실물 하드웨어와의 새로운 대조 검증은 수행하지 않았다.

재생성: `npm run dev` 후 `/dev/design/render-scene.html`을 열고 두 PNG 저장 링크를 사용한다.
소스 형상은 복제하지 않으며 기존 장치 모델이 바뀌면 이 파생 그림도 다시 검토한다.
