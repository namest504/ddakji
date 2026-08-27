# Manual release (#141) - replaces release.yml (Actions billing).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 0.1.8
# Prereqs: main checked out, private key at C:\Users\gnt\.tauri\ddakji.key
#          (losing the key severs the update channel - keep a backup).
# NOTE: ASCII only in this file - PowerShell 5.1 reads BOM-less UTF-8 as ANSI
#       and non-ASCII comments can corrupt parsing.
param([Parameter(Mandatory)][string]$Version)
$ErrorActionPreference = "Stop"

# Tauri v2 reads TAURI_SIGNING_PRIVATE_KEY (key CONTENT; the _PATH variant is ignored)
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "C:\Users\gnt\.tauri\ddakji.key" -Raw
# empty password must be EXPLICIT or the CLI prompts and hangs headless runs
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
npm run tauri build
if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }

$nsis = "src-tauri/target/release/bundle/nsis"
$setup = "$nsis/ddakji_${Version}_x64-setup.exe"
if (-not (Test-Path $setup)) { throw "missing $setup" }
if (-not (Test-Path "$setup.sig")) { throw "missing $setup.sig - signing did not run" }

cargo build --release --manifest-path src-tauri/Cargo.toml --bin ddakji-cli --bin ddakji-mcp
if ($LASTEXITCODE -ne 0) { throw "cargo build failed" }
Compress-Archive -Force `
  -Path src-tauri/target/release/ddakji.exe, src-tauri/target/release/ddakji-cli.exe, src-tauri/target/release/ddakji-mcp.exe `
  -DestinationPath "ddakji-v$Version-portable-x64.zip"

$sig = (Get-Content "$setup.sig" -Raw).Trim()
$manifest = @{
  version  = $Version
  pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = @{ "windows-x86_64" = @{
    signature = $sig
    url = "https://github.com/namest504/ddakji/releases/download/v$Version/ddakji_${Version}_x64-setup.exe"
  } }
} | ConvertTo-Json -Depth 4
Set-Content -Path "latest.json" -Value $manifest -Encoding utf8

Write-Output "Assets to upload:"
Write-Output "  $setup"
Write-Output "  ddakji-v$Version-portable-x64.zip"
Write-Output "  latest.json"
