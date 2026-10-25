# 디자인 검토 경로

`npm run dev`로 로컬 서버를 실행한다. 이 폴더는 빌드 배포 대상이 아니다.

V5부터 일반 홈·센서·활동 주소도 Luminous를 기본 사용한다. 이전 측정 표현은 기준 커밋·캡처로 보관하며 `theme=legacy` 실행 분기는 제거했다. 준비 A안은 별도 archive 경로로 유지한다.

- `preparation-comparison.html`: 준비물·배선·프로그램·연결의 A/B 실제 캡처 비교. 캡처는 `docs/design/review/v1/preparation-{light|dark}-{단계}.png`다.
- `preparation.html`: 채택한 B안의 실제 준비 화면. 비교 버튼을 표시하지 않는다. `step=equipment|wiring|program|connection|calibration|battery|placement`, `sensor=bmp280|magnetometer|…`를 선택할 수 있다. BMP280가 기본이며 `activity=gay-lussac`으로 활동을 연다. 해당 센서·활동에 있는 단계만 이동한다.
- `archive/preparation-a.html`: 보관된 A안. 현재 준비 화면에서는 연결하거나 선택하지 않는다. 최초 비교 캡처도 그대로 보관한다.
- `index.html?state=recording`: 측정 화면의 고정 시각·모의 입력 검토. `idle`, `preview`, `paused`, `disconnected`, `error`를 지원한다. 이 페이지에서만 시계를 고정한다.
- `index.html?state=paused&view=relationship`: V4 분석 검토. `view=overview|relationship|interpretation|saved|home`을 지원하며 기록을 마친 뒤 실제 화면 조작으로 이동한다. 빈 저장 목록은 `state=idle&view=saved`, 홈은 `state=idle&view=home`으로 연다.
- `render-scene.html`: 기존 공통 모델의 카메라·조명으로 장치 PNG를 다시 렌더링한다.
- `icon-study/`: 아이콘 4종·형태와 색·크기별 보기·단색형 배치로 구성한 디자인 시트. 열린 궤도 기본형과 파스텔 블루·평면·단색 파생형. 네 가지 표현은 프레임 5.35·궤도 3.1~3.6·눈금 1.2의 선 두께, 아래쪽으로 이어지고 오른쪽이 열린 궤도, 호 끝에 연결된 신호점, 짧아진 오른쪽 눈금을 공유한다. 기본형은 #B7D2FF 중심의 프레임·구체 명암과 선명한 주황 호, 노란 하이라이트가 있는 신호점으로 구성한다. 파스텔형은 이미지 A의 #DBE6FF 배경과 회청색 프레임·살구빛 신호, 평면형은 그라데이션 없는 색면, 단색형은 한 색의 농도 변화로 표현한다. 앱 이름 옆에는 두 줄 브랜드 높이에 맞춘 단색형, 탭·홈 화면 바로가기에는 남색 기본형을 적용했다. `node dev/design/icon-study/build-icons.mjs`로 기본 SVG 4종과 크기별 SVG 12종을 재생성한다.
- `icon-study/size-study.html`: 기본형·파스텔 블루·평면형·단색형의 32·24·16px 전용 축소형과 단순 축소 비교. 선택 메뉴로 표현을 바꾸며, 메인 디자인 시트의 모든 행에도 크기별 SVG를 사용한다. 프레임·구체·궤도 개방 방향은 동일하며 내부 선 두께·대비와 신호점 크기를 조정한다. 24px는 눈금을 짧게 하고 발광 범위를 줄였다. 16px는 눈금·발광을 생략하고 궤도를 보강하며 금빛 신호점을 색면으로 표현한다. `build-icons.mjs`가 별도 `sensor-lab-{primary|light|compact|monochrome}-{32|24|16}.svg`를 생성한다. 파스텔형은 밝은 궤도와 주황의 대비, 단색형은 한 색의 농도를 보강한다. 48px 이상은 기존 기본 SVG를 사용한다.
- `icon-study/shape-study.html`: 보관한 이전 기본형과 채택 기본형의 비교. 이전 SVG 4종은 `icon-study/archive/`에 보관한다. 별도 탐색 시안 `sensor-lab-open-orbit.svg`는 선택 당시 스냅샷이며, `build-shape-study.mjs`는 보관된 이전 기본형에서 이 시안을 재현한다. 현재 기본형·파생형의 수정은 `build-icons.mjs`에서만 한다.

준비·측정 검토는 실제 DOM·Controller·기존 모의 BLE를 사용하며, 각 페이지마다 별도의 검토용 IndexedDB를 사용한다. 측정 검토의 개발 도구는 화면 높이에 영향을 주지 않는 왼쪽 아래 접힌 메뉴에 둔다. 검토를 마치면 개발 도구의 자료 정리 버튼으로 해당 DB와 실행 중인 뷰를 정리한다. 실물 USB/BLE 검증 결과로 해석하지 않는다.

측정 화면 회귀 검사는 `/tests/browser/?suite=luminous`에서 다섯 센서·화면 크기 조합을 연속으로 검사한다. 실행 버튼을 누른 것만으로 통과한 것은 아니며, 마지막의 전체 통과 표시를 확인한다.

준비 B 회귀 검사는 `/tests/browser/?suite=preparation`이다. 다섯 센서와 게이뤼삭을 실제 모의 연결하고, 같은 문서를 1366/390px로 바꾸면서 단계·도움말·값 표시·뷰어 수명·초점의 상태 보존을 확인한다. 설치 실패·취소·보정 응답·새 연결·수신 중단 등 사실별 동작은 기존 `suite=guide`에서 확인한다.

분석 검사는 `/tests/browser/?suite=ui`이며 현재 기본 UI를 검사한다. `visual=luminous`를 붙일 필요가 없다. 같은 검사로 구간 초안/적용·복원/되돌리기·가상 표·근거/글 보존과 실제 Canvas의 PNG/인쇄 표현을 확인한다. `/tests/browser/?suite=workspace`는 실제 앱 하나를 1366→1024→390→320px로 바꾸고 홈·소개·저장 목록에서 근거와 글을 다시 연다. 조합 실행은 `?suite=app,records`처럼 지정한다. 현재 UI fixture는 실제 앱과 같은 화면 구성을 사용하고 숨은 버튼 직접 클릭을 거부한다.

## V5 검토 환경

측정·준비 검토 주소에 `text=200&fallback=1&motion=reduce`를 붙이면 글자 200%, 글꼴 로딩 실패 후 시스템 서체, 필터 없음, 모션 감소 분기를 함께 확인한다. 글꼴 오류 로그는 이 실패 검토에서 의도한 결과다. 모션은 개발 페이지에서 CSS/JS 분기를 강제하며 운영체제 설정을 바꾸지 않는다.

`/tests/browser/?suite=accessibility`는 확대·대체 환경의 넘침, 실제 글자/입력 대비, 대화상자 초점 복귀, 확대 가상 표 끝 행 접근을 검사한다. `/tests/browser/?suite=performance`는 현재 기본 UI에서 4채널 모의 자료의 처리 비용을 관찰한다. 시간은 실행 환경에 따라 달라지는 관찰값이며 합격 기준으로 고정하지 않는다. 정지 중 자료 보존·불필요한 갱신 방지·재개 후 700행·차트 수명은 동작 계약으로 검사한다. 성능 검사는 전체 suite에 자동 포함하지 않는다.

초기 HTML·스타일을 기본 UI로 정착시키는 작업은 [기본 UI 구조 전환 계획](../../docs/design/visual-rollout-plan.md#14-기본-ui-구조-전환-계획)에 정리했다. 1차에서 정적 HTML·스타일과 공통 `startApp()`으로 진입점을 전환했다. 2차에서 화면별 CSS 소유권도 통합했다. 준비 A안은 `loadLabDocument({ preparationStyle })`로 준비 스타일만 `archive/preparation-base.css`로 교체하고 `preparation-a.css`를 더한다. 앱·준비 동작은 복제하지 않으며 기본 진입은 archive CSS를 요청하지 않는다. `/tests/browser/?suite=startup`은 준비 전 잠금·첫 경로 완료·스타일/모듈 실패 안내·대체 서체·스크립트 미실행을 검사한다. 기존 제어 브라우저의 iframe 탐색 실패는 실행 환경 문제로 분리했으며 `npm run test:e2e`의 독립 Chromium으로 실행한다. 실제 페이지의 높이 조절과 3D 실패 복구도 포함한다.

## 준비 A/B의 차이

A는 기존 밝은 준비 화면의 배치를 따르며 프로그램도 같은 표현으로 맞춘다. B는 프로그램의 남색 무대와 설명/장치 배치를 모든 준비 단계로 확장한다. 두 안 모두 직선 단계 탭·기존 준비 확인·장치 그림 크기 조절을 사용한다. B의 3D 작업면은 배선 색과 작은 글자를 보존하기 위해 밝게 유지한다. 사용자가 B안을 선택하여 기본 준비 화면에 적용했다. A안과 최초 비교 캡처는 보관하며, A안은 별도 archive 경로에 두고 현재 준비 검토 경로는 B안만 사용한다.

3차부터 개발 서버도 공통 CSS를 정적 빌드와 같은 순서·주소 변환으로 결합해 제공합니다. CSS 파일은 계속 담당 화면별로 수정합니다. 준비 스타일의 별도 링크와 A안 대체는 유지합니다. 측정·원자료·관계·해석은 같은 남은 높이 계산을 사용하며 긴 내용·확대에서는 최소 크기를 보존하기 위한 스크롤을 허용합니다.
