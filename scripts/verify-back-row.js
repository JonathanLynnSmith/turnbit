const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-back-row-test'));
process.env.TURNBIT_BRIDGE_PORT='4780';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Lists below Home start with a Back row; entering a list still highlights its first real item.
app.whenReady().then(async()=>{try{
  await wait(1200);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
  const post=async event=>{const response=await fetch('http://127.0.0.1:4780/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});assert.equal(response.status,204);await wait(120);};
  const click=async()=>{await post({type:'command',command:'center-down'});await post({type:'command',command:'center-up'});await post({type:'command',command:'center-click'});await wait(450);};
  const page=()=>js(`({title:nav.current.title,kind:nav.current.kind,first:nav.current.rows[0]?.label,highlighted:nav.current.rows[nav.current.selected]?.label})`);
  for(const style of ['radial','ipod']){
    await js(`savePreferences({interfaceStyle:'${style}',idleNowPlaying:false,idlePinned:false,visibility:{mode:'off',opacity:100,idleOpacity:0,timeout:10}});demo=true;nav.reset(root());drawNavigation();`);await wait(200);
    let p=await page();assert.notEqual(p.first,'Back',`${style}: Home has no Back row`);
    await js(`showMusic();`);await wait(100);p=await page();
    assert.equal(p.first,'Back',`${style}: Music starts with Back`);assert.equal(p.highlighted,'Playlists',`${style}: entering Music highlights the first item`);
    await js(`nav.current.selected=nav.current.rows.findIndex(row=>row.action==='songs');drawNavigation();`);await click();await wait(400);p=await page();
    assert.equal(p.first,'Back');assert.equal(p.highlighted,'Night Drive',`${style}: Liked Songs (loaded after opening) highlights the first song, not Back`);
    await post({type:'dial',delta:-1});assert.equal((await page()).highlighted,'Back','Turning up reaches Back');
    await click();p=await page();assert.equal(p.title,'Music',`${style}: pressing Back returns to Music`);assert.equal(p.highlighted,'Liked Songs','and keeps the item you came from');
    await js(`showSettings();showInterfaces();`);await wait(100);p=await page();assert.equal(p.first,'Back');assert.equal(p.highlighted,style==='radial'?'turnbit':'iPod','Interface list highlights the current interface');
    await js(`showNow();`);await wait(100);p=await page();assert.equal(p.kind,'now');assert.notEqual(p.first,'Back','Now Playing has no Back row');
  }
  console.log('Back row: absent on Home and Now Playing, first in lists, never highlighted on entry (including lists that load later), and returns to the previous list in both interfaces.');app.quit();
}catch(error){console.error(error);app.exit(1);}});
