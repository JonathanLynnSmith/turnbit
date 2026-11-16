const fs = require('node:fs');
const path = require('node:path');

// The app was first named desktop-ulanzi-ipod-poc, and Electron names the
// profile folder after the app. A machine that has that folder keeps using it,
// so the rename never looks like lost settings or a lost Spotify session.
// Electron creates the new folder before any app code runs, so whether the new
// folder exists says nothing; only the old folder's presence decides.
const LEGACY_PROFILE = 'desktop-ulanzi-ipod-poc';

// Returns the legacy folder to use, or null to leave the profile where it is.
// A profile path that someone set on purpose (a harness, a command-line flag)
// is not the default, so it is never replaced.
function legacyProfile({ current, appData, name, exists = fs.existsSync }) {
  if (path.resolve(current) !== path.resolve(appData, name)) return null;
  const legacy = path.join(appData, LEGACY_PROFILE);
  return exists(legacy) ? legacy : null;
}

function keepExistingProfile(app) {
  const legacy = legacyProfile({
    current: app.getPath('userData'),
    appData: app.getPath('appData'),
    name: app.getName(),
  });
  if (legacy) app.setPath('userData', legacy);
}

module.exports = { keepExistingProfile, legacyProfile, LEGACY_PROFILE };
