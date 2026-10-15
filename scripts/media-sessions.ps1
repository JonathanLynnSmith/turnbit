# Lists Windows media sessions (SMTC) so we can confirm Spotify is targetable by app ID.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/media-sessions.ps1 [-Pause Spotify]
param([string]$Pause)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op, [type]$type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $task.Wait(); $task.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$current = $manager.GetCurrentSession()
foreach ($session in $manager.GetSessions()) {
  $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $info = $session.GetPlaybackInfo(); $timeline = $session.GetTimelineProperties()
  [pscustomobject]@{
    App      = $session.SourceAppUserModelId
    Current  = ($current -and $current.SourceAppUserModelId -eq $session.SourceAppUserModelId)
    Status   = $info.PlaybackStatus
    Title    = $props.Title
    Artist   = $props.Artist
    Position = '{0:mm\:ss} / {1:mm\:ss}' -f $timeline.Position, $timeline.EndTime
    CanPause = $info.Controls.IsPauseEnabled
  }
}
if ($Pause) {
  $target = $manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match $Pause } | Select-Object -First 1
  if (-not $target) { Write-Host "No session matching '$Pause'."; exit 1 }
  $ok = Await ($target.TryTogglePlayPauseAsync()) ([bool])
  Write-Host "Toggled play/pause on $($target.SourceAppUserModelId): $ok"
}
