// Isolated demo profile, muted Web Audio: no Spotify connection or audible test audio.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
app.disableHardwareAcceleration();
app.setPath(
  'userData',
  fs.mkdtempSync(path.join(os.tmpdir(), 'turnbit-radio-')),
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const watchdog = setTimeout(() => app.exit(1), 30000);
watchdog.unref();
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1000,
      height: 850,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true,
        backgroundThrottling: false,
      },
    });
    const errors = [];
    win.webContents.setAudioMuted(true);
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message);
    });
    const run = (code) => win.webContents.executeJavaScript(code, true);
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
    await wait(600);
    assert.equal(await run(`typeof radio`), 'object', 'full renderer boots');
    await run(
      `window.radioAudioContexts=[];window.radioNoiseGains=[];const NativeAudioContext=window.AudioContext;window.AudioContext=class extends NativeAudioContext{constructor(){super();window.radioAudioContexts.push(this);}createGain(){const gain=super.createGain();window.radioNoiseGains.push(gain);return gain;}};void 0;`,
    );
    await run(
      `nav.reset(root());browseFromPlayer();nav.current.selected=nav.current.rows.findIndex(r=>r.action==='radio');selectItem();`,
    );
    assert.equal(await run(`radio.open`), true, 'home opens Radio');
    assert.equal(
      await run(`document.querySelector('[data-static]').checked`),
      true,
      'radio static is enabled by default',
    );
    await run(`document.querySelector('[data-add]').click()`);
    await wait(50);
    await run(`document.querySelector('[data-playlists] button').click()`);
    await wait(700);
    assert.equal(await run(`playing`), true, 'preset tunes demo playback');
    assert.equal(
      await run(
        `progress >= demos[index].duration * 0.15 && progress <= demos[index].duration * 0.85`,
      ),
      true,
      'station joins the song within the middle 70 percent',
    );
    assert.equal(
      await run(
        `JSON.parse(localStorage.getItem('turnbit-radio-demo')).stations.length`,
      ),
      1,
    );
    await run(`document.querySelector('[data-add]').click()`);
    await wait(50);
    await run(
      `document.querySelectorAll('[data-playlists] button')[1].click()`,
    );
    await wait(700);
    assert.equal(
      await run(`index`),
      2,
      'second station selects its own playlist',
    );
    await run(`rotate(-9);`);
    await wait(200);
    assert.equal(
      await run(`document.querySelector('[data-frequency]').textContent`),
      '89.0',
      'dial crosses frequencies between presets',
    );
    assert.equal(
      await run(`document.querySelector('[data-signal]').textContent`),
      'SEARCHING',
      'empty frequency has no reception',
    );
    assert.equal(
      await run(`index`),
      2,
      'empty frequencies do not start another playlist',
    );
    assert.ok(
      await run(`window.radioNoiseGains[0].gain.value > 0.03`),
      'static continues between stations',
    );
    assert.equal(
      await run(`window.radioAudioContexts[0].state`),
      'running',
      'noise engine runs while tuning',
    );
    await run(`rotate(-1);`);
    await wait(200);
    assert.equal(
      await run(`index`),
      0,
      'outer pickup starts the next station under static',
    );
    assert.equal(
      await run(`document.querySelector('[data-signal]').textContent`),
      'ACQUIRING',
      'station remains covered by static in the pickup buffer',
    );
    assert.ok(
      await run(`window.radioNoiseGains[0].gain.value > 0.03`),
      'full static remains during early playback',
    );
    await run(`rotate(-8);`);
    await wait(400);
    assert.ok(
      await run(`window.radioNoiseGains[0].gain.value < 0.001`),
      'static clears at station center',
    );
    assert.equal(
      await run(`index`),
      0,
      'rapid tuning settles on final station',
    );
    await run(`radio.close();radio.show();`);
    assert.equal(
      await run(`document.querySelectorAll('.radio-presets button').length`),
      2,
      'presets survive reopening',
    );
    await run(`rotate(18);menuBack();`);
    await wait(400);
    assert.equal(
      await run(`index`),
      0,
      'closing cancels pending station switch',
    );
    assert.equal(
      await run(`window.radioAudioContexts[0].state`),
      'suspended',
      'closing stops the noise engine',
    );
    await run(`radio.show();`);
    await wait(200);
    const out = path.join(__dirname, '../artifacts');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      path.join(out, 'radio-desktop.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    win.setSize(380, 760);
    await wait(150);
    assert.equal(
      await run(
        `document.querySelector('#radio').scrollWidth <= document.querySelector('#radio').clientWidth + 1`,
      ),
      true,
      'narrow dialog has no horizontal overflow',
    );
    fs.writeFileSync(
      path.join(out, 'radio-narrow.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await run(`demo=false;render();`);
    assert.equal(
      await run(`document.querySelectorAll('.radio-presets button').length`),
      0,
      'demo presets do not leak into Spotify mode',
    );
    assert.deepEqual(errors, [], 'renderer has no console errors');
    await run(`radio.close();document.querySelector('#radio').remove();
      window.autoFillCalls=0;window.autoFillPlays=0;
      window.manualStation={id:'9999999999999999999999',uri:'spotify:playlist:9999999999999999999999',name:'My saved station'};
      localStorage.setItem('turnbit-radio-spotify',JSON.stringify({stations:[manualStation]}));
      window.autoFillRadio=window.TurnbitFeatures.createRadio({
        getState:()=>({demo:false,volume:50,playing:false,track:{title:'Nothing playing',artist:'',artwork:''}}),
        library:async(offset,ownedOnly)=>{window.autoFillCalls++;if(!ownedOnly)throw new Error('Wrong library');return{items:Array.from({length:20},(_,i)=>{const n=offset+i+1;return{id:String(n).padStart(22,'0'),uri:'spotify:playlist:'+String(n).padStart(22,'0'),name:'Playlist '+n,radioEligible:n%3===0}}),next:offset===0,nextOffset:offset===0?20:null};},
        play:async()=>{window.autoFillPlays++;return true;},transport:async()=>{},noteActivity:()=>{},setVolume:async()=>{}
      });autoFillRadio.show();void 0;`);
    await wait(100);
    assert.equal(
      await run(`document.querySelectorAll('.radio-presets button').length`),
      10,
      'automatically fills ten channels',
    );
    assert.equal(
      await run(
        `JSON.parse(localStorage.getItem('turnbit-radio-spotify')).stations[0].id`,
      ),
      '9999999999999999999999',
      'existing station keeps its channel',
    );
    assert.equal(await run(`autoFillCalls`), 2, 'reads all playlist pages');
    assert.equal(
      await run(`autoFillPlays`),
      0,
      'auto-fill never starts playback',
    );
    await run(`autoFillRadio.close();autoFillRadio.show();`);
    await wait(50);
    assert.equal(
      await run(`autoFillCalls`),
      2,
      'reopening keeps saved selection without reloading',
    );
    await run(
      `document.querySelector('[data-remove]').click();autoFillRadio.close();autoFillRadio.show();`,
    );
    await wait(50);
    assert.equal(
      await run(`document.querySelectorAll('.radio-presets button').length`),
      9,
      'removed presets stay removed',
    );
    await run(`document.querySelector('[data-fill]').click();`);
    await wait(100);
    assert.equal(
      await run(`document.querySelectorAll('.radio-presets button').length`),
      10,
      'Fill channels tops up empty channels',
    );
    assert.equal(
      await run(
        `new Set(JSON.parse(localStorage.getItem('turnbit-radio-spotify')).stations.map(s=>s.id)).size`,
      ),
      10,
      'top-up does not duplicate stations',
    );
    await run(`autoFillRadio.close();`);
    assert.deepEqual(errors, [], 'auto-fill has no renderer errors');
    console.log(
      'Radio verified: navigation, opt-in, playlists, coalescing, cancellation, persistence, narrow layout, and connection isolation.',
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
