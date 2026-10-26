// Offline behavior and layout checks for the discrete color palette.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
app.disableHardwareAcceleration();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'turnbit-colors-'));
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
  const openColor = async (key) => {
    await run(
      `nav.reset(root());showSetting(r=>r.action==='radial-color'&&r.key==='${key}');selectItem();drawNavigation();`,
    );
  };
  await run(
    `savePreferences({idleNowPlaying:false,idlePinned:false,hoverBack:false,mouseModeKey:'off',primaryHue:360,accentHue:150,visibility:{mode:'off',opacity:100}});demo=true;playing=false;`,
  );
  await openColor('accentHue');
  assert.equal(await run(`$('#radialColorPalette').children.length`), 14);
  assert.equal(await run(`$('#radialHue')===null`), true);
  await run(`$('#radialColorPalette button[data-hue="240"]').click();`);
  assert.deepEqual(
    await run(
      `[nav.current.value,preferences.accentHue,JSON.parse(localStorage.getItem('turnbit-preferences')).accentHue]`,
    ),
    [240, 150, 150],
    'preview does not save',
  );
  assert.equal(
    await run(`$('#radialColorPalette button[aria-pressed=true]').dataset.hue`),
    '240',
  );
  await shot('color-palette-widget');
  await run(`$('#radialColorCancel').click();`);
  assert.equal(
    await run(`preferences.accentHue`),
    150,
    'Cancel restores saved color',
  );
  await openColor('accentHue');
  await run(`rotate(1);`);
  assert.equal(await run(`nav.current.value`), 180, 'dial steps to Cyan');
  await run(
    `$('#radialColorPalette button[data-hue="330"]').click();$('#radialColorSave').click();`,
  );
  assert.equal(await run(`preferences.accentHue`), 330);
  await openColor('primaryHue');
  await run(`$('#radialColorPalette button[data-hue="360"]').focus();`);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  await wait(100);
  assert.equal(
    await run(`nav.current.value`),
    0,
    'keyboard wraps White to Red',
  );
  assert.equal(
    await run(`document.activeElement.dataset.hue`),
    '0',
    'keyboard focus follows selection',
  );
  await run(
    `$('#radialColorPalette button[data-hue="360"]').click();$('#radialColorSave').click();`,
  );
  assert.deepEqual(
    await run(
      `[preferences.primaryHue,JSON.parse(localStorage.getItem('turnbit-preferences')).primaryHue]`,
    ),
    [360, 360],
  );
  await openColor('primaryHue');
  await run(
    `$('#radialColorPalette button[data-hue="60"]').click();$('#radialColorSave').click();`,
  );
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
  for (const side of ['left', 'right']) {
    win.setSize(380, 710);
    await run(
      `savePreferences({radialSide:'${side}',menuTimeout:600});demo=true;browseFromPlayer();`,
    );
    await openColor('accentHue');
    await shot('color-palette-window-' + side);
    assert.equal(
      await run(
        `(() => {const p=$('#radialColorPalette').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth&&p.top>=0&&p.bottom<=innerHeight;})()`,
      ),
      true,
      'palette fits narrow window',
    );
  }
  win.setSize(380, 360);
  await wait(200);
  await run(`$('#radialColorSave').scrollIntoView({block:'nearest'});`);
  assert.equal(
    await run(
      `(() => {const r=$('#radialColorSave').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()`,
    ),
    true,
    'Save remains reachable in short window',
  );
  await shot('color-palette-short');
  await run(`$('#radialColorSave').click();`);
  win.webContents.reload();
  await until(() => run(`typeof preferences!=='undefined'`));
  assert.deepEqual(
    await run(`[preferences.primaryHue,preferences.accentHue]`),
    [60, 330],
    'choices survive reload',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Color palette: mouse and keyboard preview, dial steps, save/cancel, reload persistence, both edges and narrow/short Window Mode passed.',
  );
  app.quit();
}
main().catch((error) => {
  console.error(error);
  app.exit(1);
});
