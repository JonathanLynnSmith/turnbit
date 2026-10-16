const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-settings-test'));
process.env.DIALPOD_BRIDGE_PORT='4802';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Settings are grouped: Settings > category > setting, with value screens (marked ›) one level further.
app.whenReady().then(async()=>{try{
  await wait(1200);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
  const send=event=>fetch('http://127.0.0.1:4802/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)}).then(r=>assert.equal(r.status,204));
  const click=async()=>{await send({type:'command',command:'center-down'});await send({type:'command',command:'center-up'});await send({type:'command',command:'center-click'});await wait(500);};
  const menu=async()=>{await send({type:'command',command:'menu-down'});await send({type:'command',command:'menu-up'});await wait(300);};
  const labels=()=>js(`nav.current.rows.filter(r=>r.action!=='nav-back').map(r=>r.label).join(', ')`);
  const page=()=>js(`({title:nav.current.title,highlighted:nav.current.rows[nav.current.selected]?.label,depth:nav.stack.length})`);
  const open=async style=>{await js(`savePreferences({interfaceStyle:'${style}',gamingMode:false,idleNowPlaying:false,idlePinned:false,visibility:{mode:'off',opacity:100,idleOpacity:0,timeout:10}});demo=true;nav.reset(root());nav.current.selected=nav.current.rows.findIndex(r=>r.action==='settings');drawNavigation();`);await click();};

  await open('radial');
  assert.equal(await labels(),'Playback, Appearance, Navigation, Now Playing, Window','five categories, most used first');
  assert.equal(await js(`nav.current.rows.find(r=>r.label==='Playback').detail`),'Volume and devices','categories have subtitles');
  assert.equal((await page()).highlighted,'Playback','Settings opens on the first category');
  const expected={
    playback:'Volume, Playback Device, Preferred Device, Open Spotify Automatically, Keep Song Position, Spotify Connection',
    appearance:'Interface, Curved Menu, Screen Edge, Smoky Background, Text Color, Accent Color',
    navigation:'Reverse Dial Direction, Dial Double-Press, Back in Lists, Last Song List on Home, Hover Shortcuts, Click Sounds',
    'now-playing':'Play Opens Now Playing, Open Song in Now Playing, Idle to Now Playing, Follow Playing Song',
    window:'Transparency, Keep on Top, Pin Widget, Dial Only Wake, Mouse Click Through, Gaming Mode'};
  for(const [id,want] of Object.entries(expected)){
    await js(`nav.reset(root());showSettings();nav.current.selected=nav.current.rows.findIndex(r=>r.group==='${id}');drawNavigation();`);await click();
    assert.equal(await labels(),want,`${id} contents`);assert.equal((await page()).depth,3,`${id}: settings are two levels below Home`);
    assert.equal(await js(`nav.current.rows.filter(r=>r.action!=='nav-back'&&!r.branch&&!r.detail).length`),0,`${id}: every on/off setting shows its value`);
  }
  // Appearance shows only what applies to the interface.
  await open('ipod');await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.group==='appearance');drawNavigation();`);await click();
  assert.equal(await labels(),'Interface, Case Color, Screen Theme','iPod Appearance shows case color and screen theme');
  // Switching interface rebuilds Appearance and keeps Interface highlighted.
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.action==='interface');drawNavigation();`);await click();
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.style==='radial');drawNavigation();`);await click();
  let p=await page();assert.equal(p.title,'Appearance');assert.equal(p.highlighted,'Interface');assert.equal(await labels(),expected.appearance,'switching to turnbit swaps in its rows');
  // Toggling inside a category updates and saves; Back returns to the category you came from.
  await js(`nav.reset(root());showSetting(r=>r.key==='gamingMode');`);await click();
  assert.equal(await js(`nav.current.rows[nav.current.selected].detail`),'On');assert.deepEqual(await js(`[preferences.gamingMode,JSON.parse(localStorage.getItem('dialpod-preferences')).gamingMode]`),[true,true],'saved');
  await menu();p=await page();assert.equal(p.title,'Settings');assert.equal(p.highlighted,'Window','back lands on the category');
  await js(`savePreferences({gamingMode:false});`);
  // Curved Menu: on, labels bow along the oval (different offsets); off, they form a straight column (one offset).
  const offsets=()=>js(`[...radial.nodes.values()].filter(n=>Number(n.style.opacity)>0.05).map(n=>Math.round(parseFloat(n.style.right||n.style.left)))`);
  await js(`savePreferences({interfaceStyle:'radial',radialCurve:true});nav.reset(root());showLibrary('songs');`);await wait(300);await js(`nav.current.rows.push(...Array.from({length:12},(_,i)=>({label:'Song '+i,action:'placeholder'})));nav.current.selected=4;drawNavigation();`);await wait(700);
  assert.ok(new Set(await offsets()).size>1,'curved: labels bow along the oval');
  await js(`nav.goHome();showSetting(r=>r.key==='radialCurve');`);assert.equal((await page()).title,'Appearance');await click();
  assert.deepEqual(await js(`[preferences.radialCurve,JSON.parse(localStorage.getItem('dialpod-preferences')).radialCurve]`),[false,false],'Curved Menu off is saved');
  await js(`nav.reset(root());showLibrary('songs');`);await wait(300);await js(`nav.current.rows.push(...Array.from({length:12},(_,i)=>({label:'Song '+i,action:'placeholder'})));nav.current.selected=4;drawNavigation();`);await wait(700);
  assert.equal(new Set(await offsets()).size,1,'straight: every label shares one offset');await js(`savePreferences({radialCurve:true});`);
  const all=await js(`settingsGroups.flatMap(g=>settingsRows(g.id).map(r=>r.label)).join('|')`);
  for(const old of ['Apperance','Clicker','Primary Color','Screen edge'])assert.ok(!all.split('|').includes(old),`old label "${old}" is gone`);
  console.log('Settings: five categories with subtitles, two levels deep, Appearance matches the interface (and rebuilds on switch), toggles save, back lands on the category, clearer labels, Curved Menu straightens the list.');app.quit();
}catch(error){console.error(error);app.exit(1);}});
