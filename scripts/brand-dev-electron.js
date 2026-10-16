// Running from the repo uses Electron's own electron.exe, which Task Manager lists as "Electron".
// 1. Write turnbit's name and icon into it (Processes tab), the same way packaging brands turnbit.exe.
// 2. Hard-link it as turnbit.exe in the same folder (Details tab shows the file name). A hard link is the same
//    file under a second name, so it takes no space and Electron finds its files. scripts/start-dev.js launches it.
// Runs after npm install (reinstalling Electron restores the original) and never fails the install.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
if (process.platform !== 'win32') process.exit(0);
const root = path.join(__dirname, '..');
const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const link = path.join(path.dirname(exe), 'turnbit.exe');
const rcedit = [
  path.join(root, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe'),
  path.join(root, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe')
].find(file => fs.existsSync(file));
if (!fs.existsSync(exe)) { console.log('turnbit: skipped branding (Electron not found)'); process.exit(0); }
const sameFile = (a, b) => { try { return fs.statSync(a, { bigint: true }).ino === fs.statSync(b, { bigint: true }).ino; } catch { return false; } };
if (!rcedit) console.log('turnbit: skipped branding electron.exe (rcedit not found)');
else try {
  execFileSync(rcedit, [exe, '--set-version-string', 'FileDescription', 'turnbit', '--set-version-string', 'ProductName', 'turnbit', '--set-icon', path.join(root, 'assets', 'branding', 'turnbit.ico')], { stdio: 'pipe' });
  console.log('turnbit: electron.exe is branded as turnbit');
} catch (error) {
  console.log(`turnbit: could not brand electron.exe; close turnbit and run "npm run brand:dev" (${String(error.stderr || error.message).trim()})`);
}
// Link after branding: rcedit may rewrite the file, which would leave an older link pointing at the old copy.
try {
  if (!sameFile(link, exe)) { fs.rmSync(link, { force: true }); fs.linkSync(exe, link); }
  console.log('turnbit: npm start runs as turnbit.exe');
} catch (error) {
  console.log(`turnbit: could not create turnbit.exe; close turnbit and run "npm run brand:dev" (${error.message})`);
}
