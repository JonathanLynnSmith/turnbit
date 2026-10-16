// Running from the repo uses Electron's own electron.exe, which Task Manager lists as "Electron".
// Write turnbit's name and icon into it, the same way packaging brands turnbit.exe. Runs after npm install
// (reinstalling Electron restores the original) and never fails the install.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
if (process.platform !== 'win32') process.exit(0);
const root = path.join(__dirname, '..');
const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const rcedit = [
  path.join(root, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe'),
  path.join(root, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe')
].find(file => fs.existsSync(file));
if (!fs.existsSync(exe) || !rcedit) { console.log('turnbit: skipped branding electron.exe (Electron or rcedit not found)'); process.exit(0); }
try {
  execFileSync(rcedit, [exe, '--set-version-string', 'FileDescription', 'turnbit', '--set-version-string', 'ProductName', 'turnbit', '--set-icon', path.join(root, 'assets', 'branding', 'turnbit.ico')], { stdio: 'pipe' });
  console.log('turnbit: electron.exe now shows as turnbit in Task Manager');
} catch (error) {
  console.log(`turnbit: could not brand electron.exe; close turnbit and run "npm run brand:dev" (${String(error.stderr || error.message).trim()})`);
}
