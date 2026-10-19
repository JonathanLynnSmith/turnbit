// Overlay for Keyboard & Mouse Mode: turns scroll and clicks into turnbit input while the shortcut is held.
// A mouse notch scrolls one item; trackpad scrolling adds up until it covers a notch.
const send = (input) => window.mouseMode.send(input),
  NOTCH = 40;
let scrolled = 0;
addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * NOTCH : event.deltaY;
    if (Math.sign(delta) !== Math.sign(scrolled)) scrolled = 0;
    scrolled += delta;
    if (Math.abs(delta) >= NOTCH) {
      scrolled = 0;
      send({ type: 'wheel', delta: Math.sign(delta) });
    } else if (Math.abs(scrolled) >= NOTCH) {
      send({ type: 'wheel', delta: Math.sign(scrolled) });
      scrolled = 0;
    }
  },
  { passive: false },
);
addEventListener('mousedown', (event) => {
  event.preventDefault();
  const action = ['select', 'toggle', 'back'][event.button];
  if (action) send({ type: 'click', action });
});
addEventListener('contextmenu', (event) => event.preventDefault());
addEventListener('auxclick', (event) => event.preventDefault());
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') send({ type: 'exit' });
});
addEventListener('keyup', () => send({ type: 'key-up' }));
