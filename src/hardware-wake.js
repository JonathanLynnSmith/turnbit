// Consume the whole wake gesture, including release events arriving after wake.
class HardwareWakeGate {
  constructor(visibility, { now = () => Date.now() } = {}) {
    this.visibility = visibility;
    this.now = now;
    this.centerUntil = 0;
    this.centerConsumed = false;
    this.clickConsumed = false;
    this.menuConsumed = false;
  }
  handle(event) {
    if (event.type === 'heartbeat') return 'forward';
    // 'touch' is sent on every macro key press (Play, Like, ...) before the action itself, so it is not a dial gesture.
    if (
      this.dialOnlyWake &&
      event.type !== 'dial' &&
      !['center-down', 'center-up', 'center-click', 'select'].includes(
        event.command,
      )
    )
      return 'forward';
    if (this.now() > this.centerUntil) {
      this.centerConsumed = false;
      this.clickConsumed = false;
    }
    const idle = this.visibility.isIdle();
    this.visibility.wake();
    const command = event.command;
    if (command === 'center-down') {
      this.centerConsumed = idle;
      this.clickConsumed = false;
      this.centerUntil = this.now() + 15000;
      return idle ? 'wake' : 'forward';
    }
    if (command === 'center-up') {
      this.clickConsumed = this.centerConsumed;
      this.centerConsumed = false;
      return 'ignore';
    }
    if (command === 'center-click') {
      const consumed = this.clickConsumed;
      this.clickConsumed = false;
      return idle || consumed ? 'wake' : 'forward';
    }
    if (event.type === 'dial')
      return idle || this.centerConsumed ? 'wake' : 'forward';
    if (command === 'menu-down') {
      this.menuConsumed = idle;
      return idle ? 'wake' : 'forward';
    }
    if (command === 'menu-up') {
      const consumed = this.menuConsumed;
      this.menuConsumed = false;
      return consumed ? 'wake' : 'forward';
    }
    if (['menu', 'back', 'select'].includes(command))
      return idle ? 'wake' : 'forward';
    return 'forward';
  }
}
module.exports = { HardwareWakeGate };
