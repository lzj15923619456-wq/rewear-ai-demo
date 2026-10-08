param([switch]$NoBrowser, [switch]$Stop)
$ErrorActionPreference = 'Stop'
$demoUrl = 'http://127.0.0.1:4174'
$demoServer = Join-Path $PSScriptRoot 'server.cjs'
function Get-DemoHealth {
    try { Invoke-RestMethod -Uri ($demoUrl + '/__rewear_health') -TimeoutSec 2 }
    catch { $null }
}
$demoHealth = Get-DemoHealth
$demoIsOurs = $demoHealth -and $demoHealth.app -eq 'rewear-local-demo' -and $demoHealth.directory -eq $PSScriptRoot
if ($Stop) {
    if ($demoIsOurs) {
        $demoProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $demoHealth.pid)
        if ($demoProcess -and $demoProcess.Name -eq 'node.exe' -and $demoProcess.CommandLine.Contains($demoServer)) {
            Stop-Process -Id $demoHealth.pid
            Write-Output 'REWEAR stopped.'
        } else { throw 'Process identity could not be verified.' }
    } else { Write-Output 'REWEAR is not running from this folder.' }
    exit 0
}
if (-not $demoIsOurs) {
    $demoListener = Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue
    if ($demoListener) { throw 'Port 4174 is occupied by another service. Close it before starting REWEAR.' }
    $demoNodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $demoNode = if ($demoNodeCommand) { $demoNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
    if (-not (Test-Path -LiteralPath $demoNode)) { throw 'Node.js could not be found. Install Node.js and run this launcher again.' }
    $demoLogs = Join-Path $PSScriptRoot '.runtime'
    New-Item -ItemType Directory -Force -Path $demoLogs | Out-Null
    $demoStarted = Start-Process -FilePath $demoNode -ArgumentList ('"' + $demoServer + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $demoLogs 'server.log') -RedirectStandardError (Join-Path $demoLogs 'server-error.log') -PassThru
    $demoReady = $false
    for ($demoAttempt = 0; $demoAttempt -lt 30; $demoAttempt++) {
        $demoHealth = Get-DemoHealth
        if ($demoHealth -and $demoHealth.app -eq 'rewear-local-demo' -and $demoHealth.directory -eq $PSScriptRoot -and $demoHealth.pid -eq $demoStarted.Id) { $demoReady = $true; break }
        if ($demoStarted.HasExited) { break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $demoReady) { throw ('REWEAR failed to start. See ' + (Join-Path $demoLogs 'server-error.log')) }
}
Write-Output ('REWEAR ready: ' + $demoUrl)
if (-not $NoBrowser) { Start-Process $demoUrl }
