# ddakji-mcp

MCP(Model Context Protocol) stdio 서버입니다. Claude Desktop 같은 MCP
클라이언트가 ddakji 노트를 도구로 읽고 쓸 수 있습니다. 포터블 zip에
`ddakji-mcp.exe`로 함께 들어 있습니다.

CLI와 같은 저장소 규칙을 사용하므로 모음집 순서·자동 해제·통째 병합이
GUI와 동일하게 동작하고, 앱이 실행 중이면 변경이 화면에 바로 반영됩니다.

## 등록

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ddakji": {
      "command": "C:\\path\\to\\ddakji-mcp.exe"
    }
  }
}
```

**Claude Code**:

```sh
claude mcp add ddakji -- /path/to/ddakji-mcp
```

## 도구

| 도구            | 동작                                                   |
| --------------- | ------------------------------------------------------ |
| `list_notes`    | 전체 노트 (메타·본문 JSON)                             |
| `get_note`      | 노트 하나 읽기                                         |
| `create_note`   | 새 노트 — body(마크다운), group·color·title·open 선택  |
| `append_note`   | 끝에 덧붙이기 — 열린 노트에는 edit보다 안전            |
| `edit_note`     | 본문 전체 교체                                         |
| `set_note_meta` | 모음집·색·제목 변경 (빈 문자열 = 해제)                 |
| `delete_note`   | 삭제 (되돌릴 수 없음)                                  |
| `list_groups`   | 모음집 이름 목록                                       |
| `merge_notes`   | moved(와 그 모음집 전체)를 target의 모음집으로         |
| `open_note`     | 노트를 사용자 화면의 앱 창으로 (앱이 꺼져 있으면 시작) |

도구 실패(없는 노트 등)는 `isError` 결과로 돌아옵니다 — `NOTE_NOT_FOUND` 등.
