const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-mouse-mode-test'));
process.env.TURNBIT_BRIDGE_PORT='4778';require('./widget-profile')(app);require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{try{
  await wait(1200);const mode=global.turnbitMouseMode,window=BrowserWindow.getAllWindows().find(item=>!mode.overlays.includes(item)),js=code=>window.webContents.executeJavaScript(code);
  await js(`savePreferences({mouseModeKey:'f13',interfaceStyle:'radial',playOpensNowPlaying:true,mousePassthrough:false,visibility:{mode:'off'}});syncMouseMode();nav.goHome();drawNavigation();`);await wait(300);assert.equal(mode.key,'f13');
  const visible=()=>mode.overlays.filter(item=>!item.isDestroyed()&&item.isVisible());
  // Hold: the overlay covers each display and turnbit hears scroll and clicks from it.
  mode.tracker.press();await wait(500);
  assert.ok(mode.active&&visible().length>=1,'overlay shows while the shortcut is held');assert.equal(await js(`document.body.dataset.mouseMode`),'true');
  const overlay=visible().find(item=>item.isFocused())||visible()[0],input=event=>overlay.webContents.sendInputEvent(event);
  const at={x:200,y:200};
  const start=await js(`nav.current.selected`);
  input({type:'mouseWheel',...at,deltaX:0,deltaY:-120});await wait(150);const moved=await js(`nav.current.selected`);assert.equal(Math.abs(moved-start),1,'one scroll notch moves one item');
  input({type:'mouseWheel',...at,deltaX:0,deltaY:120});await wait(150);assert.equal(await js(`nav.current.selected`),start,'scrolling back returns');
  await js(`nav.current.selected=nav.current.rows.findIndex(row=>row.action==='settings');drawNavigation();`);const homeTitle=await js(`nav.current.title`);
  const click=async button=>{input({type:'mouseDown',...at,button,clickCount:1});input({type:'mouseUp',...at,button,clickCount:1});await wait(700);};
  await click('left');assert.notEqual(await js(`nav.current.title`),homeTitle,'left click selects');
  await click('right');assert.equal(await js(`nav.current.title`),homeTitle,'right click goes back');
  await click('middle');assert.equal(await js(`nav.current.kind`),'now','middle click is Play/Pause (opens Now Playing from a menu)');
  input({type:'keyUp',keyCode:'Space'});await wait(200);
  assert.equal(mode.active,false);assert.equal(visible().length,0,'releasing the shortcut hides the overlay');assert.equal(await js(`document.body.dataset.mouseMode`),'false');
  // Tap: stays on until Esc.
  mode.tracker.press();await wait(100);const tapped=visible()[0];tapped.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await wait(400);assert.equal(mode.active,true,'a quick tap leaves the mode on');
  tapped.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});await wait(200);assert.equal(mode.active,false,'Esc turns it off');
  // A second tap toggles off; turning the setting Off removes the overlays.
  mode.tracker.press();mode.tracker.release();mode.tracker.press();assert.equal(mode.active,false);
  await js(`savePreferences({mouseModeKey:'off'});syncMouseMode();`);await wait(200);assert.equal(mode.key,'off');assert.equal(mode.overlays.length,0);
  await js(`showSetting(row=>row.action==='mouse-mode-key');`);assert.equal(await js(`nav.current.rows[nav.current.selected].detail`),'Off');
  console.log('Keyboard & Mouse Mode: hold shows the overlay, scroll moves, left click selects, right click goes back, middle click plays, release/Esc/tap toggle, Off removes it.');app.quit();
}catch(error){console.error(error);app.exit(1);}});
