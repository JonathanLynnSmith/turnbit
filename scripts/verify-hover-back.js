const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-hover-back-test'));
process.env.DIALPOD_BRIDGE_PORT='4794';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Hover to Go Back: turning onto Back and resting for 1s goes back; turning away cancels; both pieces are settings.
app.whenReady().then(async()=>{try{
  await wait(1200);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
  const post=async event=>{const response=await fetch('http://127.0.0.1:4794/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});assert.equal(response.status,204);await wait(60);};
  const turn=delta=>post({type:'dial',delta});
  const click=async()=>{await post({type:'command',command:'center-down'});await post({type:'command',command:'center-up'});await post({type:'command',command:'center-click'});await wait(450);};
  const page=()=>js(`({title:nav.current.title,highlighted:nav.current.rows[nav.current.selected]?.label,first:nav.current.rows[0]?.label,hold:document.body.dataset.backHold,progress:Number(getComputedStyle(document.documentElement).getPropertyValue('--back-hold')||0)})`);
  const reset=async(style,prefs='')=>{await js(`savePreferences({interfaceStyle:'${style}',backRow:true,hoverBack:true,idleNowPlaying:false,idlePinned:false,dialOnlyWake:false,visibility:{mode:'off',opacity:100,idleOpacity:0,timeout:10}${prefs}});demo=true;nav.reset(root());showMusic();drawNavigation();`);await wait(200);};

  for(const style of ['radial','ipod']){
    await reset(style);
    await turn(-1);let p=await page();assert.equal(p.highlighted,'Back');assert.equal(p.hold,'true',`${style}: turning onto Back starts the hold`);
    await wait(450);p=await page();assert.equal(p.title,'Music','still on Music halfway');assert.ok(p.progress>0.25&&p.progress<0.8,`${style}: ring is partly filled (${p.progress})`);
    await wait(750);p=await page();assert.equal(p.title,'turnbit',`${style}: after 1s it goes back`);assert.equal(p.highlighted,'Music','landing on the item you came from');assert.notEqual(p.hold,'true','ring cleared');
  }

  await reset('radial');await turn(-1);await wait(500);await turn(1);await wait(900);
  let p=await page();assert.equal(p.title,'Music','Turning away cancels');assert.equal(p.highlighted,'Playlists');assert.notEqual(p.hold,'true');

  // Chain: Liked Songs -> Music -> Home by turning up and resting each time.
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.action==='songs');drawNavigation();`);await click();assert.equal((await page()).title,'Liked Songs');
  await turn(-1);await wait(1200);p=await page();assert.equal(p.title,'Music');assert.equal(p.highlighted,'Liked Songs');
  await turn(-2);await wait(1200);assert.equal((await page()).title,'turnbit','Chained hover goes back again');

  // An empty list highlights Back on its own; that must not bounce you out.
  await js(`push({title:'Empty',rows:[{label:'No items found',disabled:true}]});`);await wait(1500);
  p=await page();assert.equal(p.title,'Empty','Empty list does not auto-back');assert.notEqual(p.hold,'true');

  // Hover to Go Back off: resting does nothing, pressing still works.
  await reset('radial',',hoverBack:false');await turn(-1);await wait(1400);p=await page();assert.equal(p.title,'Music','Hover off: no auto-back');assert.notEqual(p.hold,'true');
  await click();assert.equal((await page()).title,'turnbit','Pressing Back still works');

  // Back in Lists: toggled from Settings without losing the highlighted row.
  await reset('radial');await js(`nav.reset(root());showSettings();nav.current.selected=nav.current.rows.findIndex(r=>r.key==='backRow');drawNavigation();`);await wait(150);
  assert.equal((await page()).first,'Back');await click();p=await page();
  assert.notEqual(p.first,'Back','Back in Lists off removes the row');assert.equal(p.highlighted,'Back in Lists','highlight stays on the setting');
  await js(`nav.reset(root());showMusic();drawNavigation();`);await wait(100);p=await page();assert.equal(p.first,'Playlists','Lists have no Back row');assert.equal(p.highlighted,'Playlists');
  await turn(-1);await wait(1300);assert.equal((await page()).title,'Music','No Back row means no hover back');
  await js(`nav.reset(root());showSettings();nav.current.selected=nav.current.rows.findIndex(r=>r.key==='backRow');drawNavigation();`);await click();p=await page();
  assert.equal(p.first,'Back','Back in Lists on restores the row');assert.equal(p.highlighted,'Back in Lists');
  assert.deepEqual(await js(`[preferences.backRow,JSON.parse(localStorage.getItem('dialpod-preferences')).backRow]`),[true,true],'setting is saved');
  console.log('Hover to Go Back: 1s rest goes back with a filling ring in both interfaces, turning away cancels, chains, skips empty lists, and both Back in Lists and Hover to Go Back are settings.');app.quit();
}catch(error){console.error(error);app.exit(1);}});
