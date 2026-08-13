---
name: ddakji
description: 사용자의 ddakji(마크다운 스티키노트 앱) 노트를 읽거나 쓸 때 사용 — "메모해둬/노트에 적어둬/딱지에 남겨", 노트 조회·수정·모음집 정리, 작업 결과를 데스크톱 메모로 남기기. ddakji-cli 사용법과 규칙.
---

# ddakji 노트 다루기

ddakji는 사용자의 Windows 데스크톱 마크다운 스티키노트 앱이다. 노트는 평문
`.md` 파일이고, **CLI로 읽고 쓰면 실행 중인 앱 화면에도 ~2초 안에 반영**된다
(외부 변경 브리지). 앱이 꺼져 있어도 당연히 동작한다.

## CLI 찾기

`ddakji-cli`가 PATH에 있으면 그대로 쓴다. 없으면 아래 순서로 찾는다 —
**위에서부터 먼저 있는 것**을 쓴다.

| 순서 | 위치                                                         |
| ---- | ------------------------------------------------------------ |
| 1    | `ddakji-cli` (PATH)                                          |
| 2    | 설치본 — `%LOCALAPPDATA%\Programs\ddakji\ddakji-cli.exe`     |
| 3    | 포터블 — 압축을 푼 폴더의 `ddakji-cli.exe`                   |
| 4    | 개발 빌드 — `<레포>/src-tauri/target/release/ddakji-cli.exe` |

WSL에서는 Windows 실행 파일을 그대로 부를 수 있다(interop):

```sh
CLI=$(command -v ddakji-cli || echo /mnt/c/Users/$USER/AppData/Local/Programs/ddakji/ddakji-cli.exe)
$CLI list
```

찾지 못하면 사용자에게 앱 설치 위치를 묻는다. 추측해서 아무 경로나 만들지 말 것.

## 명령

| 명령                     | 동작                                                                            |
| ------------------------ | ------------------------------------------------------------------------------- |
| `list`                   | 전체 목록 — `id<TAB>모음집<TAB>첫 줄` (무소속은 `-`)                            |
| `get <id>`               | 본문 출력. `--json`이면 메타 포함 전체                                          |
| `add <본문>`             | 새 노트. `--group` `--color` `--title` `--open`(창 열기) 옵션. 본문 `-` = stdin |
| `append <id> <텍스트>`   | 끝에 덧붙임 (빈 줄 구분). `-` = stdin                                           |
| `edit <id> <본문>`       | 본문 전체 교체                                                                  |
| `set <id> --group G`     | 메타 변경 (`--color`, `--title`도). **빈 문자열 = 해제**                        |
| `delete <id>`            | 휴지통으로 이동                                                                 |
| `trash`                  | 휴지통 목록 — `id<TAB>지운 시각<TAB>첫 줄`                                      |
| `restore <id>`           | 휴지통에서 되살리기                                                             |
| `open <id>`              | 노트를 앱 창으로 연다 (앱이 꺼져 있으면 시작)                                   |
| `groups`                 | 모음집 이름 목록                                                                |
| `merge <moved> <target>` | moved(와 그 모음집 전체)를 target의 모음집으로 통합                             |

전 명령 `--json` 지원. 색상: yellow·green·pink·purple·blue·gray·charcoal.

## 예시

```sh
# 작업 결과를 메모로 남기기 (stdin 파이프)
git log --oneline -5 | $CLI add - --title "오늘 커밋" --group 업무

# 노트 찾아서 내용에 덧붙이기
ID=$($CLI list | grep "장보기" | cut -f1)
$CLI append "$ID" "- [ ] 우유"

# 실수로 지웠을 때
$CLI trash                 # id 확인
$CLI restore <id>

# 파싱은 --json으로
$CLI list --json | jq -r '.[].meta.id'
```

## 규칙·주의

- **id는 추측하지 말 것** — 항상 `list`로 확인 (`YYYYMMDD-HHMMSS-xxxxxx` 형식).
- 본문은 마크다운 (제목·체크박스 `- [ ]`·GFM 표 지원). 한글 인자는 작은따옴표로.
- 모음집 규칙이 GUI와 동일하게 적용됨: 같은 그룹 재지정은 순서 유지, 그룹을
  옮기면 끝에 편입, **멤버가 1명 남으면 모음집 자동 해제**.
- 사용자가 그 노트를 **타이핑 중이면 사용자 편집이 이긴다** (마지막 쓰기 승리)
  — 열린 노트를 통째로 `edit`하는 건 피하고 `append`를 선호할 것.
- `open`/`--open`은 **사용자 화면에 창을 띄운다** — 사용자가 보길 원할 때만.
- `delete`는 사용자가 명시적으로 요청했을 때만. **휴지통으로 가므로 `restore`로
  되돌릴 수 있다** — 다만 앱의 "휴지통 비우기"를 지나면 파일이 실제로 사라진다.
- 실패 시 exit 1 + stderr. 없는 노트는 `NOTE_NOT_FOUND`.
- 노트 파일 직접 읽기(grep 등)는 `%APPDATA%\Ddakji\notes\`(WSL에서는
  `/mnt/c/Users/<사용자>/AppData/Roaming/Ddakji/notes/`)에서 가능하지만,
  **쓰기는 반드시 CLI로** — 저장 규칙(원자적 쓰기·모음집 불변식·휴지통)이
  CLI에만 있다.

## 이 문서 갱신하기

이 파일은 앱과 함께 배포된다. 최신본을 다시 심으려면:

```sh
ddakji-cli skill --install              # 기본: ~/.claude/skills/ddakji/
ddakji-cli skill --install --dir DIR    # 위치 지정 (WSL에서 쓸 때)
ddakji-cli skill                        # stdout으로 출력만
```
