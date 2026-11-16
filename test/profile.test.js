const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { legacyProfile, LEGACY_PROFILE } = require('../src/desktop/profile');

const appData = path.join('C:', 'Users', 'someone', 'AppData', 'Roaming');
const current = path.join(appData, 'turnbit');
const legacy = path.join(appData, LEGACY_PROFILE);
const existing = (...paths) => (candidate) => paths.includes(candidate);

test('an existing profile under the old app name stays in use after the rename', () => {
  assert.equal(
    legacyProfile({ current, appData, name: 'turnbit', exists: existing(legacy) }),
    legacy,
  );
});

test('the old folder wins even though Electron has already created the new one', () => {
  assert.equal(
    legacyProfile({
      current,
      appData,
      name: 'turnbit',
      exists: existing(current, legacy),
    }),
    legacy,
  );
});

test('a machine that never had the old folder uses the new one', () => {
  assert.equal(
    legacyProfile({ current, appData, name: 'turnbit', exists: existing(current) }),
    null,
  );
});

test('a profile path set on purpose is never replaced', () => {
  assert.equal(
    legacyProfile({
      current: path.join('C:', 'Temp', 'turnbit-smoke-1'),
      appData,
      name: 'turnbit',
      exists: existing(legacy),
    }),
    null,
  );
});
