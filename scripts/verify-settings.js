const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-settings-test'));
process.env.TURNBIT_BRIDGE_PORT='4802';require('../src/main');
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
  assert.equal(await js(`document.querySelector('.ipod,#zuneControls,#wheel') === null`),true,'retired interface markup is absent');
  for(const style of ['ipod','zune']){
    await js(`savePreferences({interfaceStyle:'${style}'});`);
    assert.equal(await js(`preferences.interfaceStyle`),'radial',`${style} selection migrates to turnbit`);
  }
  assert.equal(await labels(),'Playback, Appearance, Navigation, Now Playing, Window','five categories, most used first');
  assert.equal(await js(`nav.current.rows.find(r=>r.label==='Playback').detail`),'Volume and devices','categories have subtitles');
  assert.equal((await page()).highlighted,'Playback','Settings opens on the first category');
  const expected={
    playback:'Volume, Playback Device, Preferred Device, Open Spotify Automatically, When Nothing Is Playing, Keep Song Position, Spotify Connection',
    appearance:'Curved Menu, Text Alignment, Screen Edge, Smoky Background, Text Color, Accent Color',
    navigation:'Reverse Dial Direction, Dial Double-Press, Back in Lists, Last Song List on Home, Hover Shortcuts, Mouse Mode Key, Click Sounds',
    'now-playing':'Play Opens Now Playing, Open Song in Now Playing, Idle to Now Playing, Follow Playing Song',
    window:'Window Mode, Transparency, Size & Position, Keep on Top, Pin Widget, Dial Only Wake, Mouse Click Through, Gaming Mode'};
  for(const [id,want] of Object.entries(expected)){
    await js(`nav.reset(root());showSettings();nav.current.selected=nav.current.rows.findIndex(r=>r.group==='${id}');drawNavigation();`);await click();
    assert.equal(await labels(),want,`${id} contents`);assert.equal((await page()).depth,3,`${id}: settings are two levels below Home`);
    assert.equal(await js(`nav.current.rows.filter(r=>r.action!=='nav-back'&&!r.branch&&!r.detail).length`),0,`${id}: every on/off setting shows its value`);
  }
  let p;
  // Toggling inside a category updates and saves; Back returns to the category you came from.
  await js(`nav.reset(root());showSetting(r=>r.key==='gamingMode');`);await click();
  assert.equal(await js(`nav.current.rows[nav.current.selected].detail`),'On');assert.deepEqual(await js(`[preferences.gamingMode,JSON.parse(localStorage.getItem('turnbit-preferences')).gamingMode]`),[true,true],'saved');
  await menu();p=await page();assert.equal(p.title,'Settings');assert.equal(p.highlighted,'Window','back lands on the category');
  await js(`savePreferences({gamingMode:false});`);
  // Curved Menu: on, labels bow along the oval (different offsets); off, they form a straight column (one offset).
  const offsets=()=>js(`[...radial.nodes.values()].filter(n=>Number(n.style.opacity)>0.05).map(n=>Math.round(parseFloat(n.style.right||n.style.left)))`);
  await js(`savePreferences({interfaceStyle:'radial',radialCurve:true});nav.reset(root());showLibrary('songs');`);await wait(300);await js(`nav.current.rows.push(...Array.from({length:12},(_,i)=>({label:'Song '+i,action:'placeholder'})));nav.current.selected=4;drawNavigation();`);await wait(700);
  assert.ok(new Set(await offsets()).size>1,'curved: labels bow along the oval');
  await js(`nav.goHome();showSetting(r=>r.key==='radialCurve');`);assert.equal((await page()).title,'Appearance');await click();
  assert.deepEqual(await js(`[preferences.radialCurve,JSON.parse(localStorage.getItem('turnbit-preferences')).radialCurve]`),[false,false],'Curved Menu off is saved');
  await js(`nav.reset(root());showLibrary('songs');`);await wait(300);await js(`nav.current.rows.push(...Array.from({length:12},(_,i)=>({label:'Song '+i,action:'placeholder'})));nav.current.selected=4;drawNavigation();`);await wait(700);
  assert.equal(new Set(await offsets()).size,1,'straight: every label shares one offset');await js(`savePreferences({radialCurve:true});`);
  // Text Alignment cycles Auto -> Left -> Right -> Auto; Auto aligns toward the docked edge (left edge: right-aligned).
  const align=()=>js(`[document.body.dataset.align,getComputedStyle(document.querySelector('.radial-label')).textAlign,nav.current.rows[nav.current.selected].detail]`);
  await js(`savePreferences({interfaceStyle:'radial',radialSide:'left',radialAlign:'auto'});nav.reset(root());showSetting(r=>r.action==='radial-align');`);await wait(200);
  assert.deepEqual(await align(),['right','right','Auto'],'Auto on the left edge aligns right');
  await click();assert.deepEqual(await align(),['left','left','Left'],'Left');await click();assert.deepEqual(await align(),['right','right','Right'],'Right');
  await js(`savePreferences({radialSide:'right'});drawNavigation();`);assert.equal((await align())[0],'right','a fixed side ignores the docked edge');
  await click();assert.deepEqual(await align(),['left','left','Auto'],'Auto on the right edge aligns left');
  assert.equal(await js(`JSON.parse(localStorage.getItem('turnbit-preferences')).radialAlign`),'auto','saved');await js(`savePreferences({radialSide:'left'});`);
  const all=await js(`settingsGroups.flatMap(g=>settingsRows(g.id).map(r=>r.label)).join('|')`);
  for(const old of ['Apperance','Clicker','Primary Color','Screen edge'])assert.ok(!all.split('|').includes(old),`old label "${old}" is gone`);
  console.log('Settings: five categories with subtitles, two levels deep, Appearance contains only turnbit settings, toggles save, back lands on the category, clearer labels, Curved Menu straightens the list, Text Alignment cycles Auto/Left/Right.');app.quit();
}catch(error){console.error(error);app.exit(1);}});
