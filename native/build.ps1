param([switch]$Test)
$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$projectFile = Join-Path $projectRoot "native/Host/ComputerUse.NativeHost.csproj"
$nativeOutput = Join-Path $projectRoot ".codex/native-host"
$nativeIntermediate = (Join-Path $projectRoot ".codex/native-obj") + "/"
$nativePackages = (Join-Path $projectRoot ".codex/native-nuget") + "/"
& dotnet build $projectFile -c Release -o $nativeOutput "-p:BaseIntermediateOutputPath=$nativeIntermediate" "-p:RestorePackagesPath=$nativePackages" --nologo
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Test) {
    & (Join-Path $nativeOutput "ComputerUse.NativeHost.exe") --self-test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & node --test (Join-Path $projectRoot "native/bridge.test.mjs")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
