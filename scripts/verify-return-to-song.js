const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-return-song-test'));
process.env.DIALPOD_BRIDGE_PORT='4779';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Leaving Now Playing (Back, or a single center press) turns the song list to the playing song.
app.whenReady().then(async()=>{try{
  await wait(1200);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
  const post=async event=>{const response=await fetch('http://127.0.0.1:4779/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});assert.equal(response.status,204);await wait(120);};
  const click=async()=>{await post({type:'command',command:'center-down'});await post({type:'command',command:'center-up'});await post({type:'command',command:'center-click'});await wait(450);};
  const selectedSong=()=>js(`({kind:nav.current.kind,title:nav.current.title,selected:nav.current.rows[nav.current.selected]?.demoIndex,playing:index})`);
  const reset=async style=>{await js(`savePreferences({interfaceStyle:'${style}',dialOnlyWake:false,idleNowPlaying:false,idlePinned:false,songOpensNowPlaying:true,keepCurrentSongPosition:true,visibility:{mode:'off',opacity:100,idleOpacity:0,timeout:10}});demo=true;nav.reset(root());showMusic();showLibrary('songs');nav.current.selected=0;drawNavigation();`);await wait(250);};

  await reset('radial');
  await click();let s=await selectedSong();assert.equal(s.kind,'now','Choosing a song opens Now Playing');assert.equal(s.playing,0);
  await post({type:'command',command:'next'});await post({type:'command',command:'next'});assert.equal((await selectedSong()).playing,2);
  await post({type:'command',command:'menu-down'});await post({type:'command',command:'menu-up'});await wait(300);
  s=await selectedSong();assert.equal(s.kind,'list','Back returns to the song list');assert.equal(s.selected,2,'Back lands on the playing song');

  await js(`showNow()`);await wait(150);await post({type:'command',command:'next'});assert.equal((await selectedSong()).playing,0);
  await click();s=await selectedSong();assert.equal(s.kind,'list','One click returns to the song list');assert.equal(s.selected,0,'One click lands on the playing song');

  // Playlist lists have a "Play this playlist" row first; the right song row must still be chosen.
  await js(`nav.reset(root());showMusic();showLibrary('playlists');`);await wait(250);
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.action==='playlist');drawNavigation();`);await click();
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.action==='song');drawNavigation();`);await click();
  const first=(await selectedSong()).playing;await post({type:'command',command:'next'});const now=(await selectedSong()).playing;assert.notEqual(now,first);
  await post({type:'command',command:'menu-down'});await post({type:'command',command:'menu-up'});await wait(300);
  s=await selectedSong();assert.equal(s.kind,'list');assert.equal(s.selected,now,'Playlist list lands on the playing song');

  // iPod: Back from Now Playing still goes Home; a single click returns to the list on the playing song.
  await reset('ipod');await click();await post({type:'command',command:'next'});const ipodSong=(await selectedSong()).playing;
  await click();s=await selectedSong();assert.equal(s.kind,'list');assert.equal(s.selected,ipodSong,'iPod click lands on the playing song');
  console.log('Back and single click from Now Playing land on the playing song in Liked Songs, playlists, and both interfaces.');app.quit();
}catch(error){console.error(error);app.exit(1);}});
