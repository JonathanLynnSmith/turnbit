// Fresh-profile checks for defaults, resets, per-mode smoke, and browsing context.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
app.disableHardwareAcceleration();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'turnbit-defaults-'));
app.setPath('userData', profile);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const watchdog = setTimeout(() => app.exit(1), 60000);
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
    throw new Error('View did not settle');
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
  const setting = async (predicate) =>
    run(
      `nav.reset(root());browseFromPlayer();showSetting(${predicate});selectItem();drawNavigation();`,
    );
  assert.deepEqual(
    await run(
      `[preferences.windowMode,preferences.menuTimeout,preferences.primaryHue,preferences.accentHue,preferences.splitDivider]`,
    ),
    [true, 3, 360, 141, false],
  );
  assert.equal(await run(`radialColor(preferences.accentHue,true)`), '#1db954');
  assert.equal(
    await run(`$('#windowViewLabel').hidden&&$('.brand-divider').hidden`),
    true,
    'Now Playing has no browsing label',
  );
  await run(
    `savePreferences({hoverBack:false,mouseModeKey:'off',idleNowPlaying:false});nav.reset(root());browseFromPlayer();showSettings();`,
  );
  assert.equal(
    await run(`$('#windowViewLabel').hidden`),
    false,
    'browsing identifies the current page',
  );
  assert.equal(await run(`$('#windowViewLabel').textContent`), 'SETTINGS');
  await shot('settings-defaults-categories');
  await run(`showSettingsGroup('widget');`);
  assert.equal(
    await run(`nav.current.rows.find(r=>r.action==='window-mode').label`),
    'Widget Mode',
  );
  assert.equal(
    await run(`nav.current.rows.find(r=>r.action==='window-mode').detail`),
    'Off',
  );
  assert.equal(
    await run(`nav.current.rows.some(r=>r.key==='radialBackground')`),
    true,
  );
  await shot('settings-widget-section');
  // Confirmed section resets leave unrelated values and navigation history alone.
  await run(
    `savePreferences({menuTimeout:25,accentHue:330,windowBackground:65,radialBackground:15,lastSongList:{kind:'songs',name:'Liked Songs'}});nav.reset(root());browseFromPlayer();showSettings();showSettingsGroup('window');`,
  );
  await choose(`r=>r.action==='reset-settings'`);
  assert.equal(
    await run(`nav.current.rows[nav.current.selected].action`),
    'reset-cancel',
  );
  await choose(`r=>r.action==='reset-cancel'`);
  assert.equal(
    await run(`preferences.menuTimeout`),
    25,
    'cancel changes nothing',
  );
  await choose(`r=>r.action==='reset-settings'`);
  await shot('settings-reset-confirmation');
  await choose(`r=>r.action==='confirm-reset'`);
  await until(() =>
    run(`preferences.menuTimeout===3&&nav.current.settingsGroup==='window'`),
  );
  assert.deepEqual(
    await run(
      `[preferences.windowBackground,preferences.radialBackground,preferences.accentHue,preferences.lastSongList.kind]`,
    ),
    [24, 15, 330, 'songs'],
  );
  // Smoke previews alter pixels but not persisted preferences; Cancel restores the active mode.
  await run(
    `savePreferences({windowBackground:70,radialBackground:15,windowSmokeHue:-1,widgetSmokeHue:30,menuBackground:'glass'});`,
  );
  await setting(`r=>r.key==='windowSmokeHue'`);
  await run(`$('#radialColorPalette button[data-hue="240"]').click();`);
  const pixel = () =>
    run(
      `Array.from($('#radialHaze').getContext('2d').getImageData(5,Math.floor($('#radialHaze').height/2),1,1).data)`,
    );
  let color = await pixel();
  assert.ok(color[2] > color[0] && color[3] > 100, JSON.stringify(color));
  assert.equal(await run(`preferences.windowSmokeHue`), -1);
  assert.equal(
    await run(`document.body.dataset.menuBackground`),
    'match',
    'smoke previews even over a panel background',
  );
  await shot('settings-window-blue-smoke');
  await run(`$('#radialColorCancel').click();`);
  assert.equal(
    await run(`document.body.dataset.menuBackground`),
    'glass',
    'cancel restores the panel background',
  );
  await setting(`r=>r.key==='windowSmokeHue'`);
  await run(
    `$('#radialColorPalette button[data-hue="240"]').click();$('#radialColorSave').click();`,
  );
  assert.equal(await run(`preferences.menuBackground`), 'match');
  assert.deepEqual(
    await run(`[preferences.windowSmokeHue,preferences.widgetSmokeHue]`),
    [240, 30],
  );
  await setting(`r=>r.key==='windowBackground'`);
  await run(`nav.current.value=0;drawNavigation();`);
  assert.equal((await pixel())[3], 0, 'zero removes smoke');
  await run(`menuBack();`);
  assert.ok((await pixel())[3] > 100, 'cancel restores opacity');
  // Switching modes uses the actual native window, and Widget reset returns to the default window.
  let old = win;
  void run(
    `nav.reset(root());showSetting(r=>r.action==='window-mode');selectItem();`,
  ).catch(() => {});
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
  await run(
    `savePreferences({hoverBack:false,mouseModeKey:'off',idleNowPlaying:false});nav.reset(root());drawNavigation();`,
  );
  color = await pixel();
  assert.ok(
    color[0] > color[2] && color[3] > 0 && color[3] < 100,
    'widget has its own orange smoke and opacity',
  );
  await setting(`r=>r.key==='widgetSmokeHue'`);
  assert.equal(await run(`nav.current.value`), 30);
  await run(
    `$('#radialColorPalette button[data-hue="-1"]').click();$('#radialColorSave').click();`,
  );
  assert.equal((await pixel())[0], 0, 'black background is supported');
  await run(`nav.reset(root());showSettings();showSettingsGroup('widget');`);
  assert.equal(
    await run(`nav.current.rows.find(r=>r.action==='window-mode').detail`),
    'On',
  );
  await choose(`r=>r.action==='reset-settings'`);
  old = win;
  void choose(`r=>r.action==='confirm-reset'`).catch(() => {});
  await until(() => {
    const next = BrowserWindow.getAllWindows()[0];
    if (next && next !== old) {
      win = next;
      return true;
    }
    return false;
  });
  await until(() =>
    run(`typeof preferences!=='undefined'&&preferences.windowMode`),
  );
  listen();
  assert.deepEqual(
    await run(
      `[preferences.radialBackground,preferences.widgetSmokeHue,preferences.windowBackground,preferences.windowSmokeHue]`,
    ),
    [24, -1, 70, 240],
    'widget reset preserves window smoke',
  );
  // All reset also updates persisted backend recovery settings, without deleting history.
  await run(
    `savePreferences({menuTimeout:45,accentHue:330,hoverBack:false,mouseModeKey:'off',coldStart:'off',autoLaunchSpotify:false});nav.reset(root());browseFromPlayer();showSettings();`,
  );
  await choose(`r=>r.action==='reset-settings'&&r.group==='all'`);
  await choose(`r=>r.action==='confirm-reset'`);
  await until(() =>
    run(
      `preferences.menuTimeout===3&&preferences.accentHue===141&&nav.current.title==='Settings'`,
    ),
  );
  assert.deepEqual(
    await run(
      `[preferences.primaryHue,preferences.splitDivider,preferences.windowSmokeHue,preferences.windowBackground,preferences.lastSongList.kind]`,
    ),
    [360, false, -1, 24, 'songs'],
  );
  const backend = await run(`window.turnbit.settings.get()`);
  assert.equal(backend.coldStart.mode, 'last');
  assert.equal(backend.autoLaunchSpotify, true);
  win.webContents.reload();
  await until(() =>
    run(`typeof preferences!=='undefined'&&preferences.windowMode`),
  );
  assert.deepEqual(
    await run(
      `[preferences.menuTimeout,preferences.accentHue,preferences.coldStart,preferences.lastSongList.kind]`,
    ),
    [3, 141, 'last', 'songs'],
  );
  assert.equal(await run(`$('#windowViewLabel').hidden`), true);
  await shot('now-playing-clean-header');
  assert.deepEqual(errors, []);
  console.log(
    'Defaults, per-mode smoke previews/cancel/persistence, scoped/all resets, native Widget toggle, durable recovery defaults, and browsing-only context passed.',
  );
  app.quit();
}
main().catch((error) => {
  console.error(error);
  app.exit(1);
});
