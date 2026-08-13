# ddakji-cli

노트를 명령줄에서 다루는 도구입니다. AI·스크립트 연동을 위해 만들어졌고,
포터블 zip에 `ddakji-cli.exe`로 함께 들어 있습니다.

GUI 앱과 **같은 저장소 규칙**을 그대로 사용합니다 — 모음집 순서 자동 부여,
멤버가 1명 남으면 자동 해제, 통째 병합까지 전부 동일하게 동작합니다.
앱이 켜져 있어도 됩니다: 앱은 파일 변경을 감지해 화면을 갱신합니다.

## 명령

| 명령                      | 동작                                                  |
| ------------------------- | ----------------------------------------------------- |
| `list`                    | 노트 목록 — `id · 모음집 · 첫 줄` 탭 구분             |
| `get <id>`                | 본문 출력 (`--json`이면 메타 포함 전체)               |
| `add <본문>`              | 새 노트 — `--group` `--color` `--title` `--open` 옵션 |
| `append <id> <텍스트>`    | 노트 끝에 덧붙이기 (빈 줄로 구분)                     |
| `edit <id> <본문>`        | 본문 전체 교체                                        |
| `set <id> --group <이름>` | 메타 변경 — `--color` `--title`도. 빈 문자열 = 해제   |
| `delete <id>`             | 휴지통으로 보내기 (`restore`로 되돌림)                |
| `trash`                   | 휴지통 목록 — `id · 지운 시각 · 첫 줄` 탭 구분        |
| `restore <id>`            | 휴지통에서 되살리기                                   |
| `open <id>`               | 노트를 앱 창으로 연다 (앱이 꺼져 있으면 시작)         |
| `groups`                  | 모음집 이름 목록                                      |
| `merge <moved> <target>`  | moved(와 그 모음집 전체)를 target의 모음집으로 통합   |
| `skill`                   | AI 에이전트용 설명서 출력 (`--install`이면 심는다)    |

공통 옵션: `--json`(스크립트·AI용 JSON 출력), `--data-dir <경로>`(기본은 앱과
같은 데이터 폴더).

## 예시

```sh
# 파이프라인으로 노트 만들기 — 본문 자리의 '-'는 stdin
git log --oneline -5 | ddakji-cli add - --title "오늘 커밋" --group 업무

# AI가 읽기 좋은 형태로 전체 조회
ddakji-cli list --json

# 만들면서 바로 창으로 열기
ddakji-cli add "빠른 메모" --open

# 기존 노트에 한 줄 덧붙이기
ddakji-cli append 20260810-171234-7b71ea "- [ ] 내일 할 일"

# 실수로 지웠을 때
ddakji-cli trash
ddakji-cli restore 20260810-171234-7b71ea
```

## AI 에이전트에 물려 주기

`skill` 명령이 에이전트용 사용 설명서를 내놓습니다. **문서는 실행 파일 안에
박혀 있어** 앱을 갱신하면 설명서도 같이 갱신됩니다 — 따로 관리하던 사본이
낡아 실제 동작과 어긋나는 일을 없애려는 것입니다.

```sh
ddakji-cli skill                        # stdout으로 출력
ddakji-cli skill --install              # ~/.claude/skills/ddakji/SKILL.md 에 심는다
ddakji-cli skill --install --dir DIR    # 위치 지정
```

WSL에서 Windows 실행 파일을 부를 때는 `--dir`이 필요합니다. Windows 쪽 exe는
리눅스 홈(`/home/...`)을 알지 못해 기본값이 `C:\Users\...`로 잡힙니다:

```sh
ddakji-cli.exe skill --install --dir ~/.claude/skills
```

## 종료 코드

성공 0, 실패 1 (메시지는 stderr). 없는 노트는 `NOTE_NOT_FOUND`.

MCP 클라이언트(Claude Desktop 등) 연동은 [docs/mcp.md](mcp.md)를 보세요.
