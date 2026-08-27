# Contributing

[한국어](CONTRIBUTING.ko.md) · **English**

Issues and PRs are welcome — in English or Korean, whichever is comfortable.

## Development environment

Windows is the primary target, but development and tests also work on
Linux/WSL (transparent windows are Windows-only; Linux renders opaque).

You need Node 20+, stable Rust, and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev     # run the app
```

## Checks

All of the below must pass before a PR (the pre-push hook runs the same set).

```bash
npm run lint          # eslint
npm run format:check  # prettier (npm run format to fix)
npm run build         # tsc --noEmit + vite build
npm test              # vitest

cargo fmt   --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test  --manifest-path src-tauri/Cargo.toml
```

> Don't invoke `cargo build` directly — building without the `custom-protocol`
> feature produces a broken binary with no frontend. Verify with
> `cargo check`/`cargo test`; run with `npm run tauri dev`/`npm run tauri build`.

## Branches and commits

```
feature/fix/deps ─▶ develop ─▶ release/x.y.z ─(stabilize)─▶ main ─▶ tag vx.y.z
                       ▲                                        │
                       └──── back-merge (release fixes/hotfix) ──┘
```

- `main` = stable (releases only), `develop` = working branch. **Target every
  PR at `develop`** — features, fixes, and Dependabot updates alike. Only
  release branches and hotfixes go straight to `main`.
- **Release order**
  1. Merge the PRs queued on `develop`
  2. Branch `release/x.y.z` off `develop` — only the version bump, `CHANGELOG`
     date, and last-minute release fixes happen here. New features keep landing
     on `develop`, not here
  3. Open `release/x.y.z` → `main`, merge once checks pass
  4. Tag `vx.y.z` on `main` to build and draft the release
  5. Back-merge `main` → `develop` to return the release-branch fixes
- **Hotfixes** branch off `main`, merge and tag there, then back-merge to `develop`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:` `fix:` `docs:` `test:` `refactor:` `chore:` `style:`
- Subject in imperative present tense; the body explains **why**.

## Code direction

- **Pin behavior with tests.** A bug fix should come with a test that
  reproduces the bug — most regression tests in this repo came from bugs we
  actually hit.
- Split files by responsibility as they grow. The backend divides into
  `store` (disk) · `session` (window-restore policy) · `windows` (window
  creation) · `commands` (frontend API); note-window side effects live in
  `src/note/hooks/`.
- Comments say **why**. The code says what.
- Tauri commands that create or destroy windows **must be `async`**. Sync
  commands run on the main thread, and webview creation on Windows waits on
  the main thread's message pump — a deadlock.
- The only error the frontend branches on programmatically is
  `NOTE_NOT_FOUND` (used to close windows of externally-deleted notes). That
  string is a contract — don't change it.

## Versioning

During 0.x, **features ship in patch releases too**. Minor/major are reserved
for big transitions. User-visible changes go under `Unreleased` in
`CHANGELOG.md`.

## Docs come in two languages

`README`, `docs/*`, and `CONTRIBUTING` are **canonical in English**, with a
`.ko.md` sibling for Korean. When you touch a doc, please update **both
files** — a PR that changes only one will be asked to fill in the other.

## Issues

For bugs include the reproduction steps, expected and actual behavior, and if
possible your OS and app version (bottom of Settings). Screenshots help a lot
when the screen is involved.
