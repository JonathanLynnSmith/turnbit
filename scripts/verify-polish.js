// Isolated Electron render and gesture checks; never uses the real Spotify session.
const {app,BrowserWindow,screen}=require('electron');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();
app.setPath('userData',fs.mkdtempSync(path.join(app.getPath('temp'),'turnbit-polish-')));
process.env.DIALPOD_BRIDGE_PORT='4827';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{try{
  await wait(1200);const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
  const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  await js(`savePreferences({interfaceStyle:'radial',idleNowPlaying:false,visibility:{mode:'off'}});nav.reset(root());drawNavigation();`);
  for(const side of ['left','right']){
    await js(`savePreferences({radialSide:'${side}'});nav.reset(root());showLibrary('songs');`);await wait(500);
    const weights=await js(`(()=>{rotate(1);const node=radial.nodes.get(nav.current.selected);window.weightCheckNode=node;return [getComputedStyle(node).fontWeight,node.getAttribute('aria-selected')];})()`);
    assert.deepEqual(weights,['400','true'],'selection is immediate and keeps a regular weight');
    await wait(500);
    assert.equal(await js(`getComputedStyle(window.weightCheckNode).fontWeight`),'400','settling never switches text to bold');
    fs.writeFileSync(path.join(__dirname,`../artifacts/turnbit-polish-${side}.png`),(await win.webContents.capturePage()).toPNG());
    await js('showNow()');await wait(400);
    for(const [width,height] of [[600,850],[400,600],[400,340]]){
      win.setBounds({width,height});await wait(150);
      const fits=await js(`(()=>{const controls=[...document.querySelectorAll('#radialNow .radial-art,#radialNow .radial-track,#radialSeek,#radialVolume')];return controls.every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});})()`);
      assert.ok(fits,`${side} playback fits ${width}x${height}`);
    }
    fs.writeFileSync(path.join(__dirname,`../artifacts/turnbit-polish-now-${side}.png`),(await win.webContents.capturePage()).toPNG());
  }
  await js(`savePreferences({radialSide:'left'});nav.reset(root());drawNavigation();`);await wait(250);
  const old=win.getBounds();
  const readCursor=screen.getCursorScreenPoint;let cursor={x:100,y:100};screen.getCursorScreenPoint=()=>cursor;
  await js(`api.windowGesture('start','move')`);cursor={x:140,y:145};await wait(70);
  assert.notDeepEqual(win.getBounds(),old,'move follows pointer');
  await js(`api.windowGesture('cancel','move')`);assert.deepEqual(win.getBounds(),old);
  await js(`api.windowGesture('start','move')`);await js(`api.windowGesture('cancel','move')`);assert.deepEqual(win.getBounds(),old);
  await js(`api.windowGesture('start','resize')`);cursor={x:100,y:45};await wait(100);await js(`api.windowGesture('end','resize')`);
  const b=win.getBounds();assert.ok(Math.abs(b.width/b.height-old.width/old.height)<.01,'resize keeps proportions');
  assert.ok(b.height<old.height,'resize follows pointer');screen.getCursorScreenPoint=readCursor;
  const saved=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'floating-placement.json'),'utf8'));assert.deepEqual(saved.bounds,b);
  assert.equal(await js(`getComputedStyle(document.querySelector('#windowMove')).display`),'block');
  assert.equal(win.isResizable(),false,'native freeform resize is replaced by proportional handle');
  assert.deepEqual(errors,[]);console.log('Polish: both edges, 3 playback sizes, gesture cancel, proportional bounds, persisted placement, and renderer errors passed.');app.quit();
}catch(error){console.error(error);app.exit(1);}});
