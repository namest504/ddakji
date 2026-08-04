# stickdown

마크다운 기반 위젯형 스티키 노트. Win11 Sticky Notes를 대체하면서
글씨 크기 조절 · 마크다운 뷰어 · 이미지 삽입을 지원합니다.

## 기능
- 노트별 독립 위젯 창 (프레임 없음, 작업표시줄 미표시, 노트별 항상-위 고정)
- 글씨 크기 조절: `Ctrl+휠`, `Ctrl+±` (10–40px)
- 마크다운 편집 ↔ 뷰어 토글, 이미지 붙여넣기/드롭
- 배경색 7종, 노트 목록·검색, 자동 저장, 트레이 상주, 부팅 시 시작

## 설치 (Windows)
[Releases](../../releases)에서 최신 `stickdown_x.y.z_x64-setup.exe` 다운로드 후 실행.

## 개발
    npm install
    npm run tauri dev     # 앱 실행
    npm test              # 프론트 테스트
    cargo test --manifest-path src-tauri/Cargo.toml   # Rust 테스트

## 데이터 위치
`%APPDATA%/com.stickdown.app/notes/*.md` — 평문 마크다운 + YAML 프론트매터.

## 스택
Tauri 2 · React · TypeScript · marked

## 데모
<!-- demo gif here -->
