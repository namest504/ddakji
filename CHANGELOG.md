# 변경 이력

이 문서는 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르며,
버전은 [유의적 버전](https://semver.org/lang/ko/)을 씁니다.

0.x 동안에는 기능 추가도 패치 릴리스로 나갑니다 — 마이너·메이저는 큰 전환에만 올립니다.

## [Unreleased]

## [0.1.4] - 2026-08-10

### 추가

- 마크다운 **표**를 표로 렌더링 — 좁은 창에서는 표 영역만 가로 스크롤 ([#71])
- 기존 `.md` 파일을 노트로 **가져오기** (목록 헤더, 여러 개 선택 가능)와
  마크다운 텍스트 **붙여넣기 시 서식 적용** ([#72])

### 변경

- **새 창으로 꺼내기(`Ctrl+Shift+P`)** 재설계: 현재 노트가 새 창으로 나가고
  원래 창은 모음집의 다음 노트로 전환됩니다 ([#74])
- 노트 목록 검색이 본문뿐 아니라 **사용자 지정 제목**도 찾습니다 ([#67])
- 트레이 메뉴 "모든 노트 표시" → **"모든 노트 펼치기"** — 모음집까지 펼치는
  것은 이제 이 메뉴만 합니다 ([#69])

### 수정

- 앱이 트레이에 떠 있는 상태에서 다시 실행하거나 Alt-Tab·작업표시줄로 돌아오면
  **모음집이 전부 펼쳐지던 문제** ([#69])
- 같은 노트가 두 창에 보이던 문제 — 창을 전환할 때 에디터가 이전 본문을 계속
  그리던 것이 원인이며, 모음집 이동(`Alt+←/→`)에도 잠재해 있었습니다 ([#74])
- 모음집 창을 다른 노트 위로 드래그해도 합쳐지지 않던 문제(누적 이동 거리로 판정)
- 모음집끼리 겹치면 **모음집 전체**가 대상 모음집으로 통합됩니다
- 큰 창을 작은 노트 위에 놓으면 흡수되지 않던 문제 — 겹침 판정을 두 창 중
  작은 창 면적 기준으로 바꿔 어느 쪽을 끌든 같게 ([#78])
- 노트 목록 제목에서 체크박스 마커가 남고 이미지 문법이 그대로 노출되던 문제 ([#66])
- 창을 좁히면 본문이 잘리던 문제, 코드 블록이 줄바꿈되어 복사가 어렵던 문제

### 내부

- 백엔드를 책임별 모듈로 분리하고(`store/model`·`store/paths`·`session`)
  커맨드 에러를 문자열에서 타입(`Error`)으로 교체 ([#79])
- 노트 창의 부수효과를 커스텀 훅으로 분리 — `NoteApp` 368 → 149줄 ([#80])
- eslint·prettier·rustfmt·clippy 도입과 CI 게이트 ([#81])
- 회귀·엣지케이스 테스트 대폭 보강 (Rust 47 → 84, 프런트 46 → 96) ([#68])

## [0.1.3] - 2026-08-06

### 추가

- **모음집(노트 그룹)**: 툴바 팝오버·목록 다중 선택·**창을 다른 창 위로 드래그**해 묶기
  (겹치면 어두워지며 예고). `Alt+←/→`·가장자리 화살표·하단 점으로 이동, 슬라이드 전환
- 노트 목록의 수정 시각을 상대 표기로 (방금 → N분 전 → 하루/이틀 전 → 날짜)
- ⓘ 자세히 보기 — 목록 표시용 **제목 지정**, 만든/수정한 날짜, 모음집·색·파일명
- 툴바 닫기(✕) 버튼, `Ctrl+N`/`Ctrl+W`/`Ctrl+L` 단축키

### 변경

- 색·폰트·모음집 팝오버를 불투명 패널로 (가독성)
- 작업 표시줄 항목에서 창을 닫으면 앱이 종료됩니다

### 수정

- 체크박스 연속 입력 시 줄이 사라지던 문제 완화, 첫 실행 시 창 플래시 제거

## [0.1.2] - 2026-08-05

첫 공개 릴리스.

### 추가

- 라이브 마크다운 편집 (TipTap) — 문법을 타이핑하면 즉시 렌더
- 하단 서식 바: 굵게·기울임·밑줄·취소선·목록·체크박스·들여쓰기·이미지·서식 지우기
- 체크박스 클릭 토글, 중첩 목록(Tab/Shift+Tab), 이미지 붙여넣기·드롭·드래그 재배치
- 노트 목록과 설정 화면, 새 노트 기본값, 자주 쓰는 폰트(설치 폰트 조회)
- 시스템 다크/라이트 추종, 반투명 글라스 창
- Alt-Tab·작업표시줄에 앱 항목 하나만 — 선택 시 모든 노트 표시, 썸네일은 최근 노트
- 데이터 폴더 `%APPDATA%\StickDown` (설정에서 변경 가능), 생성 시각 기반 파일명
- 설치형(`-setup.exe`)과 포터블(`-portable-x64.zip`) 배포

### 수정

- Windows에서 새 노트 생성 시 데드락, 삭제 확인창 잘림, 창 흰 화면 플래시

[unreleased]: https://github.com/namest504/stickdown/compare/v0.1.4...develop
[0.1.4]: https://github.com/namest504/stickdown/releases/tag/v0.1.4
[0.1.3]: https://github.com/namest504/stickdown/releases/tag/v0.1.3
[0.1.2]: https://github.com/namest504/stickdown/releases/tag/v0.1.2
[#66]: https://github.com/namest504/stickdown/issues/66
[#67]: https://github.com/namest504/stickdown/issues/67
[#68]: https://github.com/namest504/stickdown/pull/68
[#69]: https://github.com/namest504/stickdown/issues/69
[#71]: https://github.com/namest504/stickdown/issues/71
[#72]: https://github.com/namest504/stickdown/issues/72
[#74]: https://github.com/namest504/stickdown/issues/74
[#78]: https://github.com/namest504/stickdown/issues/78
[#79]: https://github.com/namest504/stickdown/pull/79
[#80]: https://github.com/namest504/stickdown/pull/80
[#81]: https://github.com/namest504/stickdown/pull/81
