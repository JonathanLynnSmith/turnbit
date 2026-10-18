const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function defaultPluginsDirectory() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA, 'Ulanzi', 'UlanziDeck', 'Plugins');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Ulanzi', 'UlanziDeck', 'Plugins');
  throw new Error(`Unsupported platform: ${process.platform}. Pass the plugins directory explicitly: node scripts/install-plugin.js "<path>"`);
}

const pluginsDirectory = process.argv[2] || defaultPluginsDirectory();
const source = path.join(__dirname, '..', 'ulanzi-plugin', 'com.turnbit.spotify.ulanziPlugin');

if (!fs.existsSync(pluginsDirectory) || !fs.statSync(pluginsDirectory).isDirectory()) {
  throw new Error(`Ulanzi Studio plugin folder not found: ${pluginsDirectory}. Install Studio or pass a directory: node scripts/install-plugin.js "<path>"`);
}

const destination = path.join(pluginsDirectory, 'com.turnbit.spotify.ulanziPlugin');
if (fs.existsSync(destination)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${destination}.backup-${stamp}`;
  fs.cpSync(destination, backup, { recursive: true });
  console.log(`Previous plugin backed up to ${backup}`);
}

fs.cpSync(source, destination, { recursive: true });
console.log(`Installed turnbit plugin at ${destination}`);
console.log('Restart Ulanzi Studio, then assign the turnbit actions to your D100H.');
