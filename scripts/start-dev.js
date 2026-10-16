// npm start: on Windows, launch the turnbit.exe hard link (made by brand-dev-electron.js) so Task Manager shows
// turnbit instead of electron.exe. Falls back to plain Electron if the link is missing or out of date.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const electron = require('electron');
const link = path.join(path.dirname(electron), 'turnbit.exe');
const sameFile = (a, b) => { try { return fs.statSync(a, { bigint: true }).ino === fs.statSync(b, { bigint: true }).ino; } catch { return false; } };
let exe = electron;
if (process.platform === 'win32') {
  if (sameFile(link, electron)) exe = link;
  else console.log('turnbit: starting as electron.exe; run "npm run brand:dev" to start as turnbit.exe');
}
const child = spawn(exe, [path.join(__dirname, '..'), ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: false });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
