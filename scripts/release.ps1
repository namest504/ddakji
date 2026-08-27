# 수동 릴리스 (#141) — Actions 결제 문제로 release.yml 대신 로컬에서.
# 사용: powershell -File scripts/release.ps1 -Version 0.1.8
# 전제: main 체크아웃, 개인키 C:\Users\gnt\.tauri\ddakji.key (분실 = 업데이트 채널 단절)
param([Parameter(Mandatory)][string]$Version)
$ErrorActionPreference = "Stop"

$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "C:\Users\gnt\.tauri\ddakji.key"
npm install
npm run tauri build          # NSIS setup + updater 아티팩트(.sig)

cargo build --release --manifest-path src-tauri/Cargo.toml --bin ddakji-cli --bin ddakji-mcp
Compress-Archive -Force `
  -Path src-tauri/target/release/ddakji.exe, src-tauri/target/release/ddakji-cli.exe, src-tauri/target/release/ddakji-mcp.exe `
  -DestinationPath "ddakji-v$Version-portable-x64.zip"

# latest.json — updater 엔드포인트가 읽는 매니페스트
$nsis = "src-tauri/target/release/bundle/nsis"
$setup = "$nsis/ddakji_${Version}_x64-setup.exe"
$sig = Get-Content "$setup.sig" -Raw
$manifest = @{
  version  = $Version
  pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = @{ "windows-x86_64" = @{
    signature = $sig.Trim()
    url = "https://github.com/namest504/ddakji/releases/download/v$Version/ddakji_${Version}_x64-setup.exe"
  } }
} | ConvertTo-Json -Depth 4
Set-Content -Path "latest.json" -Value $manifest -Encoding utf8

Write-Output "업로드할 자산:"
Write-Output "  $setup"
Write-Output "  ddakji-v$Version-portable-x64.zip"
Write-Output "  latest.json"
Write-Output "다음: gh release create v$Version <자산들> --title 'ddakji v$Version' --notes '...'"
