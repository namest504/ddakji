# ddakji-mcp

[한국어](mcp.ko.md) · **English**

An MCP (Model Context Protocol) stdio server. MCP clients like Claude Desktop
can read and write ddakji notes as tools. Ships as `ddakji-mcp.exe` in the
portable zip and the installer.

It shares the CLI's storage rules, so collection ordering, auto-dissolve, and
whole-collection merges behave exactly like the GUI — and if the app is
running, changes appear on screen immediately.

## Registration

Don't type the path by hand — **ask the server**: it prints a config block
with its own location filled in:

```sh
ddakji-mcp --print-config
```

```json
{
  "mcpServers": {
    "ddakji": {
      "command": "C:\\path\\to\\ddakji-mcp.exe"
    }
  }
}
```

**Claude Desktop** — paste the output into `claude_desktop_config.json`.

**Claude Code**:

```sh
claude mcp add ddakji -- /path/to/ddakji-mcp
```

## Tools

| Tool            | What it does                                                |
| --------------- | ----------------------------------------------------------- |
| `list_notes`    | Every note (metadata + body JSON)                           |
| `get_note`      | Read one note                                               |
| `create_note`   | New note — body (Markdown), optional group/color/title/open |
| `append_note`   | Append at the end — safer than edit for open notes          |
| `edit_note`     | Replace the whole body                                      |
| `set_note_meta` | Change collection/color/title (empty string clears)         |
| `delete_note`   | Move to the trash (undo with `restore_note`)                |
| `list_trash`    | List the trash with deletion times                          |
| `restore_note`  | Restore from the trash                                      |
| `list_groups`   | List collection names                                       |
| `merge_notes`   | Merge moved (and its collection) into target's collection   |
| `open_note`     | Open a note window on the user's screen (starts the app)    |

Tool failures (missing note, …) come back as `isError` results — e.g. `NOTE_NOT_FOUND`.
