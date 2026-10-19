const fs = require('node:fs');
function createSettingsStorage(file) {
  return {
    read() {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        return null;
      }
    },
    write(value) {
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(value));
      fs.renameSync(`${file}.tmp`, file);
    },
  };
}
module.exports = { createSettingsStorage };
