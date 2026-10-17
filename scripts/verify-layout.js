const {app,BrowserWindow,screen}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-layout-test'));
process.env.DIALPOD_BRIDGE_PORT='4813';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Size & Position: width, height (with live preview and cancel), vertical position, and display for the turnbit interface.
app.whenReady().then(async()=>{try{
  await wait(1200);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
  const send=event=>fetch('http://127.0.0.1:4813/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)}).then(r=>assert.equal(r.status,204));
  const click=async()=>{await send({type:'command',command:'center-down'});await send({type:'command',command:'center-up'});await send({type:'command',command:'center-click'});await wait(600);};
  const menu=async()=>{await send({type:'command',command:'menu-down'});await send({type:'command',command:'menu-up'});await wait(500);};
  const turn=async(delta,times)=>{for(let i=0;i<times;i++){await send({type:'dial',delta});await wait(40);}await wait(400);};
  const page=()=>js(`({title:nav.current.title,highlighted:nav.current.rows?.[nav.current.selected]?.label,detail:nav.current.rows?.[nav.current.selected]?.detail,labels:nav.current.rows?.filter(r=>r.action!=='nav-back').map(r=>r.label).join(', ')})`);
  const area=()=>screen.getDisplayMatching(window.getBounds()).bounds,b=()=>window.getBounds();
  await js(`savePreferences({interfaceStyle:'radial',radialSide:'left',radialWidth:1040,radialHeight:100,radialVertical:'center',radialDisplay:null,idleNowPlaying:false,visibility:{mode:'off',opacity:100,idleOpacity:0,timeout:10}});demo=true;nav.reset(root());drawNavigation();`);await wait(700);
  let a=area(),w=b();assert.equal(w.height,a.height,'default: full screen height');assert.equal(w.width,Math.min(1040,a.width),'default width');assert.equal(w.x,a.x,'docked left');
  await js(`showSetting(r=>r.action==='radial-layout');`);await click();
  let p=await page();assert.equal(p.title,'Size & Position');assert.equal(p.labels,'Display, Width, Height, Vertical Position');
  // Width: live preview, then save.
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.key==='radialWidth');drawNavigation();`);await click();assert.equal((await page()).title,'Width');
  await turn(-1,10);assert.equal(b().width,840,'width previews live while turning');assert.equal(await js('preferences.radialWidth'),1040,'not saved yet');
  await click();p=await page();assert.equal(p.title,'Size & Position');assert.equal(p.detail,'840 px');assert.equal(await js('preferences.radialWidth'),840);assert.equal(b().width,840);
  // Height: preview, cancel with Menu (snaps back), then preview and save.
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.key==='radialHeight');drawNavigation();`);await click();
  await turn(-1,10);assert.equal(b().height,Math.round(a.height*0.5),'height previews live');assert.equal(b().y,a.y+Math.round(a.height*0.25),'centered vertically');
  await menu();assert.equal(b().height,a.height,'Menu cancels and snaps back');assert.equal(await js('preferences.radialHeight'),100);
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.key==='radialHeight');drawNavigation();`);await click();await turn(-1,10);await click();
  assert.equal((await page()).detail,'50%');assert.equal(await js('preferences.radialHeight'),50);
  // Vertical Position cycles Center -> Bottom -> Top -> Center.
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.action==='radial-vertical');drawNavigation();`);
  await click();assert.equal((await page()).detail,'Bottom');assert.equal(b().y,a.y+a.height-b().height,'bottom');
  await click();assert.equal((await page()).detail,'Top');assert.equal(b().y,a.y,'top');
  await click();assert.equal((await page()).detail,'Center');
  // Display cycles Automatic -> each connected display -> Automatic.
  const displays=await js('api.displays()');assert.ok(displays.length>=1&&displays.every(d=>d.id&&d.name),'displays have ids and names');
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.action==='radial-display');drawNavigation();`);
  assert.equal((await page()).detail,'Automatic');
  for(const display of displays){await click();p=await page();assert.ok(p.detail.startsWith(display.name),`cycles to ${display.name}`);const want=screen.getAllDisplays().find(d=>String(d.id)===display.id).bounds;assert.equal(b().x,want.x,'moves to that display');}
  await click();assert.equal((await page()).detail,'Automatic','and back to Automatic');
  // Only the turnbit interface shows Size & Position; bad saved values are clamped.
  await js(`savePreferences({interfaceStyle:'ipod'});nav.reset(root());showSettings();showSettingsGroup('window');`);await wait(300);assert.ok(!(await page()).labels.includes('Size & Position'),'hidden outside turnbit');
  await js(`savePreferences({interfaceStyle:'radial'});api.setInterface('radial','left',{width:99999,height:-5,vertical:'sideways',display:'nope'});`);await wait(500);
  a=area();w=b();assert.equal(w.width,Math.min(1200,a.width),'width clamps to 1200');assert.ok(Math.abs(w.height-a.height*0.3)<=2,'height clamps to 30% (display scaling can round by a pixel or two)');
  await js(`savePreferences({radialWidth:1040,radialHeight:100,radialVertical:'center',radialDisplay:null});drawNavigation();`);
  console.log(`Size & Position: width and height preview live and save, Menu cancels, vertical position and display (${displays.length} found) apply, turnbit only, bad values clamp.`);app.quit();
}catch(error){console.error(error);app.exit(1);}});
