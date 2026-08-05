# stickdown

마크다운 기반 위젯형 스티키 노트. Win11 Sticky Notes를 대체하면서
라이브 마크다운 편집 · 이미지 삽입 · 테마를 지원합니다.

## 기능
- 노트별 독립 위젯 창 (프레임 없음, 노트별 항상-위 고정)
- 라이브 마크다운 편집: 문법을 타이핑하면 즉시 렌더, 서식 단축키·하단 서식 바
- 체크박스(클릭 토글)·중첩 목록(Tab), 이미지 붙여넣기/드롭/드래그 재배치
- 배경색 7종·노트별 폰트(설치 폰트 조회), 시스템 다크/라이트 추종, 반투명 글라스 창
- Alt-Tab·작업표시줄에는 앱 항목 하나만 — 선택하면 모든 노트 표시, 썸네일은 최근 노트
- 노트 목록·검색·설정(저장 위치 변경 포함), 자동 저장, 트레이 상주, 부팅 시 시작

## 설치 (Windows)
[Releases](../../releases)에서 최신 `stickdown_x.y.z_x64-setup.exe`(설치형) 또는
`stickdown-x.y.z-portable-x64.zip`(포터블) 다운로드 후 실행.

## 사용법
**[docs/usage.md](docs/usage.md)** — 툴바·서식 바, 마크다운 입력 문법, 단축키, 이미지, 설정 안내.

## 개발
    npm install
    npm run tauri dev     # 앱 실행
    npm test              # 프론트 테스트
    cargo test --manifest-path src-tauri/Cargo.toml   # Rust 테스트

## 데이터 위치
`%APPDATA%/StickDown/notes/*.md` — 평문 마크다운 + YAML 프론트매터.
파일명은 생성 시각 기반(`20260805-134024-a1b2c3.md`), 이미지는 `assets/<노트id>/`에 원본 저장.
저장 위치는 설정에서 변경할 수 있습니다.

## 스택
Tauri 2 · React · TypeScript · TipTap

## 데모

구버전(v0.1.0) 데모입니다 — 새 UI 반영 예정.

![stickdown 데모 (v0.1.0)](docs/assets/demo.gif)
