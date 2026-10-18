const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function defaultPluginsDirectory() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA, 'Ulanzi', 'UlanziDeck', 'Plugins');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Ulanzi', 'UlanziDeck', 'Plugins');
  throw new Error(`Unsupported platform: ${process.platform}. Pass the plugins directory explicitly: node scripts/install-plugin.js "<path>"`);
}

function installPlugin(pluginsDirectory, source = path.join(__dirname, '..', 'ulanzi-plugin', 'com.turnbit.spotify.ulanziPlugin')) {
  pluginsDirectory = path.resolve(pluginsDirectory);
  if (!fs.existsSync(pluginsDirectory) || !fs.statSync(pluginsDirectory).isDirectory()) {
    throw new Error(`Ulanzi Studio plugin folder not found: ${pluginsDirectory}. Install Studio or pass a directory: node scripts/install-plugin.js "<path>"`);
  }
  const name = 'com.turnbit.spotify.ulanziPlugin';
  const destination = path.join(pluginsDirectory, name);
  // Stage and back up outside Plugins so Studio cannot load a second copy of the same UUID.
  const staging = fs.mkdtempSync(path.join(path.dirname(pluginsDirectory), '.turnbit-install-'));
  let backup;
  try {
    const prepared = path.join(staging, name);
    fs.cpSync(source, prepared, { recursive: true });
    if (fs.existsSync(destination)) {
      const backups = path.join(path.dirname(pluginsDirectory), 'turnbit-plugin-backups');
      fs.mkdirSync(backups, { recursive: true });
      backup = path.join(fs.mkdtempSync(path.join(backups, 'install-')), name);
      fs.renameSync(destination, backup);
    }
    try { fs.renameSync(prepared, destination); }
    catch (error) { if (backup) fs.renameSync(backup, destination); throw error; }
    return { destination, backup };
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}

if (require.main === module) {
  try {
    const { destination, backup } = installPlugin(process.argv[2] || defaultPluginsDirectory());
    if (backup) console.log(`Previous plugin backed up to ${backup}`);
    console.log(`Installed turnbit plugin at ${destination}`);
    console.log('Restart Ulanzi Studio, then assign the turnbit actions to your D100H.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { installPlugin };
