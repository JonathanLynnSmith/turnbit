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

async function restart() {
  // Closing the UI can leave the background process running. Wait for it to
  // release its single-instance lock before launching the replacement.
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/F', '/IM', path.basename(studioExe)], { stdio: 'ignore' }); }
    catch (error) { if (error.status !== 128) throw error; }
  } else {
    const pattern = '^' + studioExe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)';
    const running = () => {
      try { return execFileSync('pgrep', ['-f', pattern], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number); }
      catch (error) { if (error.status === 1) return []; throw error; }
    };
    for (const pid of running()) {
      try { process.kill(pid, 'SIGTERM'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    const deadline = Date.now() + 5000;
    while (running().length) {
      if (Date.now() >= deadline) throw new Error('Ulanzi Studio did not close. Quit it and try again.');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  const args = debug ? ['--webRemoteDebug', '--log'] : [];
  const child = spawn(studioExe, args, { detached: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  console.log('Restarted Ulanzi Studio background process.');
}

restart().catch(error => { console.error(error.message); process.exitCode = 1; });
