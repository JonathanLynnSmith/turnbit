// Shared by the renderer and tests. Each page retains its highlighted row.
class WheelNavigation {
  constructor(root) {
    this.stack = [this.prepare(root)];
    this.idlePage = null;
    this.musicPath = null;
    this.browsingPath = null;
  }
  prepare(page) {
    return { kind: 'list', rows: [], selected: 0, ...page };
  }
  get current() {
    return this.idlePage || this.stack[this.stack.length - 1];
  }
  push(page) {
    this.dismissIdle();
    const next = this.prepare(page);
    this.stack.push(next);
    return next;
  }
  reset(root) {
    this.dismissIdle();
    this.stack = [this.prepare(root)];
    this.musicPath = null;
    this.browsingPath = null;
  }
  goHome() {
    this.dismissIdle();
    this.stack = [this.stack[0]];
    return this.current;
  }
  rememberMusic() {
    const index = this.stack.findLastIndex((page) =>
      ['playlist', 'songs'].includes(page.libraryKind),
    );
    if (index < 0) return null;
    this.browsingPath = this.stack.slice(0, index + 1);
    return this.browsingPath;
  }
  returnToMusic() {
    const path = this.musicPath || this.browsingPath || this.rememberMusic();
    if (!path) return false;
    this.dismissIdle();
    this.stack = [...path];
    return true;
  }
  back() {
    if (this.dismissIdle()) return this.current;
    if (this.stack.length > 1) this.stack.pop();
    return this.current;
  }
  showIdle() {
    if (this.current.kind === 'now') return false;
    this.idlePage = this.prepare({ title: 'Now Playing', kind: 'now' });
    return true;
  }
  dismissIdle() {
    const active = !!this.idlePage;
    this.idlePage = null;
    return active;
  }
  move(delta) {
    const page = this.current;
    if (page.kind !== 'list' || !Number.isInteger(delta) || !page.rows.length)
      return;
    page.selected = Math.max(
      0,
      Math.min(page.rows.length - 1, page.selected + delta),
    );
  }
  select() {
    const page = this.current;
    const row = page.rows[page.selected];
    return page.kind === 'list' && row && !row.disabled ? row : null;
  }
}
class IdleNowPlaying {
  constructor(navigation, { timeout = 10000, now = () => Date.now() } = {}) {
    this.nav = navigation;
    this.timeout = timeout;
    this.now = now;
    this.lastActivity = now();
  }
  noteActivity() {
    this.lastActivity = this.now();
  }
  wake() {
    this.noteActivity();
    return this.nav.dismissIdle();
  }
  tick(allowed = true) {
    if (!allowed) {
      this.noteActivity();
      return false;
    }
    if (this.now() - this.lastActivity < this.timeout) return false;
    return this.nav.showIdle();
  }
}
if (typeof module !== 'undefined')
  module.exports = { WheelNavigation, IdleNowPlaying };
else {
  window.WheelNavigation = WheelNavigation;
  window.IdleNowPlaying = IdleNowPlaying;
}
