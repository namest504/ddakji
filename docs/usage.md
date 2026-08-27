# ddakji usage

[한국어](usage.ko.md) · **English**

Widget-style Markdown sticky notes. Lives in the tray; one note is one window.

## Install & run

- **Installer**: run `ddakji_x.y.z_x64-setup.exe` from [Releases](../../../releases)
- **Portable**: unzip `ddakji-x.y.z-portable-x64.zip` and run `ddakji.exe`
  - Note data lives in `%APPDATA%\Ddakji` even for the portable build
  - If you move the exe, toggle "Start at login" in the tray to refresh the path

Closing windows doesn't quit the app — it stays in the tray. Quit via tray → Quit.

## Tray · Alt-Tab

- **Tray icon**: New note / Note list / Show all notes / Start at login / Quit
- **Alt-Tab and the taskbar** show **one** ddakji entry no matter how many notes
  are open. Selecting it (or clicking the taskbar icon) shows your notes —
  collections stay folded to one window. The thumbnail is the note you looked
  at most recently.

## The note window

Normally you only see your content. Hover the **top** of the window for the
toolbar, the **bottom** for the format bar.

### Top toolbar

| Button           | What it does                                                             |
| ---------------- | ------------------------------------------------------------------------ |
| ＋               | New note (`Ctrl+N`)                                                      |
| ● (color circle) | Pick one of 7 paper colors — the circle shows the current color          |
| Aa               | Pick a font (presets + your favorite fonts)                              |
| ↗ (in a group)   | Pop this note out of its collection into its own window (`Ctrl+Shift+P`) |
| pin              | Toggle always-on-top                                                     |
| A− / A＋         | Text size (10–40px)                                                      |
| ☰               | Note list window (`Ctrl+L`)                                              |
| ↓ (in a group)   | Hide just this page — the window shows the next one (`Ctrl+W`)           |
| ✕                | Hide this window — the whole collection if grouped (`Ctrl+Shift+W`)      |

Deleting a note lives on its back side — press the hatched corner at the bottom right.

### Hiding, deleting, and the trash

Hiding only clears a note off your screen. Hidden notes keep their file and
their list entry — dimmed with a **Hidden** chip so you can tell — and open
again from the list. While hidden they don't come
back on restart and don't appear in collection arrows or dots.

Deleting sends a note **to the trash.** It leaves the list, but the file
remains, and you can **restore** it from the trash (🗑) in the list window —
whether it was deleted from the note's back side, the list row, or
`ddakji-cli delete`.

Files only truly disappear on **Delete forever** and **Empty** in the trash
view — those are the only irreversible actions. Images embedded in a note are
kept alongside it while it sits in the trash.

- Drag the empty part of the toolbar to move the window. Resize at the edges.
- Text size also responds to `Ctrl+wheel` and `Ctrl+±`.

### Bottom format bar

**B** bold · _I_ italic · <u>U</u> underline · ~~ab~~ strikethrough · bullet
list · checkbox · indent/outdent (shown inside lists) · **clear formatting**
(reset headings/lists/marks to plain text) · insert image

Click an image to select it, then **drag to move it**. Hovering an image shows
a hatched grip at its bottom right — **drag to resize**, **double-press to go
back to the original size**. Only resized images are saved as `<img width>`;
untouched ones stay plain Markdown (`![](path)`).

## Markdown input

You always edit the rendered view. Type the syntax and it **converts as you type**:

| Input                     | Result        |
| ------------------------- | ------------- |
| `# `, `## `, `### `       | Heading 1·2·3 |
| `- ` or `* `              | Bullet list   |
| `1. `                     | Numbered list |
| `> `                      | Quote         |
| `**bold**`                | **bold**      |
| `*italic*`                | _italic_      |
| `~~strike~~`              | ~~strike~~    |
| `` `code` ``              | Inline code   |
| ` ``` `                   | Code block    |
| `---`                     | Divider       |
| `\| a \| b \|` + rule row | Table (below) |

**Tables** render from plain GFM syntax, typed or pasted:

```
| input | action |
| --- | --- |
| Esc | normal mode |
```

In a narrow window only the table scrolls horizontally (same for code blocks).

**Pasting Markdown**: pasted text containing Markdown syntax comes in as
formatting — tables, checkboxes, headings and all.

### Shortcuts

| Key                            | Action                                                     |
| ------------------------------ | ---------------------------------------------------------- |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Bold / italic / underline                                  |
| `Ctrl+Shift+S`                 | Strikethrough                                              |
| `Tab` / `Shift+Tab`            | List indent / outdent                                      |
| `Enter` (in a list)            | Next item; again on an empty item ends the list            |
| `Ctrl+wheel`, `Ctrl+±`         | Text size                                                  |
| `Ctrl+N` / `Ctrl+L`            | New note / note list                                       |
| `Ctrl+W`                       | Hide this page — in a collection the window shows the next |
| `Ctrl+Shift+W`                 | Hide this window — the whole collection                    |
| `Alt+←/→`                      | Previous/next note in the collection                       |
| `Ctrl+Shift+P`                 | Pop out of the collection — the window shows the next note |

## Images

All three routes place the image inline:

1. **Paste** a clipboard image such as a screenshot (`Ctrl+V`)
2. **Drag & drop** an image file onto the window (png/jpg/gif/webp)
3. The **image button** on the format bar → file picker

## Sharing & export

From the **back side** of a note (hatched corner, bottom right):

- **Copy formatted** — puts styled HTML (images embedded) and plain Markdown on
  the clipboard together. Rich apps (mail, Notion, Word) get formatting;
  plain-text targets get Markdown.
- **Markdown** — saves a `.md`. If the note has images you get a **zip** with
  `note.md` + `assets/`, so image paths work as soon as it's unzipped.
- **HTML** — a **single self-contained HTML file** with images embedded.
  Double-click and the structure and images render in any browser.

Either way, machine-local details (frontmatter: window position, fonts) are
never included.

## Updates

On launch the app quietly checks for a new version. If one exists, an
"Update to vX" button appears at the top of the **note list window**; pressing
it downloads, installs, and restarts. Installer builds only — running portable,
the button opens the releases page instead. A failed check (offline, …) is
silently retried on the next launch.

## Collections (note groups)

Group related notes and flip through them in one window, like pages.
**A collection always shows as exactly one window** — paging (arrows, dots,
`Alt+←/→`) happens inside it.

- **Grouping**: **drag one note window onto another** and they merge.
  In the list window, use the check button to select several and group them at
  once. The merge is judged by **where the cursor is when you release** — drop
  with the cursor over the other note and they merge; overlapping windows with
  the cursor on empty desktop don't. While overlapping, the window dims as a
  preview, and nothing happens until you **release the mouse** — pausing
  mid-drag doesn't merge. A brief **Undo** appears right after a merge.
- **Paging**: `Alt+←/→`, the ‹ › arrows on the window edges, or the dots
  (●○○) at the bottom. Opening another member from the list doesn't spawn a
  window — the collection window switches to it.
  The last page you viewed is remembered: reopening the app opens that page
  (or the first, if it was deleted or hidden).
- **Popping out**: ↗ or `Ctrl+Shift+P` — the current note **leaves the
  collection** into its own window, and the collection window shows the next
  note. To put it back, drag it on, or group it from the list.
- **Renaming**: hover the group heading in the list window and use the pencil.
  A name that already exists is rejected — merge collections by dragging.
- **Ungrouping**: pop out (↗), or select in the list and "Ungroup".
  A collection left with a single member dissolves automatically.

## The note list

Tray → Note list, or ☰ in the toolbar. Search (body and custom titles), open,
delete; the trash at the top right restores or permanently deletes notes; the
gear opens Settings. Each row's ⓘ **Details** sets a custom list title, shows
created/modified times, and **opens the file location** (selects the actual
`.md` in Explorer).

**Importing Markdown files**: the ↓ button in the header turns existing `.md`
files into notes. Multi-select works; originals are left untouched.

## Settings

- **Theme**: System (follows OS dark mode) / Light / Dark
- **Language**: System (follows OS language) / 한국어 / English — notes, list, and tray all switch
- **New note defaults**: color, font, text size
- **Favorite fonts**: "Add font" searches installed fonts — favorites appear in the note toolbar's Aa popover
- **Start at login**, **open data folder**, version info

## Data

Notes are stored as plain Markdown (+ YAML frontmatter) under
`%APPDATA%\Ddakji\notes\*.md`. Filenames are creation-time based
(`20260805-134024-a1b2c3.md`), so the folder sorts chronologically. Images are
stored as original files under `assets\<note id>\` with only relative paths in
the body. Deleted notes move to `trash\` and stay there — no file disappears
until you empty the trash. Back up by copying the folder.

The storage location can be changed in Settings → Change storage location
(data is moved, then the app restarts).

If a note's file is deleted externally, its open window closes itself.
