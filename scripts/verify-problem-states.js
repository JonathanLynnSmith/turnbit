require('./harness-env');
// Lasting problems stay on screen with their next step until they are resolved
// or dismissed; ordinary notices still time out. Runs offline, in Window Mode.
const { app, BrowserWindow } = require('electron');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'turnbit-problems-'));
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
const NO_DEVICE =
  'No Spotify device is available. Open Spotify or select a preferred device in Settings.';
const SONG = `{track:{id:'spotify:track:AAAAAAAAAAAAAAAAAAAAAA',title:'Night Drive',artists:['turnbit sessions'],album:{title:'After Hours',artwork:[]},durationMs:214000},playing:true,positionMs:1000,device:{id:'test',name:'Living Room',volume:50}}`;

async function main() {
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  process.env.TURNBIT_BRIDGE_PORT = String(reservation.address().port);
  await new Promise((resolve) => reservation.close(resolve));
  require('../src/main');
  await app.whenReady();
  await until(
    () => BrowserWindow.getAllWindows().length > 0,
    'the window did not open',
  );
  const win = BrowserWindow.getAllWindows()[0];
  const run = (code) => win.webContents.executeJavaScript(code);
  await until(
    () => run(`typeof playbackEvent==='function'`),
    'the interface did not load',
  );
  const problem = () =>
    run(
      `(()=>{const n=document.querySelector('#problemNotice');if(!n||n.hidden)return null;const a=n.querySelector('.problem-action');return {text:n.querySelector('.problem-text').textContent,action:a.hidden?null:a.textContent};})()`,
    );
  const notice = () =>
    run(
      `(()=>{const n=document.querySelector('#actionNotice');return n&&!n.hidden?n.textContent:''})()`,
    );
  const fail = (code, message, extra = '') =>
    run(
      `playbackEvent({type:'error',code:${JSON.stringify(code)},message:${JSON.stringify(message)}${extra}})`,
    );

  await run(
    `savePreferences({mouseModeKey:'off'});demo=false;acceptPlayback(null);`,
  );
  // The request's channel prefix is Electron's, not something to show people.
  await fail(
    'no-device',
    `Error invoking remote method 'playback:command': Error: ${NO_DEVICE}`,
  );
  assert.deepEqual(
    await problem(),
    { text: NO_DEVICE, action: 'Choose a device' },
    'a missing device is shown with its next step',
  );
  await wait(5600);
  assert.equal(
    (await problem())?.text,
    NO_DEVICE,
    'it is still there after a timed notice would have gone',
  );

  await run(`message('Shuffle on')`);
  // Let the notice finish sliding in before measuring it.
  await wait(450);
  assert.equal(await notice(), 'Shuffle on', 'ordinary notices still show');
  assert.equal(
    await run(
      `(()=>{const a=document.querySelector('#problemNotice').getBoundingClientRect(),b=document.querySelector('#actionNotice').getBoundingClientRect();return a.bottom<=b.top||b.bottom<=a.top;})()`,
    ),
    true,
    'and sit clear of the problem',
  );
  try {
    fs.writeFileSync(
      path.join(__dirname, '../artifacts/problem-state.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
  } catch {}
  await run(`message(${JSON.stringify(NO_DEVICE)})`);
  assert.equal(
    await notice(),
    'Shuffle on',
    'the same words are not repeated as a notice',
  );

  await run(`document.querySelector('#problemNotice .problem-dismiss').click()`);
  assert.equal(await problem(), null, 'Dismiss puts it away');
  await fail('no-device', NO_DEVICE);
  assert.equal(
    await problem(),
    null,
    'and it stays away while the same failure repeats',
  );
  await run(`acceptPlayback(${SONG})`);
  await fail('no-device', NO_DEVICE);
  assert.equal(
    (await problem())?.text,
    NO_DEVICE,
    'a new occurrence after things worked is shown again',
  );
  await run(`acceptPlayback(${SONG})`);
  assert.equal(await problem(), null, 'playback on a device resolves it');

  await fail('no-device', NO_DEVICE);
  await run(`document.querySelector('#problemNotice .problem-action').click()`);
  assert.equal(await problem(), null, 'the next step answers the problem');
  assert.equal(
    await run(`nav.current.title`),
    'Playback Device',
    'and opens the device list',
  );

  await fail(
    'rate-limited',
    'Spotify rate limit: playback control paused until 3:40 PM.',
    `,until:Date.now()+700`,
  );
  assert.deepEqual(
    await problem(),
    {
      text: 'Spotify rate limit: playback control paused until 3:40 PM.',
      action: null,
    },
    'a rate limit has nothing to press',
  );
  await until(
    async () => (await problem()) === null,
    'the rate limit notice did not clear when the limit ended',
  );

  await fail('offline', "Can't reach Spotify. Check your internet connection.");
  assert.equal((await problem())?.action, 'Try again');
  await run(`acceptPlayback(null)`);
  assert.equal(await problem(), null, 'any answer from Spotify ends offline');

  await run(
    `playbackEvent({type:'error',message:'Spotify is still starting. Try Play again in a moment.'})`,
  );
  assert.equal(await problem(), null, 'a momentary error is not a problem');
  assert.equal(
    await notice(),
    'Spotify is still starting. Try Play again in a moment.',
    'it is a timed notice',
  );
  await run(
    `message("Error invoking remote method 'library:page': Error: Boom")`,
  );
  assert.equal(await notice(), 'Boom', 'notices lose the channel prefix too');

  console.log(
    'Problem states: lasting problems persist with a next step, resolve, dismiss and expire; notices still time out.',
  );
  app.quit();
}
main().catch((error) => {
  console.error(error);
  // app.quit, not app.exit: exit skips the app's own shutdown and leaves the process running.
  app.once('quit', () => app.exit(1));
  app.quit();
});
