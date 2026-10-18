const {app,BrowserWindow,screen}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-layout-test'));
process.env.TURNBIT_BRIDGE_PORT='4813';require('../src/main');
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
  await js(`savePreferences({interfaceStyle:'radial',radialSide:'left',radialWidthPct:35,radialHeight:100,radialVertical:'center',radialDisplay:null,idleNowPlaying:false,visibility:{mode:'off',opacity:100,idleOpacity:0,timeout:10}});demo=true;nav.reset(root());drawNavigation();`);await wait(700);
  let a=area(),w=b();assert.equal(w.height,a.height,'default: full screen height');const near=(actual,want,msg)=>assert.ok(Math.abs(actual-want)<=2,`${msg} (${actual} vs ${want})`);const pct=n=>Math.min(a.width,Math.max(400,Math.round(a.width*n/100)));near(w.width,pct(35),'default width: 35% of the screen');assert.equal(w.x,a.x,'docked left');
  await js(`showSetting(r=>r.action==='radial-layout');`);await click();
  let p=await page();assert.equal(p.title,'Size & Position');assert.equal(p.labels,'Display, Width, Height, Vertical Position');
  // Width: live preview, then save.
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.key==='radialWidthPct');drawNavigation();`);await click();assert.equal((await page()).title,'Width');
  await turn(-1,3);near(b().width,pct(20),'width previews live while turning');assert.equal(await js('preferences.radialWidthPct'),35,'not saved yet');
  await click();p=await page();assert.equal(p.title,'Size & Position');assert.equal(p.detail,'20%');assert.equal(await js('preferences.radialWidthPct'),20);near(b().width,pct(20),'width');
  // The backdrop stays solid behind the labels and still fades out by the window edge at a narrow width.
  await js(`nav.reset(root());showLibrary('songs');`);await wait(900);
  const fade=async()=>{const img=await window.webContents.capturePage(),{width:CW,height:CH}=img.getSize(),px=img.toBitmap(),y=Math.round(CH/2),scale=CW/b().width;
    const textEnd=await js(`Math.max(...[...document.querySelectorAll('.radial-label')].filter(n=>+n.style.opacity>.05).map(n=>n.getBoundingClientRect().right))`);
    return {solid:px[(y*CW+Math.round(10*scale))*4+3],behind:px[(y*CW+Math.round((textEnd-40)*scale))*4+3],edge:px[(y*CW+CW-2)*4+3]};};
  let f=await fade();assert.ok(f.behind>=f.solid*0.9,`solid behind the labels (${f.behind} vs ${f.solid})`);assert.ok(f.edge<=f.solid*0.15,`faded out at the window edge (${f.edge} vs ${f.solid})`);
  await js(`nav.reset(root());showSetting(r=>r.action==='radial-layout');`);await click();assert.equal((await page()).title,'Size & Position');
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
  // Short windows fade the backdrop at any end inside the screen: Center both, Top only the bottom, Bottom only the top.
  const ends=()=>js(`[document.querySelector('#radial').dataset.fadeTop,document.querySelector('#radial').dataset.fadeBottom]`);
  await js(`savePreferences({radialHeight:50,radialVertical:'center'});drawNavigation();`);await wait(400);assert.deepEqual(await ends(),['true','true'],'center fades both ends');
  const topAlpha=async()=>{const img=await window.webContents.capturePage(),{width:CW,height:CH}=img.getSize(),px=img.toBitmap();return [px[(2*CW+Math.round(CW*0.02))*4+3],px[(Math.round(CH/2)*CW+Math.round(CW*0.02))*4+3]];};
  let [edgeA,midA]=await topAlpha();assert.ok(edgeA<=midA*0.2,`backdrop fades at the top edge (${edgeA} vs ${midA})`);
  await js(`savePreferences({radialVertical:'top'});drawNavigation();`);await wait(400);assert.deepEqual(await ends(),['false','true'],'top: fade only the bottom');
  await js(`savePreferences({radialVertical:'bottom'});drawNavigation();`);await wait(400);assert.deepEqual(await ends(),['true','false'],'bottom: fade only the top');
  await js(`savePreferences({radialHeight:100,radialVertical:'center'});drawNavigation();`);await wait(400);assert.deepEqual(await ends(),['false','false'],'full height: no vertical fade');
  await js(`savePreferences({radialHeight:50});drawNavigation();`);await wait(300);
  // Display cycles Automatic -> each connected display -> Automatic.
  const displays=await js('api.displays()');assert.ok(displays.length>=1&&displays.every(d=>d.id&&d.name),'displays have ids and names');
  await js(`nav.current.selected=nav.current.rows.findIndex(r=>r.action==='radial-display');drawNavigation();`);
  assert.equal((await page()).detail,'Automatic');
  for(const display of displays){await click();p=await page();assert.ok(p.detail.startsWith(display.name),`cycles to ${display.name}`);const want=screen.getAllDisplays().find(d=>String(d.id)===display.id).bounds;assert.equal(b().x,want.x,'moves to that display');}
  await click();assert.equal((await page()).detail,'Automatic','and back to Automatic');
  // Only the turnbit interface shows Size & Position; bad saved values are clamped.
  await js(`savePreferences({interfaceStyle:'ipod'});nav.reset(root());showSettings();showSettingsGroup('window');`);await wait(300);assert.ok(!(await page()).labels.includes('Size & Position'),'hidden outside turnbit');
  await js(`savePreferences({interfaceStyle:'radial'});Object.assign(preferences,{radialWidthPct:99999,radialHeight:-5,radialVertical:'sideways',radialDisplay:'nope'});drawNavigation();`);await wait(500);
  a=area();w=b();near(w.width,pct(70),'width clamps to 70%');assert.ok(Math.abs(w.height-a.height*0.3)<=2,'height clamps to 30% (display scaling can round by a pixel or two)');
  await js(`savePreferences({radialWidthPct:35,radialHeight:100,radialVertical:'center',radialDisplay:null});drawNavigation();`);
  console.log(`Size & Position: width and height (as screen percentages) preview live and save, the fade stays visible when narrow, short windows fade top and bottom, Menu cancels, vertical position and display (${displays.length} found) apply, turnbit only, bad values clamp.`);app.quit();
}catch(error){console.error(error);app.exit(1);}});
