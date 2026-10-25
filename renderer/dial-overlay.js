// Browsing is temporary; returning to the player keeps the navigation stack.
class DialOverlay {
  constructor({ now = () => Date.now(), timeout = 8000, hold = 420 } = {}) {
    Object.assign(this, { now, timeout, hold });
    this.visible = false;
    this.lastInput = 0;
    this.heldAt = null;
  }
  show() {
    const opened = !this.visible;
    this.visible = true;
    this.lastInput = this.now();
    this.heldAt = null;
    return opened;
  }
  hide() {
    const changed = this.visible;
    this.visible = false;
    this.heldAt = null;
    return changed;
  }
  // The timeout can close in two steps. `rewind` puts the menu back on the list the playing song came
  // from while it is still on screen; the menu then holds there long enough to be seen and goes on the
  // tick that finds the hold over. Without a rewind to show, the timeout closes it outright as before.
  tick(protectedView = false, rewind = null) {
    if (!this.visible) return false;
    if (protectedView) {
      this.lastInput = this.now();
      this.heldAt = null;
      return false;
    }
    if (this.heldAt !== null)
      return this.now() - this.heldAt >= this.hold ? this.hide() : false;
    if (this.now() - this.lastInput < this.timeout) return false;
    if (rewind?.()) {
      this.heldAt = this.now();
      return false;
    }
    return this.hide();
  }
}
if (typeof module !== 'undefined') module.exports = { DialOverlay };
else window.DialOverlay = DialOverlay;
