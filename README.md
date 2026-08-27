# ddakji

[한국어](README.ko.md) · **English**

Markdown sticky notes for Windows.

Widget-style sticky notes built on Markdown — a Win11 Sticky Notes replacement
with live Markdown editing, collections (groups), images, and themes.

## Features

- One frameless widget window per note, with per-note always-on-top
- Live Markdown editing: type the syntax and it renders instantly; formatting shortcuts and a bottom format bar
- Checkboxes (click to toggle), nested lists (Tab), GFM tables (narrow windows scroll just the table)
- Import existing `.md` files (multi-select); pasted Markdown text is parsed into formatting
- **Collections**: group related notes and flip through them in one window — merge by dragging, navigate with Alt+←/→, edge arrows, or the dot indicator
- 7 paper colors, per-note fonts (installed fonts are searchable), system dark/light theme
- Images: paste, drop, drag to rearrange, resize with the corner grip
- Note list (collection sections, relative times, detail view), search, settings (including storage location)
- **Trash**: however a note was deleted, restore it from the list window — files are only truly gone on purge/empty
- One app entry in Alt-Tab and the taskbar — selecting it shows every note; the thumbnail is your most recent note
- Auto-save, tray icon, start at login, automatic updates, shortcuts (Ctrl+N/W/L, …)
- **CLI & MCP**: scripts use `ddakji-cli`, AI assistants use `ddakji-mcp` — same notes, same rules
- UI in **English and Korean** — follows your OS language, switchable in Settings

## From the terminal and AI

The portable zip and the installer both ship `ddakji-cli` and `ddakji-mcp`.

```sh
ddakji-cli add "today's plan" --open   # create a note and open its window
ddakji-cli list --json                 # read from scripts
ddakji-cli skill --install             # install the AI agent guide into your skills folder
ddakji-mcp --print-config              # print the MCP client registration JSON
```

If the app is running, changes show up in open note windows right away.
Commands: **[docs/cli.md](docs/cli.md)** · MCP tools: **[docs/mcp.md](docs/mcp.md)**.

## Install (Windows)

Grab the latest `ddakji_x.y.z_x64-setup.exe` (installer) or
`ddakji-x.y.z-portable-x64.zip` (portable) from [Releases](../../releases) and run it.

## Usage

**[docs/usage.md](docs/usage.md)** — toolbar and format bar, Markdown input syntax, shortcuts, images, settings.

## Development

`main` holds releases only; `develop` is the working branch. Please target all
PRs at `develop` — releases go through a `release/x.y.z` branch into `main`.

    npm install
    npm run tauri dev     # run the app
    npm test              # frontend tests
    cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests

**[CONTRIBUTING.md](CONTRIBUTING.md)** — how to contribute, check commands, code direction.
**[CHANGELOG.md](CHANGELOG.md)** — per-version history.

## Where your data lives

- Notes: `%APPDATA%/Ddakji/notes/*.md` — plain Markdown with YAML frontmatter
- Filenames are creation-time based (`20260805-134024-a1b2c3.md`)
- Images are stored as originals under `assets/<note id>/`
- The storage location can be changed in Settings

## Stack

Tauri 2 · React · TypeScript · TipTap
