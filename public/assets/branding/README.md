# micro:bit V2 compatibility mark

Owner: Micro:bit Educational Foundation.

`microbit-v2-compatible.png` is an unmodified copy of
`Compatibility logo icon set/v2-only-transparent.png` from the official
[Compatibility Logos archive](https://cdn.sanity.io/files/ajwvhvgo/production/2b8eb609d8f5562ddeedb3c90999b30403194784.zip), retrieved 2026-10-25.

SHA-256: `332203c7ed47895d2c0180cc55e598881ebb655c9dbe893cef2be82ad2349927`.

Use is governed by the [official brand guidelines](https://www.microbit.org/brand-guidelines/), not the repository MIT license. This indicates V2 compatibility, not endorsement. Preserve the original proportions, colours and transparent clear space. The app displays it in the title bar only when sufficient space is available.

## 센서 실험실 아이콘

앱 자체 아이콘이며 위의 micro:bit 호환 마크와 구분한다. 디자인 원본과 생성기는 `dev/design/icon-study/`에 있다.

- `sensor-lab-mark-24.svg`: 24px 보정 원본을 사용하는 앱 이름 옆 단색 심벌. 표시 크기는 micro:bit와 앱 이름 두 줄의 전체 높이를 따른다.
- `sensor-lab-favicon.svg`: 브라우저 파비콘의 기본 벡터. 작은 표시에서 구분되도록 프레임 경계와 궤도 굵기·대비를 보정하고 눈금·발광을 생략했다. 디자인 원본에서 그대로 복사해 배포한다.
- `sensor-lab-favicon-{16|32|96}.png`: 같은 보정 형태의 PNG 호환용 파일. 각 해상도에서 벡터를 직접 래스터화한다. 96px에도 눈금을 복원하지 않으며 일반 UI용 24·32px SVG와 구분한다.
- `sensor-lab-home.svg`: 홈 화면용 큰 기본형 벡터. 눈금·그라데이션을 유지하며 매니페스트에 `sizes: "any"`로 제공한다. 플랫폼의 외곽 처리에 맞춰 바탕은 불투명 정사각형이다.
- `sensor-lab-home-{180|192|512}.png`: 같은 큰 기본형의 호환용 PNG. 192·512px는 매니페스트에, 180px는 HTML의 `apple-touch-icon`에 유지한다. 실제 선택은 브라우저·설치 경로에 따르며 SVG 사용을 강제하지 않는다.

`node dev/design/icon-study/export-app-icons.mjs`로 재생성한다. 내보내기에만 Sharp가 필요하며 운영 빌드는 저장된 자산을 복사한다. Sharp를 별도 환경에서 사용하는 경우 `ICON_SHARP_MODULE` 환경 변수에 모듈 진입점의 file URL을 지정한다. 이번 출력은 Sharp 0.35.5를 사용했다. 디자인 시트의 `size-study.html#favicon-pixels`에서 이전·현재 PNG를 16 CSS px와 픽셀 확대로 비교할 수 있다. SVG와 각 PNG를 같은 표시 크기로 비교한다. `sizes`는 후보 정보이며 파일 선택은 브라우저에 맡긴다. 48px 이하 PNG·초과 SVG처럼 크기별 선택을 강제하지 않는다. HTML의 파비콘 URL에는 캐시 갱신용 `v=2`를 붙인다.

## 링크 미리보기

`sensor-lab-social.png`는 아이콘·앱 소개·준비·측정·분석 화면을 겹친 사진 구성으로 담은 1200×630 대표 이미지다. 편집 원본은 `dev/design/icon-study/social-card.html`이며 앱과 같은 Pretendard Variable 글꼴을 사용한다. `micro:bit` 위줄과 `센서 실험실` 아래줄의 비율·굵기·자간은 좌측 패널의 브랜드 표기를 따른다. 아이콘 높이는 두 줄 전체에 맞춘다.

장비 준비 이미지는 1280px 폭의 브라우저에서 BMP280 준비물 단계의 실제 UI를 잘라 저장한 `dev/design/icon-study/preparation-ui.png`다. `measurement-ui.png`와 `analysis-ui.png`는 같은 폭의 실제 앱에서 모의 장치로 수집한 자료의 측정 화면과 온도·기압 관계 분석 화면을 캡처한 것이다. 실제 센서 실험 결과가 아닌 대표 화면용 모의 데이터다. 각 UI가 바뀌면 해당 캡처도 갱신한다. 대표 이미지 원본을 브라우저에서 1200×630으로 렌더링해 캡처한 뒤, `SOCIAL_CAPTURE_PATH` 환경 변수에 캡처 파일 경로를 지정하고 위 내보내기 명령을 실행한다. 이 변수를 지정하지 않으면 기존 대표 이미지를 보존한다.

제목은 **센서 실험실 · 측정에서 발견까지**, 설명은 **micro:bit 센서로 측정하고, 데이터를 저장해 그래프로 분석하며 실험 결과를 해석하는 과학 실험실입니다.**를 사용한다. `lab.html`과 루트 진입 페이지에 정적 Open Graph·Twitter 카드 메타데이터를 제공한다. 센서·활동 진입 페이지는 각 경로를 `og:url`로 유지한다. 배포 도메인이나 프로젝트 경로가 바뀌면 두 HTML의 절대 이미지 주소와 `og:url`을 함께 갱신한다. 공개 배포 전에는 외부 공유 서비스가 새 이미지를 읽을 수 없다.
