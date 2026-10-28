# 센서 실험실 디자인 안내

현재 앱은 Luminous를 기본 사용합니다. 준비 화면은 B안의 남색 장면, 측정·분석은 밝은 자료 표면을 사용합니다. A안과 초기 시안은 개발용 보관 경로에 유지합니다.

## 현재 규칙과 자원

- [시각 디자인 문법](visual-language.md): 형태·색상 역할·상태·화면별 책임·확장 원칙
- [실행 CSS 토큰](../../src/ui/tokens.css): 현재 색상·크기 값의 단일 기준
- [앱 아이콘·대표 이미지](../../public/assets/branding/README.md): 적용 위치·벡터/래스터 자산·재생성 방법
- [장치 자산](../../public/assets/devices/README.md): 공통 모델·그림의 사용 계약과 출처
- [디자인 자산](../../public/assets/design/README.md): 서체·그림 등 자원의 출처
- [로컬 디자인 검토](../../dev/design/README.md): 검토 화면·아이콘 디자인 시트 실행 방법

[사용자가 제공한 기준 시안](reference/approved-moodboard.png)은 시각 방향의 참고 자료입니다. 이미지 속 장치 상태·수치·단위는 기능 명세가 아니며 실제 센서 정의를 따릅니다.

## 설계 중인 기능

- [한 점 기록·연속 기록 연계](../point-recording-design.md): M8-2의 화면 위계, 실시간 계기, 기록 중 표 편집, 자료별 분석, 모바일·키보드 동작과 기존 디자인 문법 적용 기준. 기능 구현 미착수이며 위의 공통 시각 규칙을 재사용합니다.

## 적용·검증 이력

- [디자인 적용·구조 전환 기록](history/design-implementation.md)
- [준비 A/B 검토](review/v1/preparation-comparison.md)
- [V5 화면·접근성·성능 검토](review/v5/review.md)
- [명도 대비 계산 기록](contrast-check.md)

완료된 전환 절차를 새로운 작업 지시로 사용하지 않습니다. 현재 구현을 변경할 때는 시각 디자인 문법과 실제 CSS·HTML을 기준으로 삼습니다.
