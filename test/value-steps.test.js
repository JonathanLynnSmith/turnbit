const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TIMEOUT_STOPS,
  COLOR_STOPS,
  stepThrough,
  stepEvenly,
} = require('../renderer/settings/value-steps');

test('timeouts move between predefined stops and stop at the ends', () => {
  assert.equal(stepThrough(TIMEOUT_STOPS, 8, 1), 10);
  assert.equal(stepThrough(TIMEOUT_STOPS, 8, -1), 5);
  assert.equal(stepThrough(TIMEOUT_STOPS, 10, 3), 30);
  assert.equal(stepThrough(TIMEOUT_STOPS, 600, 1), 600);
  assert.equal(stepThrough(TIMEOUT_STOPS, 3, -2), 3);
  // A value saved before the stops existed moves to the nearest stop in that direction.
  assert.equal(stepThrough(TIMEOUT_STOPS, 7, 1), 8);
  assert.equal(stepThrough(TIMEOUT_STOPS, 7, -1), 5);
});

test('colours step through the twelve named hues and White, wrapping around', () => {
  assert.equal(COLOR_STOPS.length, 13);
  assert.equal(stepThrough(COLOR_STOPS, 150, 1, true), 180);
  assert.equal(
    stepThrough(COLOR_STOPS, 330, 1, true),
    360,
    'White follows Rose',
  );
  assert.equal(stepThrough(COLOR_STOPS, 360, 1, true), 0, 'then back to Red');
  assert.equal(stepThrough(COLOR_STOPS, 0, -1, true), 360);
  assert.equal(
    stepThrough(COLOR_STOPS, 145, 1, true),
    150,
    'an old custom hue snaps on',
  );
  assert.equal(stepThrough(COLOR_STOPS, 145, -1, true), 120);
});

test('percentages move in fives and keep an off-grid minimum reachable', () => {
  assert.equal(stepEvenly({ min: 0, max: 100, step: 5 }, 70, 1), 75);
  assert.equal(stepEvenly({ min: 0, max: 100, step: 5 }, 24, -1), 20);
  assert.equal(stepEvenly({ min: 0, max: 100, step: 5 }, 24, 1), 25);
  assert.equal(stepEvenly({ min: 0, max: 100, step: 5 }, 100, 1), 100);
  assert.equal(stepEvenly({ min: 20, max: 100, step: 5 }, 25, -3), 20);
  assert.equal(stepEvenly({ min: 15, max: 70, step: 5 }, 35, 2), 45);
});
