param([switch]$Debug)
$ErrorActionPreference = 'Stop'
$studioExe = 'C:\Program Files (x86)\Ulanzi Studio\UlanziDeck.exe'
if (-not (Test-Path -LiteralPath $studioExe)) { throw "Ulanzi Studio not found at $studioExe" }
# Closing the UI can leave this background process running. Restart only Studio.
Get-Process -Name UlanziDeck -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $studioExe } | Stop-Process
if ($Debug) { Start-Process -FilePath $studioExe -ArgumentList '--webRemoteDebug','--log' -WindowStyle Hidden }
else { Start-Process -FilePath $studioExe -WindowStyle Hidden }
Write-Output 'Restarted Ulanzi Studio background process.'
