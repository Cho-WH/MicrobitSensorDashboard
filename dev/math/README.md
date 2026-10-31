# 로컬 수식 표시 번들

앱 루트에서 `npm ci`, `npm run build:math`로 재생성한다. 일반 `npm run build`는 보관한 번들을 사용한다. 버전을 바꿀 때는 두 MathJax 패키지를 함께 고정하고 수식 표시·출력 검사를 수행한다.

- `@mathjax/src` **4.1.3**: [MathJax-src](https://github.com/mathjax/MathJax-src/tree/4.1.3), Apache-2.0. Copyright (c) 2017–2026 The MathJax Consortium.
- `@mathjax/mathjax-tex-font` **4.1.3**: [MathJax-fonts](https://github.com/mathjax/MathJax-fonts), Apache-2.0. TeX 글리프와 메트릭을 포함한다.
- npm 원본 무결성과 esbuild 버전은 루트 `package-lock.json`, 생성 파일 해시는 `vendor/manifest.json`, 배포 라이선스는 `public/vendor/mathjax-LICENSE`에 보존한다.

`entry.js`는 TeX 입력, SVG 출력, lite adaptor와 base/ams/newcommand/textmacros/unicode 패키지만 선택한다. `font.js`는 기본 폰트를 패키지에 포함된 TeX 폰트로 지정한다. 전체 페이지 검색·자동 조판·편집기·문맥 메뉴·음성 탐색기·외부 확장 로더는 초기화하지 않는다. 화면은 앱이 제공하는 한국어 설명으로 접근성 이름과 실패 대안을 갖는다.

`fontCache: none`으로 각 SVG 안에 글리프 경로를 넣어 그림·Canvas 이미지·인쇄로 옮길 때 문서 밖의 글리프 정의를 참조하지 않는다. 한글 열 이름처럼 TeX 글리프에 없는 문자는 SVG 텍스트와 시스템 글꼴로 표시한다. SVG의 사용하지 않는 `data-latex` 속성은 제거한다. 수식과 크기를 반환하는 한 함수만 공개하며 수치 계산이나 학생 답안 판정은 하지 않는다.

앱의 `src/ui/math-view.js`가 첫 수식 표시 때 로컬 모듈을 불러오고 반복 수식 결과를 제한된 캐시에 보관한다. 사용자 열 이름은 공통 텍스트 이스케이프를 거치며 임의 TeX 입력 UI는 제공하지 않는다. 네트워크 CDN·추가 폰트 다운로드는 사용하지 않는다.

인라인 식도 하나의 SVG로 받도록 MathJax의 인라인 분할을 끈다. 긴 식은 기존 수식 영역의 가로 스크롤로 읽는다. 구심가속도는 화면 생성 시 미리 조판하지 않고, 평균과 주기가 준비되어 분석을 펼칠 때 수식을 준비한다. 홈의 로딩 검사는 앱 초기화와 초기 네트워크 요청이 완료된 뒤 확인한다.
