---
name: ddakji
description: Read or write the user's ddakji (Markdown sticky notes) notes — "메모해둬/노트에 적어둬/딱지에 남겨", "note this down", browsing or editing notes and collections, leaving work results as desktop notes. Covers ddakji-cli usage and rules.
---

# Working with ddakji notes

ddakji is the user's Windows desktop Markdown sticky-note app. Notes are plain
`.md` files, and **CLI writes show up in the running app within ~2 seconds**
(external-change bridge). Everything works with the app closed, too.

## Finding the CLI

Use `ddakji-cli` from PATH if available. Otherwise probe in this order —
**first hit wins**:

| Order | Location                                                     |
| ----- | ------------------------------------------------------------ |
| 1     | `ddakji-cli` (PATH)                                          |
| 2     | Installed — `%LOCALAPPDATA%\Programs\ddakji\ddakji-cli.exe`  |
| 3     | Portable — `ddakji-cli.exe` next to the unzipped app         |
| 4     | Dev build — `<repo>/src-tauri/target/release/ddakji-cli.exe` |

From WSL you can call the Windows executable directly (interop):

```sh
CLI=$(command -v ddakji-cli || echo /mnt/c/Users/$USER/AppData/Local/Programs/ddakji/ddakji-cli.exe)
$CLI list
```

If none is found, ask the user where the app lives. Never invent a path.

## Commands

| Command                  | What it does                                                               |
| ------------------------ | -------------------------------------------------------------------------- |
| `list`                   | All notes — `id<TAB>collection<TAB>first line` (`-` = ungrouped)           |
| `get <id>`               | Print the body. `--json` for the full note with metadata                   |
| `add <body>`             | New note. `--group` `--color` `--title` `--open` options. Body `-` = stdin |
| `append <id> <text>`     | Append at the end (blank-line separated). `-` = stdin                      |
| `edit <id> <body>`       | Replace the whole body                                                     |
| `set <id> --group G`     | Change metadata (also `--color`, `--title`). **Empty string clears**       |
| `delete <id>`            | Move to the trash                                                          |
| `trash`                  | Trash listing — `id<TAB>deleted at<TAB>first line`                         |
| `restore <id>`           | Restore from the trash                                                     |
| `open <id>`              | Open the note in an app window (starts the app if closed)                  |
| `groups`                 | Collection names                                                           |
| `merge <moved> <target>` | Merge moved (and its whole collection) into target's collection            |

Every command supports `--json`. Colors: yellow, green, pink, purple, blue, gray, charcoal.

## Examples

```sh
# Leave work results as a note (stdin pipe)
git log --oneline -5 | $CLI add - --title "today's commits" --group work

# Find a note and append to it
ID=$($CLI list | grep "groceries" | cut -f1)
$CLI append "$ID" "- [ ] milk"

# Deleted by mistake
$CLI trash                 # find the id
$CLI restore <id>

# Parse with --json
$CLI list --json | jq -r '.[].meta.id'
```

## Rules and cautions

- **Never guess an id** — always confirm with `list` (`YYYYMMDD-HHMMSS-xxxxxx` format).
- Bodies are Markdown (headings, `- [ ]` checkboxes, GFM tables). Quote non-ASCII arguments.
- Collection rules match the GUI: re-assigning the same group keeps order,
  moving groups appends at the end, **a collection left with one member dissolves**.
- If the user is **typing in that note, their edit wins** (last-write-wins) —
  avoid whole-body `edit` on open notes; prefer `append`.
- `open`/`--open` **puts a window on the user's screen** — only when they want to see it.
- `delete` only on explicit user request. **It goes to the trash, so `restore`
  can undo it** — but once the app's "Empty trash" runs, files are truly gone.
- Failure = exit 1 + stderr. A missing note is `NOTE_NOT_FOUND`.
- Reading note files directly (grep, …) is fine at `%APPDATA%\Ddakji\notes\`
  (WSL: `/mnt/c/Users/<user>/AppData/Roaming/Ddakji/notes/`), but **writes must
  go through the CLI** — the storage rules (atomic writes, collection
  invariants, trash) live only there.

## Updating this document

This file ships with the app. To reinstall the latest copy:

```sh
ddakji-cli skill --install              # default: ~/.claude/skills/ddakji/
ddakji-cli skill --install --dir DIR    # choose a location (needed from WSL)
ddakji-cli skill                        # just print to stdout
```
