// Isolated profile; real Windows loopback and quiet, temporary test tones.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
app.disableHardwareAcceleration();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'turnbit-party-live-'));
app.setPath('userData', profile);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const watchdog = setTimeout(() => app.exit(1), 90000);
watchdog.unref();

async function main() {
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  process.env.TURNBIT_BRIDGE_PORT = String(reservation.address().port);
  await new Promise((resolve) => reservation.close(resolve));
  require('../src/main');
  await app.whenReady();
  let win = BrowserWindow.getAllWindows()[0];
  const run = (code) => win.webContents.executeJavaScript(code);
  const until = async (condition) => {
    for (let i = 0; i < 100; i++) {
      if (await condition()) return;
      await wait(50);
    }
    throw new Error(
      'View did not settle: ' +
        JSON.stringify(
          await run(
            `({status:partyAudio.status,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,hidden:document.hidden,visibility:visibilityState,overlay:dialOverlay.visible,playing,page:nav.current.title,enabled:preferences.partyMode&&preferences.partyAudio})`,
          ),
        ),
    );
  };
  await until(() => run(`typeof preferences !== 'undefined'`));
  const errors = [];
  const listen = () =>
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message);
    });
  listen();
  const out = path.join(__dirname, '../artifacts');
  fs.mkdirSync(out, { recursive: true });
  const shot = async (name) => {
    await run(`message();`);
    await wait(300);
    fs.writeFileSync(
      path.join(out, name + '.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
  };

  const choose = async (predicate) =>
    run(
      `nav.current.selected=nav.current.rows.findIndex(${predicate});selectItem();`,
    );
  const pidList = () => {
    const { execFileSync } = require('node:child_process');
    const query = `Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${process.pid}' | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*party-audio-helper.ps1*' } | Select-Object -ExpandProperty ProcessId`;
    return execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', query],
      { windowsHide: true, encoding: 'utf8' },
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
  };
  const startFromSettings = async () => {
    await run(
      `nav.reset(root());browseFromPlayer();showSetting(r=>r.action==='party-audio-capture');selectItem();`,
    );
    await run(
      `if(!preferences.windowMode||!preferences.nowPlayingBackdrop)showNow();else dismissDialOverlay();drawNavigation();`,
    );
    await until(() => run(`partyAudio.status.state==='listening'`));
  };
  await run(
    `savePreferences({partyMode:false,partyAudio:false,hoverBack:false,mouseModeKey:'off',idleNowPlaying:false,idlePinned:false,menuTimeout:600,partyIntensity:50,partySource:${JSON.stringify(process.env.TURNBIT_PARTY_NO_TONES === '1' ? 'spotify' : 'default')}});demo=true;playing=true;nav.reset(root());drawNavigation();message();`,
  );
  assert.equal(
    await run(`partyAudio.status.active`),
    false,
    'fresh opt-ins do not auto-start capture',
  );
  await run(`showSetting(r=>r.action==='party-audio');selectItem();`);
  await run(`dismissDialOverlay();drawNavigation();`);
  await until(() => run(`partyAudio.status.state==='listening'`));
  assert.equal(pidList().length, 1, 'exactly one helper for the current view');
  console.log('Capture source', await run(`partyAudio.status.source`));
  const playTone = async (hz) => {
    const { execFile } = require('node:child_process');
    const rate = 48000,
      count = rate * 2,
      bytes = Buffer.alloc(44 + count * 2);
    bytes.write('RIFF', 0);
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(rate, 24);
    bytes.writeUInt32LE(rate * 2, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(count * 2, 40);
    for (let i = 0; i < count; i++) {
      const fade = Math.min(1, i / 960, (count - i) / 960);
      bytes.writeInt16LE(
        Math.round(
          32767 * 0.025 * fade * Math.sin((2 * Math.PI * hz * i) / rate),
        ),
        44 + i * 2,
      );
    }
    const file = path.join(profile, 'tone-' + hz + '.wav');
    fs.writeFileSync(file, bytes);
    const done = new Promise((resolve, reject) =>
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(New-Object System.Media.SoundPlayer '${file.replaceAll("'", "''")}').PlaySync()`,
        ],
        { windowsHide: true },
        (error) => (error ? reject(error) : resolve()),
      ),
    );
    // Track unwrapped hue travel: the effect now crosses the entire color wheel.
    let previousHue,
      hueTravel = 0;
    for (let i = 0; i < 13; i++) {
      await wait(100);
      const color = await run(
        `document.querySelector(preferences.windowMode&&preferences.nowPlayingBackdrop?'#radialBackdrop':'#radialNow').style.getPropertyValue('--party-audio-bass')`,
      );
      const hue = Number(color.match(/hsl\(([\d.]+)/)?.[1]);
      if (Number.isFinite(hue)) {
        if (previousHue !== undefined)
          hueTravel += (hue - previousHue + 360) % 360;
        previousHue = hue;
      }
    }
    const measured = await run(
      `({status:partyAudio.status,colors:['bass','mid','treble','mix'].map(key=>document.querySelector(preferences.windowMode&&preferences.nowPlayingBackdrop?'#radialBackdrop':'#radialNow').style.getPropertyValue('--party-audio-'+key))})`,
    );
    console.log('Tone ' + hz, measured);
    await done;
    return { ...measured, hueTravel };
  };

  if (process.env.TURNBIT_PARTY_NO_TONES !== '1') {
    for (const [i, hz] of [100, 1000, 6000].entries()) {
      const measured = await playTone(hz);
      assert.ok(measured.status.rms > 0.001, 'real loopback samples arrive');
      assert.ok(
        measured.status.levels[i] > 0.35 &&
          measured.status.levels.every(
            (v, j) => j === i || v < measured.status.levels[i] - 0.1,
          ),
        'tone is in the expected band',
      );
    }
    await run(`savePreferences({partyIntensity:10});`);
    const low = await playTone(100);
    await run(`savePreferences({partyIntensity:90});`);
    const high = await playTone(100);
    assert.ok(
      high.hueTravel > low.hueTravel + 50,
      'Intensity increases travel through the full color wheel',
    );
  }
  await run(`savePreferences({partyIntensity:50});playing=false;render();`);
  await until(() => run(`partyAudio.status.state==='paused'`));
  const held = await run(
    `document.querySelector(preferences.windowMode&&preferences.nowPlayingBackdrop?'#radialBackdrop':'#radialNow').style.getPropertyValue('--party-audio-bass')`,
  );
  await wait(250);
  assert.equal(
    await run(
      `document.querySelector(preferences.windowMode&&preferences.nowPlayingBackdrop?'#radialBackdrop':'#radialNow').style.getPropertyValue('--party-audio-bass')`,
    ),
    held,
    'paused text holds its color',
  );
  await run(`playing=true;render();`);
  await until(() => run(`partyAudio.status.state==='listening'`));
  win.minimize();
  await until(() => run(`partyAudio.status.state==='paused'`));
  win.restore();
  await until(() => run(`partyAudio.status.state==='listening'`));
  await run(`browseFromPlayer();drawNavigation();`);
  await until(() => run(`partyAudio.status.state==='paused'`));
  await run(`dismissDialOverlay();drawNavigation();`);
  await until(() => run(`partyAudio.status.state==='listening'`));
  await shot('party-audio-live');
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await until(() => run(`partyAudio.status.state==='paused'`));
  // A delayed offline-auth event may reset the demo's simulated playback.
  await run(`demo=true;playing=true;render();`);
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [],
  });
  win.webContents.debugger.detach();
  await until(() => run(`partyAudio.status.state==='listening'`));
  await run(
    `savePreferences({gamingMode:true});lastVisualActivity=Date.now()-3000;partyAudio.sync();`,
  );
  assert.equal(await run(`partyAudio.status.state`), 'paused');
  await run(`savePreferences({gamingMode:false});`);
  await until(() => run(`partyAudio.status.state==='listening'`));
  // Force only this harness's verified child to exit, then retry through the real settings row.
  const oldPid = pidList()[0];
  process.kill(oldPid);
  await until(() =>
    run(`partyAudio.status.state==='error'&&!partyAudio.status.active`),
  );
  await startFromSettings();
  assert.notEqual(pidList()[0], oldPid, 'device/helper loss can be retried');
  // Switch real endpoints without changing Windows' default or Spotify's routing.
  const other = await run(
    `preferences.partySource==='default'?'spotify':'default'`,
  );
  await run(`savePreferences({partySource:${JSON.stringify(other)}});`);
  assert.equal(
    await run(`partyAudio.status.active`),
    false,
    'source changes stop the previous capture',
  );
  await until(() => pidList().length === 0);
  await startFromSettings();
  console.log('Alternate output', await run(`partyAudio.status.source`));
  await run(
    `nav.reset(root());browseFromPlayer();showSetting(r=>r.key==='partyIntensity');selectItem();nav.current.value=75;selectItem();`,
  );
  assert.equal(
    await run(
      `JSON.parse(localStorage.getItem('turnbit-preferences')).partyIntensity`,
    ),
    75,
    'intensity saves',
  );
  win.webContents.reload();
  await until(() =>
    run(`typeof preferences!=='undefined'&&preferences.partyIntensity===75`),
  );
  assert.equal(
    await run(`partyAudio.status.active`),
    false,
    'reload requires a new explicit start',
  );
  await until(() => pidList().length === 0);
  await run(
    `demo=true;playing=true;savePreferences({idleNowPlaying:false,hoverBack:false,mouseModeKey:'off'});`,
  );
  await startFromSettings();
  const old = win;
  void run(`window.turnbit.windowMode(false)`).catch(() => {});
  await until(() => {
    const next = BrowserWindow.getAllWindows()[0];
    if (next && next !== old) {
      win = next;
      return true;
    }
    return false;
  });
  await until(() =>
    run(`typeof preferences!=='undefined'&&!preferences.windowMode`),
  );
  listen();
  assert.equal(
    await run(`partyAudio.status.active`),
    false,
    'native window recreation closes capture',
  );
  await until(() => pidList().length === 0);
  await run(
    `demo=true;playing=true;savePreferences({idleNowPlaying:false,hoverBack:false,mouseModeKey:'off'});`,
  );
  await startFromSettings();
  await run(`showNow();drawNavigation();`);
  await until(() => run(`partyAudio.status.state==='listening'`));
  await shot('party-audio-widget');
  await run(`savePreferences({partyMode:false});drawNavigation();`);
  assert.equal(await run(`partyAudio.status.active`), false);
  assert.equal(
    await run(
      `document.querySelector(preferences.windowMode&&preferences.nowPlayingBackdrop?'#radialBackdrop':'#radialNow').style.getPropertyValue('--party-audio-bass')`,
    ),
    '',
  );
  await until(() => pidList().length === 0);
  assert.deepEqual(errors, []);
  console.log(
    'Party Audio passed: ' +
      (process.env.TURNBIT_PARTY_NO_TONES === '1'
        ? 'tone/band checks skipped; '
        : 'real Windows bands and intensity; ') +
      'pause/resume, hidden/reduced/gaming states, capture loss/retry, endpoint handover, reload, window/widget, persistence, and zero leaked helpers.',
  );
  app.quit();
}
main().catch((error) => {
  console.error(error);
  app.exit(1);
});
