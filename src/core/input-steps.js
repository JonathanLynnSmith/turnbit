// Step sizes for volume and seek, shared by every input: hardware keys handled
// in the main process, and the dial, keyboard and mouse handled in the view.
const INPUT_STEPS = {
  // One volume key press, in percent.
  volumeKey: 5,
  // One dial detent while Now Playing or the volume screen is open, in percent.
  volumeDial: 2,
  // One seek key press or Shift+Arrow.
  seekMs: 10000,
};
if (typeof module !== 'undefined') module.exports = { INPUT_STEPS };
else window.TurnbitInput = { INPUT_STEPS };
