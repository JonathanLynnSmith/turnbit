// Browsing is temporary; returning to the player keeps the navigation stack.
class DialOverlay {
  constructor({ now = () => Date.now(), timeout = 8000 } = {}) {
    Object.assign(this, { now, timeout });
    this.visible = false;
    this.lastInput = 0;
  }
  show() {
    const opened = !this.visible;
    this.visible = true;
    this.lastInput = this.now();
    return opened;
  }
  hide() {
    const changed = this.visible;
    this.visible = false;
    return changed;
  }
  tick(protectedView = false) {
    if (!this.visible) return false;
    if (protectedView) {
      this.lastInput = this.now();
      return false;
    }
    return this.now() - this.lastInput >= this.timeout ? this.hide() : false;
  }
}
if (typeof module !== 'undefined') module.exports = { DialOverlay };
else window.DialOverlay = DialOverlay;
