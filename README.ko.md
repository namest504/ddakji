# ddakji

**한국어** · [English](README.md)

Markdown sticky notes for Windows.

마크다운 기반 위젯형 스티키 노트. Win11 Sticky Notes를 대체하면서
라이브 마크다운 편집 · 모음집(그룹) · 이미지 · 테마를 지원합니다.

## 기능

- 노트별 독립 위젯 창 (프레임 없음, 노트별 항상-위 고정)
- 라이브 마크다운 편집: 문법을 타이핑하면 즉시 렌더, 서식 단축키·하단 서식 바
- 체크박스(클릭 토글)·중첩 목록(Tab)·GFM 표(좁은 창은 표만 가로 스크롤)
- 기존 `.md` 파일 가져오기(다중 선택), 마크다운 텍스트 붙여넣으면 서식 적용
- **모음집**: 관련 노트를 묶어 한 창에서 넘겨보기 — 드래그로 합치기, Alt+←→/화살표/점 인디케이터
- 배경색 7종·노트별 폰트(설치 폰트 조회), 시스템 다크/라이트 추종, 반투명 글라스 창
- 이미지: 붙여넣기·드롭·드래그 재배치·그립으로 크기 조절
- 노트 목록(모음집 섹션·상대시간·자세히 보기), 검색, 설정(저장 위치 변경 포함)
- **휴지통**: 어느 경로로 지워도 목록 창에서 복원 — 파일이 사라지는 건 영구 삭제·비우기뿐
- Alt-Tab·작업표시줄에는 앱 항목 하나만 — 선택하면 모든 노트 표시, 썸네일은 최근 노트
- 자동 저장, 트레이 상주, 부팅 시 시작, 자동 업데이트, 단축키(Ctrl+N/W/L 등)
- **CLI·MCP**: `ddakji-cli`로 스크립트가, `ddakji-mcp`로 AI 어시스턴트가 같은 노트를 읽고 씁니다
- **한/영 UI** — OS 언어를 따라가고, 설정에서 바꿀 수 있습니다

## 터미널과 AI에서

포터블 zip·설치본에 `ddakji-cli`와 `ddakji-mcp`가 함께 들어 있습니다.

```sh
ddakji-cli add "오늘 할 일" --open     # 노트를 만들고 창으로 연다
ddakji-cli list --json                 # 스크립트에서 읽기
ddakji-cli skill --install             # AI 에이전트용 설명서를 스킬 폴더에 심는다
ddakji-mcp --print-config              # MCP 클라이언트 등록용 JSON 출력
```

앱이 켜져 있으면 바꾼 내용이 열린 노트 창에 바로 반영됩니다.
자세한 명령은 **[docs/cli.md](docs/cli.md)**, MCP 도구 목록은 **[docs/mcp.md](docs/mcp.md)**.

## 설치 (Windows)

[Releases](../../releases)에서 최신 `ddakji_x.y.z_x64-setup.exe`(설치형) 또는
`ddakji-x.y.z-portable-x64.zip`(포터블) 다운로드 후 실행.

## 사용법

**[docs/usage.md](docs/usage.md)** — 툴바·서식 바, 마크다운 입력 문법, 단축키, 이미지, 설정 안내.

## 개발

`main`은 릴리스된 것만, `develop`이 개발 브랜치입니다. 모든 PR은 `develop`을
대상으로 보내주세요 — 릴리스는 `release/x.y.z` 브랜치를 거쳐 `main`으로 갑니다.

    npm install
    npm run tauri dev     # 앱 실행
    npm test              # 프론트 테스트
    cargo test --manifest-path src-tauri/Cargo.toml   # Rust 테스트

**[CONTRIBUTING.md](CONTRIBUTING.md)** — 기여 방법·확인 명령·코드 방향.
**[CHANGELOG.md](CHANGELOG.md)** — 버전별 변경 이력.

## 데이터 위치

- 노트: `%APPDATA%/Ddakji/notes/*.md` — 평문 마크다운 + YAML 프론트매터
- 파일명: 생성 시각 기반 (`20260805-134024-a1b2c3.md`)
- 이미지: `assets/<노트id>/`에 원본 저장
- 저장 위치는 설정에서 변경할 수 있습니다

## 스택

Tauri 2 · React · TypeScript · TipTap
