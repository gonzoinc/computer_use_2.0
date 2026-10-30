param([switch]$Test,[switch]$Package)
$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Push-Location $projectRoot
try {
    & powershell -NoProfile -File (Join-Path $projectRoot "native/build.ps1")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($Test) {
        if ((Test-Path -LiteralPath (Join-Path $projectRoot ".codex/plugin-schema.json")) -and (Test-Path -LiteralPath (Join-Path $projectRoot ".codex/mcp-schema.json"))) { & node (Join-Path $projectRoot "scripts/validate-package.mjs") --offline } else { & node (Join-Path $projectRoot "scripts/validate-package.mjs") }
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & (Join-Path $projectRoot ".codex/native-host/ComputerUse.NativeHost.exe") --self-test
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & npm.cmd test
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    if ($Package) {
        & node (Join-Path $projectRoot "scripts/prepare-plugin.mjs")
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
} finally {
    Pop-Location
}
