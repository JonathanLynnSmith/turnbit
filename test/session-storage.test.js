const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSessionStorage } = require('../src/desktop/session-storage');

test('session storage preserves format, encrypts tokens, and handles unavailable encryption', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'turnbit-storage-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'session.json');
  let available = true;
  const store = createSessionStorage({
    isEncryptionAvailable: () => available,
    encryptString: value => Buffer.from(`encrypted:${value}`),
    decryptString: value => value.toString().slice('encrypted:'.length)
  });
  const session = { clientId: 'client', refreshToken: 'token', lastDevice: { id: 'desktop' } };
  store.saveSession(file, session);
  assert.deepEqual(store.readSession(file), session);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.refreshToken, undefined);
  assert.ok(saved.encryptedToken);
  available = false;
  assert.equal(store.readSession(file).refreshToken, null);
  store.saveSession(file, session);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).encryptedToken, null);
  assert.deepEqual(store.readSession(path.join(directory, 'missing')), {});
  store.saveCooldowns(file, { library: 100 });
  assert.deepEqual(store.readCooldowns(file), { library: 100 });
});
