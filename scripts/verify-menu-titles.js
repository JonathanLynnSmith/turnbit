// Offline visual checks for menu icons and the experimental title treatment.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
app.disableHardwareAcceleration();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'turnbit-menu-titles-'));
app.setPath('userData', profile);
require('./widget-profile')(app);
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
    await wait(300);
    fs.writeFileSync(
      path.join(out, name + '.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
  };
  await run(
    `savePreferences({idleNowPlaying:false, idlePinned:false, hoverBack:false, mouseModeKey:'off', visibility:{mode:'off',opacity:100}});demo=true;playing=false;nav.reset(root());drawNavigation();`,
  );
  for (const side of ['left', 'right']) {
    await run(
      `savePreferences({radialSide:'${side}'});nav.reset(root());drawNavigation();`,
    );
    const icons = await run(
      `Array.from($('#radialLabels').querySelectorAll('.radial-label'), n => ({label:n.title, icon:!!n.querySelector('.row-icon'), mask:n.querySelector('.row-icon') && getComputedStyle(n.querySelector('.row-icon')).maskImage}))`,
    );
    assert.equal(icons.length, 4);
    assert.ok(
      icons.every((row) => row.icon && row.mask !== 'none'),
      JSON.stringify(icons),
    );
    await shot('menu-icons-widget-' + side);
  }
  await run(
    `demos[0].name='Fortnight (feat. Post Malone) - BLOND:ISH Remix';index=0;showNow();render();`,
  );
  assert.equal(await run(`$('#radialTitle').textContent`), 'Fortnight');
  assert.equal(
    await run(`$('#radialTitleDetail').textContent`),
    'feat. Post Malone · BLOND:ISH Remix',
  );
  await shot('song-title-widget');
  const old = win;
  void run(`window.turnbit.windowMode(true)`).catch(() => {});
  await until(() => {
    const next = BrowserWindow.getAllWindows()[0];
    if (next && next !== old) {
      win = next;
      return true;
    }
    return false;
  });
  await until(() =>
    run(`typeof preferences !== 'undefined' && preferences.windowMode`),
  );
  listen();
  win.setSize(1100, 760);
  await run(
    `savePreferences({idleNowPlaying:false,menuTimeout:600,hoverBack:false,visibility:{mode:'off',opacity:100}});demos[0].name='Fortnight (feat. Post Malone) - BLOND:ISH Remix';demo=true;index=0;playing=false;drawNavigation();`,
  );
  await until(() => run(`$('#radialBackdropTitle').textContent==='Fortnight'`));
  await shot('song-title-window');
  win.setSize(380, 710);
  await shot('song-title-narrow');
  await run(
    `demos[0].name='Sweet Dreams (Are Made of This)';drawNavigation();`,
  );
  await until(() => run(`$('#radialBackdropTitleDetail').hidden`));
  assert.equal(
    await run(`$('#radialBackdropTitle').textContent`),
    'Sweet Dreams (Are Made of This)',
  );
  for (const side of ['left', 'right']) {
    await run(
      `savePreferences({radialSide:'${side}',idlePinned:true});nav.reset(root());browseFromPlayer();drawNavigation();`,
    );
    assert.equal(await run(`$('#windowDialPinned').hidden`), false);
    assert.equal(
      await run(
        `(() => {const probe=document.createElement('span');probe.style.color='var(--radial-accent)';$('#radialBackdrop').append(probe);const matches=getComputedStyle(probe).color===getComputedStyle($('#windowDialPinned')).backgroundColor;probe.remove();return matches;})()`,
      ),
      true,
      'pin uses the accent color',
    );
    assert.equal(
      await run(
        `getComputedStyle($('#windowDialPinned')).maskImage.includes('menu-pin.svg')`,
      ),
      true,
    );
    await shot('menu-icons-narrow-' + side);
  }
  await run(`savePreferences({idlePinned:false});drawNavigation();`);
  assert.equal(await run(`$('#windowDialPinned').hidden`), true);
  assert.deepEqual(errors, []);
  console.log(
    'Menu icons: both sides, narrow Window Mode, pin on/off. Titles: widget/window/narrow, credits, versions, unchanged parentheses, stale detail cleared.',
  );
  app.quit();
}
main().catch((error) => {
  console.error(error);
  app.exit(1);
});
