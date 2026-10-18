// Confirms the Now Playing Backdrop (Window Mode > radial skin) shows the album art as a full
// window background with the track info overlaid, and that it's correctly gated to windowMode +
// nowPlayingBackdrop + the radial skin, not shown otherwise.
const {app,BrowserWindow}=require('electron');
app.disableHardwareAcceleration();
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
// Fresh each run: a prior failed run can leave window-mode.json persisted true, which would make
// the windowMode(true) call below a no-op (already true) and this script would hang waiting for
// a recreation that never happens.
const userData=path.join(os.tmpdir(),'turnbit-backdrop-test');
fs.rmSync(userData,{recursive:true,force:true});
app.setPath('userData',userData);
process.env.TURNBIT_BRIDGE_PORT='4804';
require('../src/main');
const assert=require('node:assert/strict');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForNewWindow(previous,timeoutMs=5000){
  const start=Date.now();
  while(Date.now()-start<timeoutMs){
    const current=BrowserWindow.getAllWindows()[0];
    if(current&&current!==previous&&!current.isDestroyed())return current;
    await wait(50);
  }
  throw new Error('Timed out waiting for window recreation');
}
// The recreated window's renderer resyncs preferences.windowMode from main asynchronously on boot
// (see the api.windowMode() boot sync in renderer.js); poll instead of guessing a fixed delay.
async function waitUntil(win,expression,timeoutMs=5000){
  const start=Date.now();
  while(Date.now()-start<timeoutMs){
    if(await win.webContents.executeJavaScript(expression))return;
    await wait(50);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}
// A tiny solid-color PNG stands in for real album art (demo mode never has real artwork, and CSP
// only allows images from Spotify's CDNs or data: URIs).
const FAKE_ART='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
app.whenReady().then(async()=>{
  try{
    await wait(1200);
    let window=BrowserWindow.getAllWindows()[0];if(!window)throw new Error('No widget window');
    const js=code=>window.webContents.executeJavaScript(code);

    assert.equal(await js(`$('#radialBackdrop').hidden`),true,'backdrop hidden by default (widget mode)');

    const previous=window;
    window.webContents.executeJavaScript(`window.turnbit.windowMode(true)`).catch(()=>{});
    window=await waitForNewWindow(previous);
    await waitUntil(window,`preferences.windowMode===true`);
    const run=code=>window.webContents.executeJavaScript(code);

    assert.equal(await run(`savePreferences({interfaceStyle:'radial'})`),true,'switched to radial skin');
    await wait(300);
    assert.equal(await run(`$('#radialBackdrop').hidden`),true,'still hidden: nowPlayingBackdrop not on yet');

    assert.equal(await run(`savePreferences({nowPlayingBackdrop:true})`),true,'enabled Now Playing Backdrop');
    await run(`demo=false;acceptPlayback({item:{name:'Test Song',artists:[{name:'Test Artist'}],album:{name:'Test Album',images:[{url:${JSON.stringify(FAKE_ART)}}]},duration_ms:210000},is_playing:true,progress_ms:60000,device:{id:'dev1',volume_percent:62}});drawNavigation();`);
    await wait(400);

    assert.equal(await run(`$('#radialBackdrop').hidden`),false,'backdrop shown once windowMode + radial + the setting are all on');
    assert.equal(await run(`$('#radialBackdropTitle').textContent`),'Test Song','title mirrors the playing track');
    assert.equal(await run(`$('#radialBackdropArtist').textContent`),'Test Artist','artist mirrors the playing track');
    assert.equal(await run(`$('#radialBackdropArt').style.backgroundImage.includes('data:image/png')`),true,'backdrop art uses the track artwork');
    assert.equal(await run(`$('#radialNow').hidden`),true,'compact Now Playing panel stays hidden; the backdrop replaces it');
    assert.equal(await run(`nav.current.kind`),'list','browsing the menu keeps showing the backdrop underneath (not forced to Now Playing)');
    assert.equal(await run(`$('#radialBackdrop').hidden`),false,'backdrop still visible while a menu list is open (menu overlays it)');

    const out=path.join(__dirname,'../artifacts');fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'now-playing-backdrop.png'),(await window.webContents.capturePage()).toPNG());

    await run(`showNow();`);
    await wait(400);
    assert.equal(await run(`nav.current.kind`),'now','selecting Now Playing navigates there');
    assert.equal(await run(`$('#radialLabels').hidden`),true,'menu list hides on the Now Playing page, revealing the clean backdrop');
    assert.equal(await run(`$('#radialNow').hidden`),true,'compact panel still stays hidden on the Now Playing page too');
    fs.writeFileSync(path.join(out,'now-playing-backdrop-on-now-page.png'),(await window.webContents.capturePage()).toPNG());

    // Mirrors the real Settings flow (case 'playback-preference'): savePreferences() alone doesn't
    // redraw the radial skin, the menu's own handler calls drawNavigation() right after it.
    assert.equal(await run(`savePreferences({nowPlayingBackdrop:false})`),true,'disabled Now Playing Backdrop');
    await run(`drawNavigation();`);
    await wait(300);
    assert.equal(await run(`$('#radialBackdrop').hidden`),true,'hidden again once the setting is off');

    console.log('Now Playing Backdrop gating, content, and both screenshots passed.');
    app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
