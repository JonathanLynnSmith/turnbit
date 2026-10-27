// Visual review with realistic metadata. Optional artwork stays outside the repository.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
app.disableHardwareAcceleration();
const profile = fs.mkdtempSync(
  path.join(os.tmpdir(), 'turnbit-visual-system-'),
);
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

  const artPath = process.env.TURNBIT_REVIEW_ART;
  const art = artPath
    ? 'data:image/jpeg;base64,' + fs.readFileSync(artPath).toString('base64')
    : '';
  const playback = (
    cover,
    name = 'Fortnight (feat. Post Malone) - BLOND:ISH Remix',
    artist = 'Taylor Swift',
    album = 'THE TORTURED POETS DEPARTMENT',
  ) =>
    `demo=false;acceptPlayback({item:{uri:'spotify:track:AAAAAAAAAAAAAAAAAAAAAA',name:${JSON.stringify(name)},artists:[{name:${JSON.stringify(artist)}}],album:{name:${JSON.stringify(album)},images:${cover ? JSON.stringify([{ url: cover }]) : '[]'}},duration_ms:228000},is_playing:true,progress_ms:62000,device:{name:'Desktop',volume_percent:50}});drawNavigation();`;
  await run(
    `savePreferences({hoverBack:false,mouseModeKey:'off',idleNowPlaying:false,menuTimeout:600});`,
  );
  win.setSize(1100, 760);
  await run(playback(''));
  await until(() => run(`$('#radialBackdropTitle').textContent==='Fortnight'`));
  assert.equal(await run(`$('#radialBackdropArtImg').hidden`), true);
  assert.equal(
    await run(`$('.radial-backdrop-cover .turnbit-artwork').hidden`),
    false,
  );
  assert.equal(
    await run(`getComputedStyle($('.radial-backdrop-cover')).backgroundImage`),
    'none',
  );
  assert.equal(
    await run(
      `getComputedStyle($('.turnbit-artwork'),'::before').maskImage.includes('turnbit-mark.svg')`,
    ),
    true,
  );
  assert.equal(
    await run(`getComputedStyle($('#radialBackdropPlay')).backdropFilter`),
    'none',
  );
  await shot('visual-system-window-missing');
  if (art) {
    await run(playback(art));
    await until(() =>
      run(
        `!$('#radialBackdropArtImg').hidden&&$('#radialBackdropArtImg').naturalWidth>0`,
      ),
    );
    assert.equal(
      await run(`$('.radial-backdrop-cover .turnbit-artwork').hidden`),
      true,
    );
    await shot('visual-system-window-art');
  }
  await run(
    `demo=true;playing=true;demos[0].name='Fortnight (feat. Post Malone) - BLOND:ISH Remix';demos[0].artist='Taylor Swift';demos[0].album='THE TORTURED POETS DEPARTMENT';demos[1].name='Everybody Wants To Rule The World';demos[1].artist='Tears For Fears';demos[1].album='Songs From The Big Chair';demos[2].name='Running Up That Hill (A Deal With God)';demos[2].artist='Kate Bush';demos[2].album='Hounds Of Love';nav.reset(root());browseFromPlayer();showLibrary('songs');`,
  );
  await until(() => run(`nav.current.rows.some(r=>r.action==='song')`));
  const fonts = await run(
    `[getComputedStyle(document.body).fontFamily,getComputedStyle(document.querySelector('.radial-label')).fontFamily]`,
  );
  assert.equal(fonts[0], fonts[1], 'browser and app share the UI typeface');
  assert.equal(
    await run(
      `getComputedStyle(document.querySelector('.radial-label')).textShadow.includes('color(')`,
    ),
    false,
    'no accent glow on labels',
  );
  await shot('visual-system-browser');
  await run(`dismissDialOverlay();openSettings();message('Saved');`);
  await wait(100);
  assert.equal(
    await run(
      `getComputedStyle($('#settings')).backgroundColor===getComputedStyle($('#actionNotice')).backgroundColor`,
    ),
    true,
    'dialog and notice use the same solid surface',
  );
  assert.equal(
    await run(`getComputedStyle($('#settings')).fontFamily`),
    fonts[0],
  );
  await run(
    `document.documentElement.style.setProperty('--tb-space-5','28px');`,
  );
  assert.equal(
    await run(`getComputedStyle($('#settings')).paddingTop`),
    '28px',
    'spacing tokens drive real components',
  );
  await run(
    `document.documentElement.style.removeProperty('--tb-space-5');message();`,
  );
  await shot('visual-system-dialog');
  await run(`$('#settings').close();message('Added to Liked Songs');`);
  await wait(400);
  assert.equal(
    await run(`getComputedStyle($('#actionNotice')).backdropFilter`),
    'none',
  );
  fs.writeFileSync(
    path.join(out, 'visual-system-notice.png'),
    (await win.webContents.capturePage()).toPNG(),
  );
  win.setSize(380, 710);
  await run(playback(''));
  await until(() => run(`$('#radialBackdropArtImg').hidden`));
  await shot('visual-system-narrow-missing');
  // A load failure takes the same branded path; a later valid cover recovers.
  await run(playback('data:image/png;base64,AAAA'));
  await until(() =>
    run(
      `$('#radialBackdropArtImg').hidden&&!!$('#radialBackdropArtImg').dataset.failedSource`,
    ),
  );
  await run(`drawNavigation();`);
  assert.equal(
    await run(`$('#radialBackdropArtImg').hidden`),
    true,
    'failed cover stays on fallback during redraw',
  );
  if (art) {
    await run(playback(art));
    await until(() =>
      run(
        `!$('#radialBackdropArtImg').hidden&&$('#radialBackdropArtImg').naturalWidth>0`,
      ),
    );
  }
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-reduced-transparency', value: 'reduce' },
    ],
  });
  await run(
    `savePreferences({menuBackground:'glass'});nav.reset(root());browseFromPlayer();drawNavigation();`,
  );
  assert.equal(
    await run(`getComputedStyle($('#radialMenuPanel')).backdropFilter`),
    'none',
    'Glass has a solid reduced-transparency fallback',
  );
  assert.equal(
    await run(
      `getComputedStyle($('#radial')).transitionDuration.split(',').every(v=>parseFloat(v)===0)`,
    ),
    true,
    'reduced motion suppresses spatial transitions',
  );
  assert.equal(
    await run(
      `getComputedStyle(document.querySelector('.radial-label')).transitionDuration.includes('0.12s')`,
    ),
    true,
    'brief feedback stays available',
  );
  await shot('visual-system-reduced');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [],
  });
  win.webContents.debugger.detach();
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
  await run(
    `savePreferences({hoverBack:false,mouseModeKey:'off',idleNowPlaying:false,visibility:{mode:'off'}});`,
  );
  for (const side of ['left', 'right']) {
    await run(`savePreferences({radialSide:'${side}'});`);
    await run(
      playback(
        '',
        'Sweet Dreams (Are Made of This)',
        'Eurythmics',
        'Sweet Dreams (Are Made of This)',
      ),
    );
    await run(`showNow();`);
    assert.equal(
      await run(
        `$('#radialArtFallback').classList.contains('turnbit-artwork')&&!$('#radialArtFallback').hidden`,
      ),
      true,
    );
    await shot('visual-system-widget-' + side);
    await run(
      `demo=true;playing=true;index=0;demos[0].name='Fortnight (feat. Post Malone) - BLOND:ISH Remix';demos[0].artist='Taylor Swift';demos[0].album='THE TORTURED POETS DEPARTMENT';nav.reset(root());showLibrary('songs');`,
    );
    await until(() =>
      run(`!!document.querySelector('.mini-cover .turnbit-artwork')`),
    );
    assert.equal(
      await run(
        `getComputedStyle($('.mini-cover .turnbit-artwork'),'::before').maskImage.includes('turnbit-mark.svg')`,
      ),
      true,
    );
    await shot('visual-system-mini-' + side);
  }
  assert.deepEqual(errors, []);
  console.log(
    'Visual system: shared typography/surfaces/spacing, branded missing and failed covers, artwork recovery, real-content layouts, both widget edges, notice/dialog, and reduced preferences passed.',
  );
  app.quit();
}
main().catch((error) => {
  console.error(error);
  app.exit(1);
});
