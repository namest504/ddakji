# 기여 안내

이슈와 PR 모두 환영합니다. 한국어·영어 어느 쪽이든 편한 언어로 남겨 주세요.

## 개발 환경

Windows가 주 대상이지만, 리눅스/WSL에서도 개발·테스트가 됩니다
(투명 창은 Windows 전용이라 리눅스에서는 불투명하게 보입니다).

필요한 것: Node 20+, Rust stable, 그리고
[Tauri 사전 요구사항](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev     # 앱 실행
```

## 확인 명령

PR 전에 아래가 전부 통과해야 합니다. CI도 같은 것을 봅니다.

```bash
npm run lint          # eslint
npm run format:check  # prettier (고칠 때는 npm run format)
npm run build         # tsc --noEmit + vite build
npm test              # vitest

cargo fmt   --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test  --manifest-path src-tauri/Cargo.toml
```

> `cargo build`를 직접 부르지 마세요 — `custom-protocol` 기능 없이 빌드하면
> 프런트엔드가 빠진 깨진 바이너리가 나옵니다. 검증은 `cargo check`/`cargo test`,
> 실행은 `npm run tauri dev`/`npm run tauri build`를 씁니다.

## 브랜치와 커밋

```
feature/fix/deps ─▶ develop ─▶ release/x.y.z ─(안정화)─▶ main ─▶ tag vx.y.z
                       ▲                                     │
                       └──────── 역머지(release 수정·hotfix) ──┘
```

- `main` = 안정(릴리스된 것만), `develop` = 개발. **모든 PR은 `develop`을
  대상으로** 보내주세요 — 기능·수정은 물론 Dependabot 의존성 갱신도 마찬가지입니다.
  `main`으로 직접 가는 것은 릴리스 브랜치와 핫픽스뿐입니다.
- **릴리스 순서**
  1. `develop`에 쌓인 PR을 머지합니다
  2. `develop`에서 `release/x.y.z`를 땁니다 — 여기서는 버전 bump, `CHANGELOG`
     날짜 확정, 릴리스 직전 수정만 합니다. 새 기능은 `develop`에 계속 들어가되
     이 브랜치로는 오지 않습니다
  3. `release/x.y.z` → `main` PR을 올리고 CI 통과 후 머지합니다
  4. `main`에서 `vx.y.z` 태그를 밀면 release 워크플로가 빌드·초안 릴리스를 만듭니다
  5. `main` → `develop` 역머지로 릴리스 브랜치의 수정을 돌려보냅니다
- **핫픽스**는 `main`에서 분기해 `main`으로 머지·태그한 뒤 `develop`으로 역머지합니다.
- 커밋 메시지는 [Conventional Commits](https://www.conventionalcommits.org/ko/v1.0.0/):
  `feat:` `fix:` `docs:` `test:` `refactor:` `chore:` `style:`
- 제목은 명령형 현재형으로, 본문에는 **왜** 그렇게 고쳤는지를 적어주세요.

## 코드 방향

- **테스트로 동작을 고정합니다.** 버그 수정에는 그 버그를 재현하는 테스트를 함께
  넣어주세요 — 이 저장소의 회귀 테스트 상당수가 실제로 겪은 버그에서 나왔습니다.
- 파일이 커지면 책임별로 쪼갭니다. 백엔드는 `store`(디스크) · `session`(창 복원
  정책) · `windows`(창 생성) · `commands`(프런트 API)로, 노트 창의 부수효과는
  `src/note/hooks/`의 훅으로 나뉘어 있습니다.
- 주석은 **왜**를 적습니다. 무엇을 하는지는 코드가 말합니다.
- 창을 만들거나 없애는 Tauri 커맨드는 **반드시 `async`**여야 합니다. 동기 커맨드는
  메인 스레드에서 실행되는데 Windows에서 웹뷰 창 생성은 메인 스레드의 메시지
  펌프를 기다리므로 데드락합니다.
- 프런트가 프로그램적으로 구분하는 에러는 `NOTE_NOT_FOUND` 하나뿐입니다
  (밖에서 삭제된 노트의 창을 닫는 용도). 이 문자열은 계약이라 바꾸면 안 됩니다.

## 버저닝

0.x 동안에는 **기능 추가도 패치 릴리스**로 나갑니다. 마이너·메이저는 큰 전환에만
올립니다. 사용자에게 보이는 변경은 `CHANGELOG.md`의 `Unreleased`에 적어주세요.

## 이슈

버그는 재현 절차·기대 동작·실제 동작을, 가능하면 OS와 앱 버전(설정 화면 하단)을
함께 적어주세요. 화면이 관련되면 스크린샷이 큰 도움이 됩니다.
