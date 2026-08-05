# stickdown

마크다운 기반 위젯형 스티키 노트. Win11 Sticky Notes를 대체하면서
라이브 마크다운 편집 · 이미지 삽입 · 테마를 지원합니다.

## 기능
- 노트별 독립 위젯 창 (프레임 없음, 작업표시줄 미표시, 노트별 항상-위 고정)
- 라이브 마크다운 편집: 문법을 타이핑하면 즉시 렌더, 서식 단축키·하단 서식 바
- 이미지 붙여넣기/드롭/파일 선택, 글씨 크기 `Ctrl+휠` (10–40px)
- 배경색 7종·노트별 폰트, 시스템 다크/라이트 추종, 반투명 글라스 창
- 노트 목록·검색·설정, 자동 저장, 트레이 상주, 부팅 시 시작

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
`%APPDATA%/com.stickdown.app/notes/*.md` — 평문 마크다운 + YAML 프론트매터.

## 스택
Tauri 2 · React · TypeScript · TipTap

## 데모

![stickdown 데모 — 마크다운 편집, 뷰어 토글, 글씨 크기 조절](docs/assets/demo.gif)
