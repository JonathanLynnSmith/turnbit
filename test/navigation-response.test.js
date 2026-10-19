const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function carousel() {
  const context = {
    window: {},
    cancelAnimationFrame() {},
    requestAnimationFrame: () => 1,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../renderer/radial.js'), 'utf8'),
    context,
  );
  const view = new context.window.RadialCarousel(
    {},
    { activate() {}, reducedMotion: () => false },
  );
  view.paint = () => {};
  view.last = 0;
  return view;
}
test('direct dial turns catch up within 100ms rather than trailing several rows', () => {
  const view = carousel();
  view.target = 10;
  for (let time = 16; time <= 96; time += 16) view.tick(time);
  assert.ok(view.position >= 9, `carousel reached ${view.position} of 10 rows`);
  assert.ok(view.position <= view.target, 'scrolling never overshoots');
});
test('explicit song-follow animations retain their duration', () => {
  const view = carousel();
  view.animateTo(10);
  for (let time = 16; time <= 96; time += 16) view.tick(time);
  assert.ok(view.motion, 'programmatic transition is still active');
  assert.ok(
    view.position < 9,
    'automatic navigation is not snapped to the target',
  );
  for (let time = 112; time <= 272; time += 16) view.tick(time);
  assert.equal(view.position, 10);
  assert.equal(view.motion, null);
});
