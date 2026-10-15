// Ulanzi Studio plugin bridge for the D100H Dial.
// The plugin owns the hardware connection through the supported Ulanzi SDK;
// Electron owns Spotify and the larger desktop UI. Both processes meet on localhost.
const BRIDGE = 'http://127.0.0.1:4765/device/event';
async function send(event) {
  try { await fetch(BRIDGE, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(event) }); }
  catch (error) { console.warn('[DialPod] Electron bridge unavailable', error.message); }
}

$UD.onConnected(evt => {
  console.log('[DialPod] Ulanzi D100H connected', evt);
  send({ type: 'connected', device: 'Ulanzi D100H' });
});
$UD.onKeyUp(evt => {
  send({ type: 'press', raw: evt });
});
$UD.onDialDown(evt => {
  send({ type: 'press', raw: evt });
});
$UD.onDialRotate(evt => {
  // The current Ulanzi SDK reports rotateEvent as left/right.
  const delta = evt?.rotateEvent === 'right' ? 1 : evt?.rotateEvent === 'left' ? -1 : 0;
  if (delta) send({ type: 'dial', delta, raw: evt });
});
