#!/bin/sh
# 전체 검증 — 구 GitHub Actions ci.yml과 동일한 검사 세트.
# 릴리스 태그 전이나 굵직한 변경 후 수동 실행: sh scripts/check-full.sh
set -e

echo "[check] frontend lint/format/build/test"
npm run lint
npm run format:check
npm run build
npm test

echo "[check] rust fmt/clippy/test"
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml

echo "[check] all green"
