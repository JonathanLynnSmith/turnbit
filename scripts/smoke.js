// Offline end-to-end check of the interface shipped on main.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.disableHardwareAcceleration();
// Windows keeps the profile locked until Electron exits, so earlier runs can
// leave theirs behind. Sweep any that are old enough not to be in use.
for (const entry of fs.readdirSync(os.tmpdir())) {
  if (!entry.startsWith('turnbit-smoke-')) continue;
  const stale = path.join(os.tmpdir(), entry);
  try {
    if (Date.now() - fs.statSync(stale).mtimeMs < 10 * 60000) continue;
    fs.rmSync(stale, { recursive: true, force: true });
  } catch {
    // Still in use or already gone.
  }
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'turnbit-smoke-'));
app.setPath('userData', profile);
process.env.TURNBIT_BRIDGE_PORT = '4826';
const errors = [];
app.on('web-contents-created', (_, contents) => {
  contents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message);
  });
  contents.on('render-process-gone', (_, details) => {
    errors.push(`Renderer exited: ${details.reason}`);
  });
});
app.once('quit', () => {
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EBUSY') {
      console.warn(`Temporary profile cleanup skipped: ${error.message}`);
    }
  }
});
require('../src/main');

let win;
const run = (code) => win.webContents.executeJavaScript(code);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await wait(25);
  }
  const page = await run(
    `({title:nav.current.title,kind:nav.current.kind,selected:nav.current.rows[nav.current.selected]?.label})`,
  );
  throw new Error(
    `Timed out: ${label}; page=${JSON.stringify(page)}; renderer errors=${JSON.stringify(errors)}`,
  );
}
async function expect(code, label) {
  await until(() => run(`Boolean(${code})`), label);
}
async function send(event) {
  const response = await fetch('http://127.0.0.1:4826/device/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(response.status, 204, JSON.stringify(event));
}
const command = (name) => send({ type: 'command', command: name });
async function press() {
  await command('center-down');
  await command('center-up');
  await command('center-click');
}
// Window Mode (the default) shows the player until the dial asks for the menu; the
// first press only brings the menu up.
async function openMenu() {
  if (!(await run('backdropActive() && !dialOverlay.visible'))) return;
  await press();
  await expect('dialOverlay.visible', 'dial menu opens over the player');
}
async function choose(predicate) {
  await openMenu();
  const target = await run(`nav.current.rows.findIndex(row=>${predicate})`);
  assert.ok(target >= 0, `Menu item exists: ${predicate}`);
  let selected = await run('nav.current.selected');
  while (selected !== target) {
    await send({
      type: 'dial',
      delta: Math.max(-20, Math.min(20, target - selected)),
    });
    const previous = selected;
    await expect(
      `nav.current.selected!==${previous}`,
      'dial changes selection',
    );
    selected = await run('nav.current.selected');
  }
  await press();
}
async function back(title) {
  await openMenu();
  await command('menu-down');
  await command('menu-up');
  await expect(
    `nav.current.title===${JSON.stringify(title)}`,
    `Back opens ${title}`,
  );
}
const watchdog = setTimeout(() => {
  console.error('Smoke test exceeded 60 seconds.');
  app.exit(1);
}, 60000);
async function main() {
  await app.whenReady();
  // Wait for the module bootstrap, not just the HTML load event.
  while (!(win = BrowserWindow.getAllWindows()[0])) await wait(25);
  await until(async () => {
    if (win.webContents.isLoading()) return false;
    return run(
      `typeof window.TurnbitFeatures==='object' && typeof api!=='undefined' && typeof preferences!=='undefined' && typeof radial!=='undefined'`,
    );
  }, 'renderer bootstrap');
  await expect(`demo && nav.current.title==='turnbit'`, 'offline demo Home');
  assert.equal(
    await run(`document.querySelector('.ipod,#zuneControls,#wheel')`),
    null,
    'only the active interface ships',
  );
  assert.equal(
    await run(`getComputedStyle(document.querySelector('#radial')).display`),
    'block',
  );

  await choose(`row.action==='songs'`);
  await expect(
    `nav.current.libraryKind==='songs' && nav.current.rows.some(row=>row.action==='song')`,
    'Liked Songs loads',
  );
  await choose(`row.action==='song' && row.demoIndex===1`);
  await expect(
    `nav.current.kind==='now' && playing && document.querySelector('#radialTitle').textContent==='A Little Further'`,
    'song opens the visible player',
  );
  await command('next');
  await expect(
    `index===2 && document.querySelector('#radialTitle').textContent==='Sunday Morning'`,
    'hardware Next updates playback and title',
  );
  const indicator = `getComputedStyle(document.querySelector('.radial-backdrop-state .eq')).display!=='none'`;
  await expect(indicator, 'playing indicator shows');
  await command('toggle');
  await expect(`!playing && !(${indicator})`, 'hardware Pause hides the playing indicator');
  await command('toggle');
  await expect(`playing && ${indicator}`, 'hardware Play');
  await command('volume-up');
  await expect(
    `volume>50 && document.querySelector('#radialVolumeValue').textContent===volume+'%'`,
    'volume updates the player',
  );
  await press();
  await expect(
    `nav.current.libraryKind==='songs' && nav.current.rows[nav.current.selected]?.demoIndex===index`,
    'press returns to the playing song',
  );
  await back('turnbit');

  await choose(`row.action==='playlists'`);
  await expect(
    `nav.current.libraryKind==='playlists' && nav.current.rows.some(row=>row.action==='playlist')`,
    'Playlists loads',
  );
  await choose(`row.action==='playlist'`);
  await expect(
    `nav.current.libraryKind==='playlist' && nav.current.rows.some(row=>row.action==='song')`,
    'playlist songs load',
  );
  await back('Playlists');
  await back('turnbit');
  await choose(`row.action==='settings'`);
  await expect(`nav.current.title==='Settings'`, 'Settings opens');
  await choose(`row.group==='appearance'`);
  await expect(`nav.current.settingsGroup==='appearance'`, 'Appearance opens');
  assert.equal(
    await run(
      `nav.current.rows.some(row=>['interface','case-theme','screen-theme'].includes(row.action))`,
    ),
    false,
  );
  await choose(`row.key==='radialCurve'`);
  await expect(
    `!preferences.radialCurve && JSON.parse(localStorage.getItem('turnbit-preferences')).radialCurve===false`,
    'Curved Menu toggles and saves',
  );
  await back('Settings');
  await choose(`row.group==='controls'`);
  await expect(
    `nav.current.settingsGroup==='controls'`,
    'Controls settings open',
  );
  await choose(`row.action==='double-press'`);
  await expect(
    `preferences.doublePress==='home'`,
    'double-press setting toggles',
  );
  // Test the actual gesture on a navigation row, where double-press is armed.
  await choose(`row.action==='nav-back'`);
  await expect(`nav.current.title==='Settings'`, 'Back row works');
  await press();
  await press();
  await expect(`nav.current.title==='turnbit'`, 'double-press returns Home');

  const loaded = new Promise((resolve) =>
    win.webContents.once('did-finish-load', resolve),
  );
  win.webContents.reload();
  await loaded;
  await expect(
    `typeof preferences!=='undefined' && preferences.radialCurve===false && preferences.doublePress==='home' && nav.current.title==='turnbit'`,
    'settings survive reload',
  );
  await choose(`row.action==='songs'`);
  await expect(
    `nav.current.libraryKind==='songs' && nav.current.rows.some(row=>row.action==='song')`,
    'menus remain usable after reload',
  );
  assert.deepEqual(errors, [], 'no renderer errors');
  clearTimeout(watchdog);
  console.log(
    'Smoke passed: demo startup, dial navigation, songs, playlists, playback, volume, settings, Back, double-press, persistence, and reload.',
  );
  app.quit();
}
main().catch((error) => {
  clearTimeout(watchdog);
  console.error(error);
  app.exit(1);
});
