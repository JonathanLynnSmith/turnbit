const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-double-press-test'));
process.env.DIALPOD_BRIDGE_PORT='4801';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Dial Double-Press: Back (one level, like Menu) or Home (straight to Home). The Menu button is unaffected.
app.whenReady().then(async()=>{try{
  await wait(1200);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
  const send=event=>fetch('http://127.0.0.1:4801/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)}).then(r=>assert.equal(r.status,204));
  const press=async()=>{await send({type:'command',command:'center-down'});await send({type:'command',command:'center-up'});await send({type:'command',command:'center-click'});};
  const click=async()=>{await press();await wait(500);};
  const doublePress=async()=>{await press();await wait(60);await press();await wait(450);};
  const menu=async()=>{await send({type:'command',command:'menu-down'});await send({type:'command',command:'menu-up'});await wait(300);};
  const page=()=>js(`({title:nav.current.title,kind:nav.current.kind,highlighted:nav.current.rows?.[nav.current.selected]?.label})`);
  const intoPlaylist=async()=>{await js(`nav.reset(root());nav.current.selected=nav.current.rows.findIndex(r=>r.action==='playlists');drawNavigation();`);await click();await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.action==='playlist');drawNavigation();`);await click();assert.equal((await page()).title,'After Hours');};
  for(const style of ['radial','ipod']){
    await js(`savePreferences({interfaceStyle:'${style}',doublePress:'back',hoverBack:true,idleNowPlaying:false,idlePinned:false,songOpensNowPlaying:true,visibility:{mode:'off',opacity:100,idleOpacity:0,timeout:10}});demo=true;`);
    await intoPlaylist();await doublePress();assert.equal((await page()).title,'Playlists',`${style}: Back mode goes back one level`);
    // Switch the setting from Settings.
    await js(`nav.reset(root());showSettings();nav.current.selected=nav.current.rows.findIndex(r=>r.action==='double-press');drawNavigation();`);
    assert.equal((await page()).highlighted,'Dial Double-Press');await click();
    assert.equal(await js(`nav.current.rows[nav.current.selected].detail`),'Home','setting shows Home');
    assert.deepEqual(await js(`[preferences.doublePress,JSON.parse(localStorage.getItem('dialpod-preferences')).doublePress]`),['home','home'],'setting is saved');
    await intoPlaylist();await doublePress();let p=await page();assert.equal(p.title,'turnbit',`${style}: Home mode goes straight Home`);assert.equal(p.highlighted,'Playlists','Home keeps its highlight');
    await intoPlaylist();await menu();assert.equal((await page()).title,'Playlists','Menu button still goes back one level');
    await intoPlaylist();await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.action==='song');drawNavigation();`);await click();assert.equal((await page()).kind,'now');
    await doublePress();assert.equal((await page()).title,'turnbit',`${style}: Home mode from Now Playing goes Home`);
    await js(`savePreferences({doublePress:'back'});`);
  }
  console.log('Dial Double-Press: Back goes up one level, Home goes straight Home (from lists and Now Playing), the setting saves, and the Menu button is unaffected, in both interfaces.');app.quit();
}catch(error){console.error(error);app.exit(1);}});
