param([string]$PluginsDirectory = (Join-Path $env:APPDATA 'Ulanzi\UlanziDeck\Plugins'))
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '..\ulanzi-plugin\com.ulanzi.dialpod.ulanziPlugin'
if (-not (Test-Path -LiteralPath $PluginsDirectory -PathType Container)) { throw "Ulanzi Studio plugin folder not found: $PluginsDirectory. Install Studio or pass -PluginsDirectory." }
$destination = Join-Path $PluginsDirectory 'com.ulanzi.dialpod.ulanziPlugin'
if (Test-Path -LiteralPath $destination) {
  $backup = "$destination.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $destination -Destination $backup -Recurse
  Write-Output "Previous plugin backed up to $backup"
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Get-ChildItem -LiteralPath $source | Copy-Item -Destination $destination -Recurse -Force
Write-Output "Installed DialPod plugin at $destination"
Write-Output 'Restart Ulanzi Studio, then assign the DialPod actions to your D100H.'
