require('./harness-env');
// With the dial bridge's port already taken, the error is shown once and does
// not come back after it is dismissed.
const { app, BrowserWindow } = require('electron');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'turnbit-bridge-error-'));
app.setPath('userData', userData);
// Electron can still hold the profile open at exit on Windows; a leftover temp folder is not a failure.
process.on('exit', () => {
  try {
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 3 });
  } catch {}
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(condition, message) {
  const start = Date.now();
  while (Date.now() - start < 8000) {
    if (await condition()) return;
    await wait(50);
  }
  throw new Error(message);
}

async function main() {
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  process.env.TURNBIT_BRIDGE_PORT = String(blocker.address().port);
  require('../src/main');
  await app.whenReady();
  await until(
    () => BrowserWindow.getAllWindows().length > 0,
    'the window did not open',
  );
  const win = BrowserWindow.getAllWindows()[0];
  const run = (code) => win.webContents.executeJavaScript(code);
  const notice = () =>
    run(
      `(()=>{const n=document.querySelector('#actionNotice');return n&&!n.hidden?n.textContent:''})()`,
    );
  await until(
    async () => /bridge unavailable/i.test(await notice()),
    'the bridge error was not shown',
  );
  await run(`message()`);
  // Longer than the old 3-second status poll, which showed the error again each time.
  await wait(4000);
  assert.equal(
    await notice(),
    '',
    'the error does not come back after it is dismissed',
  );
  console.log('Bridge error: shown once, and not repeated.');
  blocker.close();
  app.quit();
}
main().catch((error) => {
  console.error(error);
  app.exit(1);
});
