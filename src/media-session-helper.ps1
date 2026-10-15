# Long-running bridge to Windows media sessions (SMTC), targeting only the Spotify desktop app.
# stdout: one JSON object per line ({type:'state'|'result'|'error'}). stdin: one JSON command per line ({id,cmd,value}).
# Commands go to Spotify's own session, never to whichever app Windows considers "current".
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
function Emit($object) { [Console]::Out.WriteLine(($object | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  function Await($op, [type]$type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); if (-not $task.Wait(3000)) { throw 'Media session call timed out.' }; $task.Result }
  $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch { Emit @{ type = 'error'; message = "Windows media sessions unavailable: $($_.Exception.Message)" }; exit 2 }

$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
function Find-Spotify { $manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match '^Spotify\.exe$|SpotifyAB\.SpotifyMusic' } | Select-Object -First 1 }
# Checked every 100ms, so keep it cheap: the session is re-found every 2s, and title/artist (an async call) are
# re-read only when Spotify's status or timeline changes (a new track updates both), or once a second as a backstop.
$session = $null; $sessionAt = [DateTime]::MinValue; $props = $null; $propsKey = ''; $propsAt = [DateTime]::MinValue
function Read-State {
  if (-not $script:session -or ([DateTime]::UtcNow - $script:sessionAt).TotalSeconds -ge 2) { $script:session = Find-Spotify; $script:sessionAt = [DateTime]::UtcNow }
  $session = $script:session
  if (-not $session) { return @{ type = 'state'; available = $false } }
  $info = $session.GetPlaybackInfo(); $timeline = $session.GetTimelineProperties()
  $key = "$($session.SourceAppUserModelId)|$($info.PlaybackStatus)|$($timeline.LastUpdatedTime.UtcTicks)|$($timeline.EndTime.Ticks)"
  if ($key -ne $script:propsKey -or -not $script:props -or ([DateTime]::UtcNow - $script:propsAt).TotalMilliseconds -ge 1000) {
    $script:props = Await ($session.TryGetMediaPropertiesAsync()) $propsType; $script:propsKey = $key; $script:propsAt = [DateTime]::UtcNow
  }
  $props = $script:props
  $playing = $info.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing
  $duration = [long]($timeline.EndTime - $timeline.StartTime).TotalMilliseconds
  # Spotify reports position as of LastUpdatedTime; project it forward while playing.
  $position = [long]$timeline.Position.TotalMilliseconds
  if ($playing -and $timeline.LastUpdatedTime.Year -gt 2000) { $position += [long]([DateTimeOffset]::Now - $timeline.LastUpdatedTime).TotalMilliseconds }
  if ($duration -gt 0) { $position = [Math]::Max(0, [Math]::Min($duration, $position)) }
  @{ type = 'state'; available = $true; app = $session.SourceAppUserModelId; status = "$($info.PlaybackStatus)"; playing = $playing
     title = $props.Title; artist = $props.Artist; album = $props.AlbumTitle; durationMs = $duration; positionMs = $position
     canSeek = $info.Controls.IsPlaybackPositionEnabled; canNext = $info.Controls.IsNextEnabled; canPrevious = $info.Controls.IsPreviousEnabled }
}
function Invoke-Command($command) {
  $session = Find-Spotify
  if (-not $session) { return $false }
  switch ($command.cmd) {
    'play' { Await ($session.TryPlayAsync()) ([bool]) }
    'pause' { Await ($session.TryPauseAsync()) ([bool]) }
    'toggle' { Await ($session.TryTogglePlayPauseAsync()) ([bool]) }
    'next' { Await ($session.TrySkipNextAsync()) ([bool]) }
    'previous' { Await ($session.TrySkipPreviousAsync()) ([bool]) }
    'seek' { Await ($session.TryChangePlaybackPositionAsync([long]([double]$command.value * 10000))) ([bool]) }
    default { $false }
  }
}

# Console.In.ReadLineAsync blocks; a StreamReader over the raw stream reads on the thread pool so polling keeps running.
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
$pending = $stdin.ReadLineAsync()
$last = $null; $lastKey = ''; $lastAt = [DateTime]::UtcNow; $nextRead = [DateTime]::MinValue
while ($true) {
  if ($pending.IsCompleted) {
    $line = $pending.Result
    if ($null -eq $line) { break }
    if ($line.Trim()) {
      $command = $null
      try { $command = $line | ConvertFrom-Json; Emit @{ type = 'result'; id = $command.id; ok = [bool](Invoke-Command $command) } }
      catch { Emit @{ type = 'result'; id = $command.id; ok = $false; error = $_.Exception.Message } }
      $nextRead = [DateTime]::MinValue
    }
    $pending = $stdin.ReadLineAsync()
  }
  if ([DateTime]::UtcNow -ge $nextRead) {
    $nextRead = [DateTime]::UtcNow.AddMilliseconds(100)
    try {
      $state = Read-State
      $key = "$($state.available)|$($state.status)|$($state.title)|$($state.artist)|$($state.album)|$($state.durationMs)|$($state.canSeek)"
      $drift = $false
      if ($last -and $state.available -and $last.available) {
        $expected = $last.positionMs + $(if ($last.playing) { ([DateTime]::UtcNow - $lastAt).TotalMilliseconds } else { 0 })
        $drift = [Math]::Abs($state.positionMs - $expected) -gt 1500
      }
      if ($key -ne $lastKey -or $drift) { Emit $state; $last = $state; $lastKey = $key; $lastAt = [DateTime]::UtcNow }
    } catch { Emit @{ type = 'state'; available = $false; error = $_.Exception.Message }; $lastKey = ''; $session = $null; $props = $null }
  }
  Start-Sleep -Milliseconds 20
}
