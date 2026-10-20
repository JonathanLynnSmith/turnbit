const path = require('node:path');
const readline = require('node:readline');
// Runs media-session-helper.ps1 and keeps the latest Spotify desktop session state.
// The helper targets Spotify's own Windows media session, so commands never hit YouTube or other players.
class MediaSession {
  constructor(onState = () => {}, options = {}) {
    this.onState = onState;
    this.spawn = options.spawn || require('node:child_process').spawn;
    this.script =
      options.script ||
      path
        .join(__dirname, 'media-session-helper.ps1')
        .replace('app.asar', 'app.asar.unpacked');
    this.timeout = options.timeout || 3000;
    this.now = options.now || (() => Date.now());
    this.state = { available: false };
    this.at = 0;
    this.nextId = 1;
    this.waiting = new Map();
    this.retry = 2000;
    this.stopped = true;
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.launch();
  }
  launch() {
    if (this.stopped) return;
    const child = (this.child = this.spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this.script,
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
    ));
    child.on('error', () => {});
    readline
      .createInterface({ input: child.stdout })
      .on('line', (line) => this.receive(line));
    child.on('exit', (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.update({ available: false });
      for (const { resolve } of this.waiting.values()) resolve(false);
      this.waiting.clear();
      // Exit code 2 means media sessions are unsupported on this machine; do not keep respawning.
      if (this.stopped || code === 2) return;
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => this.launch(), this.retry);
      this.restartTimer.unref?.();
      this.retry = Math.min(this.retry * 2, 30000);
    });
  }
  receive(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type === 'state') {
      this.retry = 2000;
      this.update(message);
    } else if (message.type === 'result') {
      const entry = this.waiting.get(message.id);
      if (entry) {
        clearTimeout(entry.timer);
        this.waiting.delete(message.id);
        entry.resolve(!!message.ok);
      }
    }
  }
  update(message) {
    const { type, ...state } = message;
    this.state = { available: false, ...state };
    this.at = this.now();
    this.onState(this.current());
  }
  // Position projected to now, since the helper only reports on change.
  current() {
    const state = this.state;
    if (!state.available || !state.playing || !(state.durationMs > 0))
      return { ...state };
    return {
      ...state,
      positionMs: Math.min(
        state.durationMs,
        state.positionMs + this.now() - this.at,
      ),
    };
  }
  command(cmd, value) {
    if (!this.child || !this.state.available) return Promise.resolve(false);
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        resolve(false);
      }, this.timeout);
      timer.unref?.();
      this.waiting.set(id, { resolve, timer });
      this.child.stdin.write(JSON.stringify({ id, cmd, value }) + '\n');
    });
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.restartTimer);
    const child = this.child;
    this.child = null;
    child?.stdin.end();
    child?.kill();
  }
}
module.exports = { MediaSession };
