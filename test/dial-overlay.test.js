const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DialOverlay } = require('../renderer/dial-overlay');

test('dial browsing starts hidden, extends on navigation, and dismisses after inactivity', () => {
  let now = 0;
  const overlay = new DialOverlay({now:()=>now});
  assert.equal(overlay.visible,false);
  assert.equal(overlay.show(),true);
  now = 7000;assert.equal(overlay.tick(),false);
  assert.equal(overlay.show(),false);
  now = 14999;assert.equal(overlay.tick(),false);
  now = 15000;assert.equal(overlay.tick(),true);
  assert.equal(overlay.visible,false);
  assert.equal(overlay.tick(),false);
});

test('editing and pinning keep the menu open until interaction is finished', () => {
  let now = 0;
  const overlay = new DialOverlay({now:()=>now});
  overlay.show();now = 20000;
  assert.equal(overlay.tick(true),false);
  now += 7999;assert.equal(overlay.tick(),false);
  now++;assert.equal(overlay.tick(),true);
  overlay.show();assert.equal(overlay.hide(),true);
  assert.equal(overlay.hide(),false);
});
