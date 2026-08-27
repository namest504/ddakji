# ddakji-cli

[한국어](cli.ko.md) · **English**

A command-line tool for your notes. Built for AI and script integration, and
shipped as `ddakji-cli.exe` in the portable zip and the installer.

It uses **the same storage rules as the GUI app** — automatic collection
ordering, auto-dissolve when one member remains, whole-collection merges.
The app can be running: it watches for file changes and refreshes its windows.

## Commands

| Command                   | What it does                                              |
| ------------------------- | --------------------------------------------------------- |
| `list`                    | List notes — tab-separated `id · collection · first line` |
| `get <id>`                | Print the body (`--json` for the full note with metadata) |
| `add <body>`              | New note — `--group` `--color` `--title` `--open` options |
| `append <id> <text>`      | Append to a note (separated by a blank line)              |
| `edit <id> <body>`        | Replace the whole body                                    |
| `set <id> --group <name>` | Change metadata — also `--color` `--title`. Empty = clear |
| `delete <id>`             | Move to the trash (undo with `restore`)                   |
| `trash`                   | List the trash — `id · deleted at · first line`           |
| `restore <id>`            | Restore from the trash                                    |
| `open <id>`               | Open a note in an app window (starts the app if needed)   |
| `groups`                  | List collection names                                     |
| `merge <moved> <target>`  | Merge moved (and its collection) into target's collection |
| `skill`                   | Print the AI agent guide (`--install` to install it)      |

Common options: `--json` (JSON output for scripts and AI),
`--data-dir <path>` (defaults to the app's data folder).

## Examples

```sh
# Create a note from a pipeline — '-' in the body slot reads stdin
git log --oneline -5 | ddakji-cli add - --title "today's commits" --group work

# Read everything in an AI-friendly form
ddakji-cli list --json

# Create and open a window right away
ddakji-cli add "quick note" --open

# Append a line to an existing note
ddakji-cli append 20260810-171234-7b71ea "- [ ] tomorrow"

# Deleted by mistake?
ddakji-cli trash
ddakji-cli restore 20260810-171234-7b71ea
```

## Handing it to an AI agent

The `skill` command emits a usage guide for agents. **The document is embedded
in the executable**, so updating the app updates the guide with it — no
separately-maintained copy drifting out of date.

```sh
ddakji-cli skill                        # print to stdout
ddakji-cli skill --install              # install to ~/.claude/skills/ddakji/SKILL.md
ddakji-cli skill --install --dir DIR    # choose the location
```

Calling the Windows executable from WSL requires `--dir` — the Windows exe
cannot see the Linux home (`/home/...`), so the default lands in `C:\Users\...`:

```sh
ddakji-cli.exe skill --install --dir ~/.claude/skills
```

Note that **the working directory must be inside WSL** when you do this. To a
Windows process `/home/...` means "from the current drive's root"; run from
inside WSL the current directory is `\\wsl.localhost\...` so the path resolves
to the Linux home, but run from somewhere on `C:` it lands in `C:\home\...` —
check the printed path.

## Exit codes

0 on success, 1 on failure (message on stderr). A missing note is `NOTE_NOT_FOUND`.

For MCP clients (Claude Desktop and friends) see [docs/mcp.md](mcp.md).
