const fs = require('node:fs');

// Encryption is supplied by the desktop host; this module does not load Electron.
function createSessionStorage(safeStorage) {
  function readSession(file) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        clientId: data.clientId,
        refreshToken:
          data.encryptedToken && safeStorage.isEncryptionAvailable()
            ? safeStorage.decryptString(
                Buffer.from(data.encryptedToken, 'base64'),
              )
            : null,
        lastDevice: data.lastDevice,
      };
    } catch {
      return {};
    }
  }
  function readCooldowns(file) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }
  function saveCooldowns(file, data) {
    try {
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
      fs.renameSync(`${file}.tmp`, file);
    } catch {
      /* Best effort: a lost file only costs one throttled request. */
    }
  }
  function saveSession(file, data) {
    // The device last used is not a secret, and remembering it is what lets Automatic pick one after a restart.
    const saved = {
      clientId: data.clientId,
      encryptedToken:
        data.refreshToken && safeStorage.isEncryptionAvailable()
          ? safeStorage.encryptString(data.refreshToken).toString('base64')
          : null,
      lastDevice: data.lastDevice || null,
    };
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(saved));
    fs.renameSync(`${file}.tmp`, file);
  }
  return { readSession, saveSession, readCooldowns, saveCooldowns };
}

module.exports = { createSessionStorage };
