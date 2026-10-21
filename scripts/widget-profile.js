// Window Mode is the default. Harnesses that exercise the floating widget save
// the widget choice first, as a user who switched to it would have it saved.
const fs = require('node:fs');
const path = require('node:path');

module.exports = function startAsWidget(app) {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    path.join(userData, 'window-mode.json'),
    JSON.stringify({ enabled: false, bounds: {} }),
  );
};
