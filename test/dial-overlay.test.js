const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DialOverlay } = require('../renderer/dial-overlay');

test('dial browsing starts hidden, extends on navigation, and dismisses after inactivity', () => {
  let now = 0;
  const overlay = new DialOverlay({ timeout: 8000, now: () => now });
  assert.equal(overlay.visible, false);
  assert.equal(overlay.show(), true);
  now = 7000;
  assert.equal(overlay.tick(), false);
  assert.equal(overlay.show(), false);
  now = 14999;
  assert.equal(overlay.tick(), false);
  now = 15000;
  assert.equal(overlay.tick(), true);
  assert.equal(overlay.visible, false);
  assert.equal(overlay.tick(), false);
});

test('editing and pinning keep the menu open until interaction is finished', () => {
  let now = 0;
  const overlay = new DialOverlay({ timeout: 8000, now: () => now });
  overlay.show();
  now = 20000;
  assert.equal(overlay.tick(true), false);
  now += 7999;
  assert.equal(overlay.tick(), false);
  now++;
  assert.equal(overlay.tick(), true);
  overlay.show();
  assert.equal(overlay.hide(), true);
  assert.equal(overlay.hide(), false);
});

test('the idle close holds the menu open for a rewind to the playing song list, then goes', () => {
  let now = 0,
    rewinds = 0;
  const overlay = new DialOverlay({ timeout: 8000, now: () => now, hold: 400 });
  const rewind = () => {
    rewinds++;
    return true;
  };
  overlay.show();
  now = 7999;
  assert.equal(overlay.tick(false, rewind), false);
  assert.equal(rewinds, 0, 'the rewind waits for the timeout the user set');
  now = 8000;
  assert.equal(
    overlay.tick(false, rewind),
    false,
    'the menu stays up for the switch',
  );
  assert.deepEqual([rewinds, overlay.visible], [1, true]);
  now = 8399;
  assert.equal(overlay.tick(false, rewind), false);
  now = 8400;
  assert.equal(
    overlay.tick(false, rewind),
    true,
    'and goes once the rewind has been seen',
  );
  assert.deepEqual(
    [overlay.visible, rewinds],
    [false, 1],
    'rewinding once is enough',
  );
});

test('coming back during the hold keeps the menu, and nothing to rewind closes it outright', () => {
  let now = 0;
  const overlay = new DialOverlay({ timeout: 8000, now: () => now });
  overlay.show();
  now = 8000;
  assert.equal(
    overlay.tick(false, () => true),
    false,
  );
  assert.equal(
    overlay.tick(true, () => true),
    false,
    'editing cancels the close mid-hold',
  );
  now += 8000;
  assert.equal(
    overlay.tick(false, () => true),
    false,
    'which starts the timeout over',
  );
  overlay.show();
  assert.equal(overlay.heldAt, null, 'reopening clears the hold');
  now += 8000;
  assert.equal(
    overlay.tick(false, () => false),
    true,
    'no rewind to show closes it at the timeout',
  );
});

test('fresh dial menu timeout is three seconds', () => {
  let now = 0;
  const overlay = new DialOverlay({ now: () => now });
  overlay.show();
  now = 2999;
  assert.equal(overlay.tick(), false);
  now = 3000;
  assert.equal(overlay.tick(), true);
});
