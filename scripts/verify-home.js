const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-home-test'));
process.env.TURNBIT_BRIDGE_PORT='4800';require('./widget-profile')(app);require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Home lists Liked Songs and Playlists directly (no Music menu).
app.whenReady().then(async()=>{try{
  await wait(1200);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
  const post=async event=>{const response=await fetch('http://127.0.0.1:4800/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});assert.equal(response.status,204);await wait(80);};
  const click=async()=>{await post({type:'command',command:'center-down'});await post({type:'command',command:'center-up'});await post({type:'command',command:'center-click'});await wait(450);};
  const menu=async()=>{await post({type:'command',command:'menu-down'});await post({type:'command',command:'menu-up'});await wait(250);};
  const page=()=>js(`({title:nav.current.title,kind:nav.current.kind,labels:nav.current.rows.map(r=>r.label).join(', '),highlighted:nav.current.rows[nav.current.selected]?.label,depth:nav.stack.length})`);
  for(const style of ['radial']){
    await js(`savePreferences({interfaceStyle:'${style}',lastSongList:null,homeLastSongList:true,idleNowPlaying:false,idlePinned:false,songOpensNowPlaying:true,visibility:{mode:'off',opacity:100,idleOpacity:0,timeout:10}});demo=true;nav.reset(root());drawNavigation();`);await wait(200);
    let p=await page();assert.equal(p.labels,'Now Playing, Liked Songs, Playlists, Settings',`${style}: Home layout`);assert.equal(p.highlighted,'Liked Songs','Home opens on Liked Songs');
    await click();p=await page();assert.equal(p.title,'Liked Songs','one press opens Liked Songs');assert.equal(p.depth,2,'directly under Home');
    await menu();p=await page();assert.equal(p.title,'turnbit');assert.equal(p.highlighted,'Liked Songs','back lands on Liked Songs');
    await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.action==='playlists');drawNavigation();`);await click();p=await page();assert.equal(p.title,'Playlists','one press opens Playlists');assert.equal(p.depth,2);
    await menu();p=await page();assert.equal(p.highlighted,'Playlists','back lands on Playlists');
  }
  // Browsing a list adds Last Song List, above Settings.
  await js(`nav.reset(root());showLibrary('songs');`);await wait(300);await js(`nav.goHome();drawNavigation();`);await wait(100);
  assert.equal((await page()).labels,'Now Playing, Last Song List, Liked Songs, Playlists, Settings','Last Song List sits above Liked Songs');
  // Last Song List on Home is a setting: off hides it, on brings it back.
  await js(`savePreferences({homeLastSongList:false});drawNavigation();`);assert.equal((await page()).labels,'Now Playing, Liked Songs, Playlists, Settings','setting off hides Last Song List');
  await js(`savePreferences({homeLastSongList:true});drawNavigation();`);assert.equal((await page()).labels,'Now Playing, Last Song List, Liked Songs, Playlists, Settings','setting on restores it');
  // Center press from Now Playing returns to the playing list, directly under Home.
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.action==='songs');drawNavigation();`);await click();await click();
  assert.equal((await page()).kind,'now','choosing a song opens Now Playing');await js(`nav.musicPath=null;nav.browsingPath=null;`);await click();
  let p=await page();assert.equal(p.title,'Liked Songs','center press returns to the song list');assert.equal(p.depth,2,'with Home directly underneath');
  console.log('Home: Liked Songs and Playlists one press from Home in turnbit, back lands on them, Last Song List above Liked Songs (and configurable), center press returns under Home.');app.quit();
}catch(error){console.error(error);app.exit(1);}});
