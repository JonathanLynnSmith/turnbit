const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const debug = process.argv.includes('--debug');

function studioExePath() {
  if (process.platform === 'win32') return 'C:\\Program Files (x86)\\Ulanzi Studio\\UlanziDeck.exe';
  if (process.platform === 'darwin') return '/Applications/Ulanzi Studio.app/Contents/MacOS/UlanziDeck';
  throw new Error(`Unsupported platform: ${process.platform}`);
}

const studioExe = studioExePath();
if (!fs.existsSync(studioExe)) throw new Error(`Ulanzi Studio not found at ${studioExe}`);

// Closing the UI can leave this background process running. Restart only Studio.
if (process.platform === 'win32') {
  try { execFileSync('taskkill', ['/F', '/IM', path.basename(studioExe)], { stdio: 'ignore' }); } catch { /* not running */ }
} else {
  try {
    const pids = execFileSync('pgrep', ['-f', studioExe], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const pid of pids) process.kill(Number(pid), 'SIGTERM');
  } catch { /* not running */ }
}

const args = debug ? ['--webRemoteDebug', '--log'] : [];
spawn(studioExe, args, { detached: true, stdio: 'ignore' }).unref();
console.log('Restarted Ulanzi Studio background process.');
