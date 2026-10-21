const { MediaSession } = require('./media-session');
// The macOS counterpart of media-session.js: reads and controls the Spotify desktop app through its
// AppleScript dictionary, so transport skips the Web API on a Mac too. Each read is a short osascript
// run. It only talks to Spotify when Spotify is already running (a plain `tell` would launch it), and
// macOS asks once for permission to control Spotify; if that is declined, playback stays on the Web API.
const SEP = '\u001f';
const STATE_SCRIPT = `if application "Spotify" is running then
  tell application "Spotify"
    set s to player state as string
    if s is "stopped" then return "stopped"
    set t to current track
    set sep to character id 31
    return s & sep & (name of t) & sep & (artist of t) & sep & (album of t) & sep & ((duration of t) as integer) & sep & ((player position * 1000) as integer)
  end tell
end if
return "closed"`;
const COMMANDS = {
  play: 'play',
  pause: 'pause',
  toggle: 'playpause',
  next: 'next track',
  previous: 'previous track',
};
function commandScript(cmd, value) {
  // Whole milliseconds, divided in AppleScript, so no decimal separator depends on the user's locale.
  const action =
    cmd === 'seek'
      ? `set player position to ${Math.max(0, Math.round(value))} / 1000`
      : COMMANDS[cmd];
  return `if application "Spotify" is running then
  tell application "Spotify" to ${action}
  return "ok"
end if
return "closed"`;
}
// Older Spotify releases report duration in seconds; songs are never a couple of hours long in ms.
function parseState(output) {
  const text = String(output).trim();
  if (text === 'closed' || text === 'stopped' || !text.includes(SEP))
    return { available: false };
  const [status, title, artist, album, duration, position] = text.split(SEP);
  let durationMs = Number(duration) || 0;
  if (durationMs > 0 && durationMs < 7200) durationMs *= 1000;
  const positionMs = Math.max(
    0,
    durationMs > 0
      ? Math.min(durationMs, Number(position) || 0)
      : Number(position) || 0,
  );
  return {
    available: true,
    app: 'Spotify',
    status,
    playing: status === 'playing',
    title,
    artist,
    album,
    durationMs,
    positionMs,
    canSeek: durationMs > 0,
    canNext: true,
    canPrevious: true,
  };
}
// macOS error -1743: the user declined, or has not yet allowed, turnbit to control Spotify.
const notAllowed = (error) =>
  /-1743|not authori[sz]ed/i.test(`${error?.message} ${error?.stderr || ''}`);

class MacMediaSession extends MediaSession {
  constructor(onState = () => {}, options = {}) {
    super(onState, options);
    this.execFile = options.execFile || require('node:child_process').execFile;
    this.interval = options.interval || 1000;
    this.reading = null;
    this.lastKey = '';
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.poll();
  }
  run(script) {
    return new Promise((resolve, reject) =>
      this.execFile(
        'osascript',
        ['-e', script],
        { timeout: this.timeout },
        (error, stdout, stderr) =>
          error ? reject(Object.assign(error, { stderr })) : resolve(stdout),
      ),
    );
  }
  schedule(delay) {
    clearTimeout(this.pollTimer);
    if (this.stopped) return;
    this.pollTimer = setTimeout(() => this.poll(), delay);
    this.pollTimer.unref?.();
  }
  poll() {
    if (this.stopped || this.reading) return this.reading;
    this.reading = this.run(STATE_SCRIPT)
      .then(
        (output) => {
          this.publish(parseState(output));
          return this.interval;
        },
        (error) => {
          this.publish({ available: false });
          // Without permission every read fails the same way, so check back rarely.
          return notAllowed(error) ? 30000 : this.interval * 3;
        },
      )
      .then((delay) => {
        this.reading = null;
        this.schedule(delay);
      });
    return this.reading;
  }
  // Like the Windows helper, report changes and position jumps rather than every read.
  publish(state) {
    const key = [
      state.available,
      state.status,
      state.title,
      state.artist,
      state.album,
      state.durationMs,
    ].join('|');
    const expected = this.current();
    const drift =
      state.available &&
      expected.available &&
      Math.abs(state.positionMs - expected.positionMs) > 1500;
    if (key === this.lastKey && !drift) return;
    this.lastKey = key;
    this.update(state);
  }
  async command(cmd, value) {
    if (
      this.stopped ||
      !this.state.available ||
      !(cmd in COMMANDS || (cmd === 'seek' && Number.isFinite(value)))
    )
      return false;
    try {
      const ok =
        String(await this.run(commandScript(cmd, value))).trim() === 'ok';
      // Read straight back so the new state shows without waiting for the next poll.
      if (ok) (this.reading || Promise.resolve()).then(() => this.poll());
      return ok;
    } catch {
      return false;
    }
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
  }
}
module.exports = { MacMediaSession, parseState, commandScript, STATE_SCRIPT };
