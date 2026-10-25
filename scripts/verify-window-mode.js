// Confirms Window Mode actually changes the live OS window (frame, dock/taskbar) and
// that toggling destroys/recreates mainWindow exactly once without crashing.
const {app,BrowserWindow}=require('electron');
app.disableHardwareAcceleration();
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
// Fresh each run: a prior failed run can leave window-mode.json persisted true, which would make
// the first windowMode(true) call below a no-op (already true) and this script would hang waiting
// for a recreation that never happens.
const userData=fs.mkdtempSync(path.join(os.tmpdir(),'turnbit-window-mode-test-'));
// Electron can still hold the profile open at exit on Windows; a leftover temp folder is not a failure.
process.on('exit',()=>{try{fs.rmSync(userData,{recursive:true,force:true,maxRetries:3});}catch(error){console.warn(`Temporary profile cleanup skipped: ${error.message}`);}});
app.setPath('userData',userData);
// Window Mode is the default, so start from the widget to cover the switch in both directions.
fs.writeFileSync(path.join(userData,'window-mode.json'),JSON.stringify({enabled:false,bounds:{}}));
process.env.TURNBIT_BRIDGE_PORT='0';
const watchdog=setTimeout(()=>{console.error('Window verification timed out');app.exit(1);},20000);watchdog.unref();
require('../src/main');
const assert=require('node:assert/strict');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// A framed window's content area is shorter than its outer bounds (title bar eats some height);
// a frameless window's content bounds equal its outer bounds exactly.
const isFramed=win=>win.getContentBounds().height<win.getBounds().height;
// The IPC call that flips windowMode causes main to destroy() this very window shortly after
// replying, so executeJavaScript on it can never settle (the frame disappears mid-flight).
// Fire it and don't await it; instead poll for the replacement window to show up.
async function waitForNewWindow(previous,timeoutMs=5000){
  const start=Date.now();
  while(Date.now()-start<timeoutMs){
    const current=BrowserWindow.getAllWindows()[0];
    if(current&&current!==previous&&!current.isDestroyed())return current;
    await wait(50);
  }
  throw new Error('Timed out waiting for window recreation');
}
app.whenReady().then(async()=>{
  try{
    await wait(1200);
    let window=BrowserWindow.getAllWindows()[0];if(!window)throw new Error('No widget window');
    assert.equal(await window.webContents.executeJavaScript(`typeof window.turnbit.windowMode`),'function','windowMode is exposed on the bridge');
    assert.equal(isFramed(window),false,'starts frameless (Widget Mode)');
    if(process.platform==='darwin')assert.equal(app.dock.isVisible(),false,'dock hidden in Widget Mode');
    // A desk widget has to survive a Space switch and show over fullscreen apps.
    if(process.platform==='darwin')assert.equal(window.isVisibleOnAllWorkspaces(),true,'widget shows on every Space');

    await window.webContents.executeJavaScript(`localStorage.removeItem('turnbit-preferences');localStorage.setItem('dialpod-preferences',JSON.stringify({interfaceStyle:'radial',appearance:'black',gamingMode:true,mouseModeKey:'off'}));`);
    window.webContents.reload();await wait(600);
    assert.equal(await window.webContents.executeJavaScript(`preferences.appearance==='black'&&preferences.gamingMode`),true,'legacy settings survive the turnbit rename');
    await window.webContents.executeJavaScript(`savePreferences({idleNowPlaying:false});`);
    assert.equal(await window.webContents.executeJavaScript(`localStorage.getItem('dialpod-preferences')===null&&JSON.parse(localStorage.getItem('turnbit-preferences')).appearance==='black'`),true,'saving completes preference migration');
    let previous=window;
    window.webContents.executeJavaScript(`window.turnbit.windowMode(true)`).catch(()=>{});
    window=await waitForNewWindow(previous);
    await wait(800);
    assert.equal(BrowserWindow.getAllWindows().length,1,'exactly one window after recreation');
    assert.equal(isFramed(window),true,'now framed (Window Mode)');
    if(process.platform==='darwin')assert.equal(app.dock.isVisible(),true,'dock shown in Window Mode');
    if(process.platform==='darwin')assert.equal(window.isVisibleOnAllWorkspaces(),false,'Window Mode stays an ordinary window');
    assert.equal(await window.webContents.executeJavaScript(`window.turnbit.windowMode()`),true,'new window reports windowMode() true');

    assert.equal(await window.webContents.executeJavaScript(`getComputedStyle($('#windowMove')).display`),'none','widget move handle is hidden in Window Mode');
    assert.equal(await window.webContents.executeJavaScript(`settingsRows('window').some(row=>row.action==='radial-layout')`),false,'widget sizing settings are hidden in Window Mode');
    // Dial Menu Layout: whether the menu overlays the player or takes its own half of the window.
    assert.equal(await window.webContents.executeJavaScript(`settingsRows('appearance').find(row=>row.action==='backdrop-layout')?.detail`),'Overlay','Window Mode offers the menu layout, starting on Overlay');
    // Split View needs at least 960px; narrower windows fall back to the overlay.
    const wide=require('electron').screen.getDisplayMatching(window.getBounds()).workArea;
    window.setBounds({x:wide.x,y:wide.y,width:Math.min(wide.width,1100),height:Math.min(wide.height,720)});await wait(300);
    await window.webContents.executeJavaScript(`showSetting(row=>row.action==='backdrop-layout');selectItem();`);await wait(250);
    assert.deepEqual(await window.webContents.executeJavaScript(`[preferences.backdropLayout,JSON.parse(localStorage.getItem('turnbit-preferences')).backdropLayout,document.body.dataset.backdropSplit,nav.current.rows[nav.current.selected].detail]`),['split','split','true','Split View'],'selecting it switches to Split View and saves');
    await window.webContents.executeJavaScript(`selectItem();`);await wait(250);
    assert.deepEqual(await window.webContents.executeJavaScript(`[preferences.backdropLayout,document.body.dataset.backdropSplit]`),['overlay','false'],'selecting again returns to Overlay');
    // Dial Menu Background cycles Matching, Black, Glass, Cover Color; only the panel looks draw a panel.
    assert.equal(await window.webContents.executeJavaScript(`settingsRows('appearance').find(row=>row.action==='menu-background')?.detail`),'Matching','menu background starts on Matching');
    const panel=`[preferences.menuBackground,document.body.dataset.menuBackground,getComputedStyle($('#radialMenuPanel')).display,nav.current.rows[nav.current.selected].detail]`;
    await window.webContents.executeJavaScript(`showSetting(row=>row.action==='menu-background');selectItem();`);await wait(250);
    assert.deepEqual(await window.webContents.executeJavaScript(panel),['black','black','block','Black'],'Black draws its own menu panel');
    for(const [look,name] of [['glass','Glass'],['artwork','Cover Color'],['match','Matching']]){
      await window.webContents.executeJavaScript(`selectItem();`);await wait(150);
      assert.deepEqual(await window.webContents.executeJavaScript(panel),[look,look,look==='match'?'none':'block',name],`${name} menu background`);
    }
    assert.equal(JSON.parse(await window.webContents.executeJavaScript(`localStorage.getItem('turnbit-preferences')`)).menuBackground,'match','menu background is saved');
    await window.webContents.executeJavaScript(`nav.goHome();dismissDialOverlay();drawNavigation();`);
    const area=require('electron').screen.getDisplayMatching(window.getBounds()).workArea;
    window.setBounds({x:area.x+45,y:area.y+45,width:800,height:600});
    await wait(350);
    const savedBounds=window.getBounds();
    previous=window;
    window.webContents.executeJavaScript(`window.turnbit.windowMode(false)`).catch(()=>{});
    window=await waitForNewWindow(previous);
    await wait(800);
    assert.equal(BrowserWindow.getAllWindows().length,1,'exactly one window after switching back');
    assert.equal(isFramed(window),false,'back to frameless (Widget Mode)');
    if(process.platform==='darwin'){await wait(1200);assert.equal(app.dock.isVisible(),false,'dock hidden again after returning to Widget Mode');assert.equal(window.isVisibleOnAllWorkspaces(),true,'widget is back on every Space');}
    assert.equal(await window.webContents.executeJavaScript(`window.turnbit.windowMode()`),false,'new window reports windowMode() false');

    previous=window;
    window.webContents.executeJavaScript(`window.turnbit.windowMode(true)`).catch(()=>{});
    window=await waitForNewWindow(previous);await wait(800);
    assert.deepEqual(window.getBounds(),savedBounds,'placement survives replacing the entire window');
    await window.webContents.executeJavaScript(`window.turnbit.minimize()`);await wait(150);
    assert.equal(window.isMinimized(),true,'Window Mode minimizes natively');
    window.restore();await wait(150);
    // Window Mode must stay mouse-controllable: the title bar buttons and resize edges are the only
    // way to minimize, full screen or close it, so click-through and a full fade never apply here.
    await window.webContents.executeJavaScript(`savePreferences({mousePassthrough:true});`);await wait(150);
    assert.equal(window.isFocusable(),true,'click-through cannot lock the mouse out of Window Mode');
    assert.equal(await window.webContents.executeJavaScript(`settingsRows('window').some(row=>row.key==='mousePassthrough')`),false,'Mouse Click Through is hidden in Window Mode');
    await window.webContents.executeJavaScript(`savePreferences({nowPlayingBackdrop:false,visibility:{mode:'always',opacity:0,idleOpacity:0,timeout:10}});`);await wait(900);
    assert.ok(window.getOpacity()>=0.2,'Window Mode never fades below the grabbable floor');
    assert.equal(window.isFocusable(),true,'a faded Window Mode window still takes the mouse');
    assert.equal(await window.webContents.executeJavaScript(`valueSpec('opacity').min`),20,'the Opacity slider stops at the floor in Window Mode');
    // Recreated windows must reapply click-through, rather than reuse old OS-state caches.
    previous=window;window.webContents.executeJavaScript(`window.turnbit.windowMode(false)`).catch(()=>{});
    window=await waitForNewWindow(previous);await wait(800);
    assert.equal(window.isFocusable(),false,'click-through applies again once back in Widget Mode');
    assert.equal(await window.webContents.executeJavaScript(`settingsRows('window').some(row=>row.key==='mousePassthrough')`),true,'Mouse Click Through returns in Widget Mode');
    await window.webContents.executeJavaScript(`savePreferences({mousePassthrough:false,visibility:{mode:'off',opacity:100,idleOpacity:20,timeout:10}});`);await wait(150);
    console.log('Window Mode toggles the live OS window (frame + dock/taskbar), keeps the mouse in control, and survives recreation. Passed.');
    app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
