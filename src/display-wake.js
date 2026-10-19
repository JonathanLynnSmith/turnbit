// Dial input reaches turnbit over the bridge, not as keyboard or mouse input, so the OS counts the
// machine as idle the whole time someone is navigating with the D100H and dims, sleeps or starts the
// screensaver mid-use. Hold a display-sleep block while the dial is actually in use and drop it soon
// after, so the machine still sleeps on its own schedule once the dial goes quiet.
// The plugin heartbeats every five seconds; only real input may refresh the block.
class DisplayWake {
  constructor(blocker, { idle = 60000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    Object.assign(this, { blocker, idle, setTimer, clearTimer });
    this.id = null; this.timer = null;
  }
  static wakes(event) { return event?.type === 'dial' || event?.type === 'command'; }
  note(event) {
    if (event !== undefined && !DisplayWake.wakes(event)) return false;
    if (this.id === null) this.id = this.blocker.start('prevent-display-sleep');
    this.clearTimer(this.timer);
    this.timer = this.setTimer(() => this.release(), this.idle);
    this.timer?.unref?.();
    return true;
  }
  release() {
    this.clearTimer(this.timer); this.timer = null;
    if (this.id === null) return;
    const id = this.id; this.id = null;
    if (this.blocker.isStarted(id)) this.blocker.stop(id);
  }
  get active() { return this.id !== null; }
}
module.exports = { DisplayWake };
