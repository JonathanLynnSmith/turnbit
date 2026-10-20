// Window Mode switches between Now Playing and dial browsing through the hardware bridge.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
app.disableHardwareAcceleration();
const userData = fs.mkdtempSync(path.join(os.tmpdir(),'turnbit-player-test-'));
app.setPath('userData',userData);
// Electron can still hold the profile open at exit on Windows; a leftover temp folder is not a failure.
process.on('exit',()=>{try{fs.rmSync(userData,{recursive:true,force:true,maxRetries:3});}catch(error){console.warn(`Temporary profile cleanup skipped: ${error.message}`);}});
const watchdog = setTimeout(()=>{console.error('Window player verification timed out');app.exit(1);},90000);watchdog.unref();
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function until(condition,message='Condition timed out') {
  const start=Date.now();
  while(Date.now()-start<5000){if(await condition())return;await wait(40);}
  throw new Error(message);
}
// Original test artwork keeps screenshots deterministic and independent of Spotify/network access.
const ART='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><defs><linearGradient id="sky" x2=".8" y2="1"><stop stop-color="#d0a67d"/><stop offset=".48" stop-color="#657e80"/><stop offset="1" stop-color="#172b3d"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h640v640H0z"/><circle cx="412" cy="240" r="100" fill="#efcc90" opacity=".8"/><path d="M0 375Q160 290 340 390T640 370V640H0" fill="#243e4b"/><path d="M0 455Q180 350 355 460T640 425V640H0" fill="#182c39"/><path d="M0 540Q170 420 350 535T640 490V640H0" fill="#10202c"/><text x="48" y="78" fill="#f9eddb" font-family="sans-serif" font-size="22" letter-spacing="9">AFTER HOURS</text><text x="48" y="594" fill="#c8d6d7" font-family="sans-serif" font-size="12" letter-spacing="5">NIGHT DRIVE / VOL. 01</text></svg>`);
const WINDOW_MIN_OPACITY=20;
async function main(){
  // Use an OS-assigned port, so the real app and concurrent tests remain independent.
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  process.env.TURNBIT_BRIDGE_PORT=String(port);require('../src/main');await app.whenReady();await wait(1000);
  let win=BrowserWindow.getAllWindows()[0];
  const run=code=>win.webContents.executeJavaScript(code);
  const errors=[];const listen=()=>{
    win.webContents.on('render-process-gone',(_,details)=>errors.push(details.reason));
    win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
    win.webContents.on('preload-error',(_,file,error)=>errors.push(file+': '+error.message));
  };listen();
  const send=async event=>{
    const response=await fetch(`http://127.0.0.1:${port}/device/event`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});
    assert.equal(response.status,204);await wait(60);
  };
  const turn=delta=>send({type:'dial',delta});
  const press=async()=>{for(const command of ['center-down','center-up','center-click'])await send({type:'command',command});await wait(400);};
  const mode=async value=>{
    const old=win;void run(`window.turnbit.windowMode(${value})`).catch(()=>{});
    await until(()=>{const next=BrowserWindow.getAllWindows()[0];if(next&&next!==old){win=next;return true;}});
    await until(()=>run(`typeof preferences!=='undefined'&&preferences.windowMode===${value}`));await wait(150);listen();
  };
  const hidden=()=>run(`document.body.dataset.dialOverlay!=='true'`);
  const settled=browsing=>until(()=>run(`getComputedStyle($('.radial-backdrop-info')).opacity==='${browsing?'0':'1'}'&&getComputedStyle($('#radial')).opacity==='${browsing?'1':'0'}'`),'view transition did not settle');
  const insideMenu=()=>run(`(()=>{const cover=document.querySelector('.radial-mini .mini-cover');if(!cover)return false;const art=cover.getBoundingClientRect(),menu=$('#radial').getBoundingClientRect();return art.left>=menu.left-0.5&&art.right<=menu.right+0.5;})()`);
  const hittable=selector=>run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===hit||e.contains(hit);})()`);
  assert.equal(await run(`$('#radialBackdrop').hidden`),true,'widget mode keeps its existing presentation');
  await mode(true);
  assert.equal(await run(`$('#radialBackdrop').hidden`),false,'Window Mode opens the large player by default');
  assert.equal(await hidden(),true,'the window starts with an unobstructed player');
  assert.equal(await run(`preferences.menuTimeout`),8,'the browsing timeout starts at the original 8 seconds');
  await run(`savePreferences({idleNowPlaying:false,hoverBack:false,mouseModeKey:'off'});demo=false;acceptPlayback({item:{uri:'spotify:track:AAAAAAAAAAAAAAAAAAAAAA',name:'Night Drive',artists:[{name:'turnbit sessions'}],album:{name:'After Hours',images:[{url:${JSON.stringify(ART)}}]},duration_ms:214000},is_playing:true,progress_ms:62000,liked:false,shuffle_state:false,repeat_state:'off',device:{id:'test',name:'Living Room',volume_percent:62}});drawNavigation();`);
  assert.equal(await run(`$('#radialBackdropTitle').textContent`),'Night Drive');
  assert.equal(await run(`$('#radialBackdropArtist').textContent`),'turnbit sessions');
  for(const selector of ['#radialBackdropSeek','#radialBackdropVolume','#radialBackdropPlay','#radialBackdropBrowse'])assert.equal(await hittable(selector),true,selector+' receives input');
  const out=path.join(__dirname,'../artifacts');fs.mkdirSync(out,{recursive:true});
  const shot=async name=>fs.writeFileSync(path.join(out,name),(await win.webContents.capturePage()).toPNG());
  await wait(250);await shot('window-player.png');
  if(process.env.TURNBIT_CAPTURE_TRANSITION==='1'){
    const frames=[];
    const capture=async delay=>{const image=(await win.webContents.capturePage()).resize({width:720});frames.push({image,delay});};
    const record=async duration=>{
      const start=Date.now();let previous=start;
      while(Date.now()-start<duration){await capture(40);const now=Date.now();frames.at(-1).delay=Math.max(40,now-previous);previous=now;await wait(30);}
    };
    await capture(600);
    await run('browseFromPlayer();');await record(800);
    await run('dismissDialOverlay();');await record(800);
    frames.at(-1).delay=700;
    const {GIFEncoder,quantize,applyPalette}=require('gifenc'),gif=GIFEncoder();
    for(const [index,{image,delay}] of frames.entries()){
      const {width,height}=image.getSize(),pixels=image.toBitmap(),rgba=new Uint8Array(pixels.length);
      for(let i=0;i<pixels.length;i+=4){rgba[i]=pixels[i+2];rgba[i+1]=pixels[i+1];rgba[i+2]=pixels[i];rgba[i+3]=255;}
      const palette=quantize(rgba,256,{format:'rgb565'});
      gif.writeFrame(applyPalette(rgba,palette,'rgb565'),width,height,{palette,delay,repeat:index===0?0:undefined});
    }
    gif.finish();fs.writeFileSync(path.join(out,'window-view-transition.gif'),gif.bytes());
  }
  const bounds=()=>run(`(()=>{const r=$('.radial-backdrop-info').getBoundingClientRect();return [r.x,r.y,r.width,r.height];})()`);
  const before=await bounds(),selected=await run('nav.current.selected');
  await turn(1);
  assert.equal(await hidden(),false,'turning the real bridge dial reveals browsing');
  assert.equal(await run('nav.current.selected'),selected+1,'the same turn also navigates');
  assert.deepEqual(await bounds(),before,'switching screens preserves the player layout for its return');
  assert.equal(await run(`$('#radialLabels').clientHeight===innerHeight`),true,'menu uses the full widget carousel height');
  await settled(true);
  assert.equal(await run(`getComputedStyle($('.radial-backdrop-info')).opacity`),'0','Now Playing fades out completely');
  assert.equal(await run(`getComputedStyle($('.radial-backdrop-info')).visibility`),'hidden','the player is hidden during browsing');
  assert.equal(await run(`getComputedStyle($('#radialBackdropArt')).opacity`),'0','background album artwork also disappears');
  assert.equal(await run(`$('.radial-backdrop-info').inert&&$('.radial-backdrop-info').getAttribute('aria-hidden')==='true'`),true,'hidden playback controls cannot receive input or focus');
  assert.equal(await run(`getComputedStyle($('#radial')).opacity`),'1','dial menu finishes its entrance');
  assert.equal(await run(`$('#windowViewLabel').textContent`),'BROWSE','header identifies the browsing screen');
  assert.equal(await hittable('#radialBackdropPlay'),false,'hidden playback buttons do not intercept browsing');
  await shot('window-dial-browse.png');
  await run(`window.savedPage=nav.current;window.savedSelection=nav.current.selected;savePreferences({menuTimeout:1});dialOverlay.lastInput=Date.now()-2000;`);
  await until(hidden,'overlay did not dismiss');
  await settled(false);
  assert.equal(await run(`getComputedStyle($('.radial-backdrop-info')).opacity`),'1','Now Playing fades back in on idle');
  assert.equal(await run(`getComputedStyle($('#radial')).visibility`),'hidden','dial menu leaves the player screen');
  assert.equal(await run(`$('.radial-backdrop-info').inert`),false,'playback controls become interactive again');
  assert.equal(await run('nav.current===window.savedPage&&nav.current.selected===window.savedSelection'),true,'dismissal preserves browsing context');
  await send({type:'heartbeat'});assert.equal(await hidden(),true,'heartbeat never reveals browsing');
  await run(`savePreferences({menuTimeout:600});`);
  await run('demo=true;render();');
  await press();assert.equal(await hidden(),false,'initial dial press opens the menu');
  assert.equal(await run('nav.current===window.savedPage'),true,'opening press does not accidentally select');
  await press();assert.equal(await run('nav.current.title'),'Playlists','second dial press selects normally');
  await run('dismissDialOverlay();');await turn(-1);
  assert.equal(await run('nav.current.title'),'Playlists','dial wakes the same browsing page');
  await run(`showSetting(r=>r.action==='radial-background');selectItem();dialOverlay.lastInput=Date.now()-20000;`);
  await wait(300);assert.equal(await hidden(),false,'value editing stays open beyond the idle deadline');
  // Choosing a song restores the player with its new title.
  await run(`showLibrary('songs');`);
  await until(()=>run(`nav.current.rows.some(row=>row.action==='song'&&row.demoIndex===1)`),'the demo song list did not load');
  await run(`nav.current.selected=nav.current.rows.findIndex(row=>row.action==='song'&&row.demoIndex===1);drawNavigation();selectItem();`);
  await wait(400);
  assert.equal(await hidden(),true,'song selection returns to the player');
  assert.equal(await run(`$('#radialBackdropTitle').textContent`),'A Little Further','the returned player shows the selected song');
  // Reversing an in-flight transition should settle on the last requested view.
  await run(`browseFromPlayer();`);await wait(60);
  await run(`dismissDialOverlay();`);await wait(60);
  await run(`browseFromPlayer();`);await wait(450);
  assert.equal(await run(`getComputedStyle($('.radial-backdrop-info')).opacity==='0'&&getComputedStyle($('#radial')).opacity==='1'`),true,'rapid input settles cleanly on browsing');
  await run(`nav.reset(root());showNow();`);await wait(400);
  assert.equal(await hidden(),true,'Now Playing retracts the menu');
  // Reduced motion switches views immediately, including artwork and visibility.
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await run(`browseFromPlayer();`);
  assert.equal(await run(`getComputedStyle($('.radial-backdrop-info')).opacity==='0'&&getComputedStyle($('#radial')).opacity==='1'`),true,'reduced motion switches directly to browsing');
  await run(`dismissDialOverlay();`);
  assert.equal(await run(`getComputedStyle($('.radial-backdrop-info')).opacity==='1'&&getComputedStyle($('#radial')).opacity==='0'`),true,'reduced motion restores the player immediately');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});
  win.webContents.debugger.detach();
  // Media controls must operate without opening or replacing the browsing page.
  await run(`demo=true;playing=false;render();`);
  await send({type:'command',command:'toggle'});
  assert.equal(await run('playing'),true,'hardware Play toggles immediately');
  assert.equal(await hidden(),true,'hardware Play keeps the clean player visible');
  await run(`$('#radialBackdropPlay').click();$('[data-backdrop-command=like]').click();$('[data-backdrop-command=shuffle]').click();$('[data-backdrop-command=repeat]').click();`);
  assert.equal(await run(`!playing&&demoLikes.has(index)&&demoShuffle&&demoRepeat==='context'`),true,'persistent playback controls work');
  assert.equal(await hidden(),true,'playback controls do not summon the dial');
  assert.equal(await run(`$('[data-backdrop-command=like]').getAttribute('aria-pressed')`),'true','Like exposes its saved state');
  win.focus();await wait(100);await run(`$('#radialBackdropPlay').focus();`);
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait(100);
  assert.equal(await run('playing'),true,'Enter activates the focused playback button');
  assert.equal(await hidden(),true,'keyboard playback does not open the menu');
  await run(`$('#radialBackdropBrowse').focus();`);
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait(100);
  assert.equal(await hidden(),false,'Browse works from the keyboard');
  await wait(400);
  await run(`$('#radialBackdropDismiss').click();`);
  assert.equal(await hidden(),true,'clicking outside dismisses browsing');
  // Transparency reaches the window player too, held above the floor that keeps the frame grabbable.
  await run(`savePreferences({visibility:{mode:'idle',idleOpacity:0,timeout:1,opacity:70}});`);
  await until(()=>win.getOpacity()<1,'the window player did not fade on the Transparency idle timeout');
  await until(()=>win.getOpacity()===WINDOW_MIN_OPACITY/100,'the fade did not settle on the Window Mode floor');
  assert.equal(await run('visibilityState.invisible'),false,'so it never becomes invisible');
  assert.equal(await run(`settingsRows('window').some(row=>row.action==='visibility')`),true,'Transparency stays in the Window menu with the backdrop on');
  await run(`savePreferences({visibility:{mode:'off',opacity:100,idleOpacity:20,timeout:10}});`);
  await until(()=>win.getOpacity()===1,'turning it off did not bring the window back to solid');
  // Player controls and text fit landscape and portrait layouts, without changing the menu geometry.
  for(const [width,height] of [[400,520],[600,620],[960,720],[1200,700]]){
    win.setSize(width,height);await wait(180);
    await run(`demos[index].name='A long song title that wraps across the playing screen';render();`);
    assert.equal(await run(`(()=>{const cover=$('.radial-backdrop-cover').getBoundingClientRect(),title=$('#radialBackdropTitle').getBoundingClientRect(),controls=$('.radial-backdrop-controls').getBoundingClientRect();return cover.top>=70&&cover.bottom<=controls.top&&title.bottom<=controls.top&&controls.bottom<=innerHeight&&controls.left>=0&&controls.right<=innerWidth;})()`),true,'player fits '+width+'x'+height);
    if(width<=640)assert.equal(await run(`$('.radial-backdrop-cover').getBoundingClientRect().bottom<=$('.radial-backdrop-track').getBoundingClientRect().top`),true,'portrait artwork and title do not overlap');
    for(const selector of ['#radialBackdropPlay','#radialBackdropSeek','#radialBackdropVolume'])assert.equal(await hittable(selector),true,selector+' clickable '+width+'x'+height);
    if(width===400){await wait(100);await shot('window-player-portrait.png');}
    for(const side of ['left','right']){
      await run(`savePreferences({radialSide:${JSON.stringify(side)}});browseFromPlayer();`);await wait(240);
      assert.equal(await run(`$('#radialLabels').clientHeight===innerHeight&&!$('#radial').inert`),true,'widget menu overlays '+side);
      if(width===960&&side==='right'){await wait(200);await shot('window-dial-browse-right.png');}
      await run('dismissDialOverlay();');await wait(400);
    }
  }
  // Ambient glow: the artwork tints the middle of the menu, with the mask carrying the falloff.
  const playing=`{item:{uri:'spotify:track:AAAAAAAAAAAAAAAAAAAAAA',name:'Night Drive',artists:[{name:'turnbit sessions'}],album:{name:'After Hours',images:[{url:${JSON.stringify(ART)}}]},duration_ms:214000},is_playing:true,progress_ms:62000,device:{id:'test',name:'Living Room',volume_percent:62}}`;
  await run(`demo=false;acceptPlayback(${playing});render();`);await wait(250);
  const glow=()=>run(`(()=>{const el=$('#radialGlow'),style=getComputedStyle(el);return {opacity:style.opacity,art:el.style.backgroundImage.startsWith('url('),masked:(style.maskImage||style.webkitMaskImage||'').includes('gradient'),blurred:style.filter.includes('blur')};})()`);
  let glowState=await glow();
  assert.equal(glowState.art,true,'the glow takes its colour from the playing artwork');
  assert.ok(Number(glowState.opacity)>0&&Number(glowState.opacity)<0.5,'subtly: '+glowState.opacity);
  assert.equal(glowState.masked,true,'a gradient mask fades it out, so it has no edge');
  assert.equal(glowState.blurred,true,'and it is blurred past recognition');
  assert.equal(await run(`(()=>{const g=$('#radialGlow').getBoundingClientRect();return Math.abs((g.top+g.bottom)/2-innerHeight/2)<2;})()`),true,'centred on the middle of the list rather than sitting low');
  assert.equal(await run(`(()=>{const g=$('#radialGlow').getBoundingClientRect();return g.left<0&&g.right>innerWidth&&g.width>=innerWidth*1.2;})()`),true,'and spread across the full window with room for the blurred falloff');
  assert.equal(await run(`$('#radialBackdrop').contains($('#radialGlow'))&&!!($('#radialGlow').compareDocumentPosition($('.radial-backdrop-info'))&Node.DOCUMENT_POSITION_FOLLOWING)`),true,'painting under the player, so it reaches behind the controls');
  assert.equal(await run(`Number(getComputedStyle($('#radial')).zIndex||0)>Number(getComputedStyle($('#radialBackdrop')).zIndex||0)`),true,'and under the menu, so the text over it stays crisp');
  assert.equal(await run(`getComputedStyle($('#radialGlow')).pointerEvents`),'none','the glow takes no input of its own');
  await run(`demo=false;acceptPlayback({item:null,is_playing:false});render();`);
  await until(async()=>Number((await glow()).opacity)===0,'the glow did not fade out with nothing playing');
  await run(`acceptPlayback(${playing});render();`);
  await until(async()=>Number((await glow()).opacity)>0,'the glow did not come back with the artwork');

  // Dial Menu Timeout: how long the menu stays before the idle timeout puts it away.
  await run(`savePreferences({menuTimeout:8});`);
  assert.equal(await run(`settingsRows('window').find(row=>row.action==='menu-timeout')?.detail`),'8 sec','the Window menu offers the timeout, showing the current value');
  await run(`nav.reset(root());showSetting(row=>row.action==='menu-timeout');selectItem();`);await wait(250);
  assert.equal(await run(`[nav.current.kind,nav.current.key,nav.current.value]`).then(v=>v.join(':')),'visibility:menuTimeout:8','it opens a seconds slider on the current value');
  await run(`nav.current.value=2;selectItem();`);await wait(250);
  assert.deepEqual(await run(`[preferences.menuTimeout,JSON.parse(localStorage.getItem('turnbit-preferences')).menuTimeout,nav.current.rows[nav.current.selected].detail]`),[2,2,'2 sec'],'the chosen value saves and shows on the row');
  await run(`nav.reset(root());browseFromPlayer();`);await wait(300);
  assert.equal(await hidden(),false,'the menu opens');
  await wait(1400);
  assert.equal(await hidden(),false,'and is still up before the 2 second timeout');
  await wait(1200);
  assert.equal(await hidden(),true,'then hides on the timeout the user set');
  // A long timeout keeps it up well past the original eight seconds.
  await run(`savePreferences({menuTimeout:600});browseFromPlayer();`);await wait(300);
  await run(`dialOverlay.lastInput=Date.now()-20000;`);await wait(700);
  assert.equal(await hidden(),false,'a longer timeout outlasts the old fixed one');
  await run(`savePreferences({menuTimeout:600});dismissDialOverlay();`);await wait(250);

  // Split View: while the menu is up it sits beside the player instead of covering it. The menu still
  // comes and goes the same way, so the idle timeout collapses it and the player expands to fill.
  win.setContentSize(960,720);await wait(250);
  await run(`savePreferences({radialSide:'left',backdropLayout:'split',idlePinned:false});nav.reset(root());dismissDialOverlay();drawNavigation();`);await wait(400);
  const playerLeft=()=>run(`$('.radial-backdrop-info').getBoundingClientRect().left`);
  const menuEdge=()=>run(`$('#radial').getBoundingClientRect().right`);
  assert.equal(await run(`document.body.dataset.backdropSplit`),'true','Split View turns on');
  assert.equal(await hidden(),true,'it still starts on an unobstructed player');
  assert.ok(await playerLeft()<120,'with the menu away the player keeps the whole window');
  assert.equal(await run(`document.body.dataset.playerColumn`),'wide','and lays itself out for the full width');
  assert.equal(await run(`getComputedStyle($('#radialBackdropBrowse')).display!=='none'`),true,'Browse still opens the menu');
  // An opening press reveals the menu without selecting, exactly as the overlay does.
  await press();
  assert.equal(await hidden(),false,'a press opens the menu');
  assert.equal(await run(`nav.current.title`),'turnbit','the opening press does not also select');
  await wait(400);
  assert.ok(await playerLeft()>=await menuEdge()-1,'the player moves over beside the menu');
  assert.equal(await run(`$('#radial').inert||$('.radial-backdrop-info').inert`),false,'both halves take input');
  assert.equal(await run(`getComputedStyle($('.radial-backdrop-info')).opacity==='1'&&getComputedStyle($('#radial')).opacity==='1'`),true,'neither half fades the other out');
  assert.equal(await run(`$('#radialBackdropDismiss').hidden`),true,'no dismiss target covers the player');
  assert.equal(await run(`document.body.dataset.playerColumn`),'narrow','two-thirds of the narrowest split window stacks the player');
  for(const selector of ['#radialBackdropPlay','#radialBackdropSeek','#radialBackdropVolume'])assert.equal(await hittable(selector),true,selector+' stays clickable beside the menu');
  // With the menu already up, the next press selects.
  await run(`nav.current.selected=nav.current.rows.findIndex(row=>row.action==='playlists');drawNavigation();`);
  await press();
  assert.equal(await run(`nav.current.title`),'Playlists','a press selects once the menu is up');
  assert.equal(await hidden(),false,'and the menu stays beside the player');
  // The idle timeout puts the menu away and the player expands over its half.
  await run(`savePreferences({menuTimeout:2});dialOverlay.lastInput=Date.now()-20000;`);await wait(700);
  assert.equal(await hidden(),true,'idle collapses the menu');
  assert.ok(await playerLeft()<120,'and the player expands to fill the window');
  assert.equal(await run(`document.body.dataset.playerColumn`),'wide','the expanded player uses the full width again');
  // Pin Dial Menu holds the split open.
  await run(`browseFromPlayer();savePreferences({idlePinned:true,menuTimeout:2});`);await wait(400);
  await run(`dialOverlay.lastInput=Date.now()-20000;`);await wait(700);
  assert.equal(await hidden(),false,'Pin Dial Menu keeps the menu beside the player');
  await run(`savePreferences({idlePinned:false,menuTimeout:600});`);
  // Choosing a song updates the player beside the menu when it is not set to open Now Playing.
  await run(`savePreferences({songOpensNowPlaying:false});demo=true;showLibrary('songs');drawNavigation();`);
  await until(()=>run(`nav.current.rows.some(row=>row.action==='song'&&row.demoIndex===2)`),'the demo song list did not load');
  const chosen=await run(`nav.current.rows.find(row=>row.action==='song'&&row.demoIndex===2).label`);
  await run(`nav.current.selected=nav.current.rows.findIndex(row=>row.action==='song'&&row.demoIndex===2);drawNavigation();selectItem();`);await wait(450);
  assert.equal(await hidden(),false,'the menu stays put');
  assert.equal(await run(`$('#radialBackdropTitle').textContent`),chosen,'and the player beside it follows the selection');
  assert.equal(await insideMenu(),true,'the playing row keeps its artwork inside the menu half');
  // The seam between the halves is a choice.
  const seam=()=>run(`Number(getComputedStyle($('#radialBackdrop'),'::after').opacity)`);
  await until(async()=>await seam()===1,'the divider did not show by default');
  await shot('window-split.png');
  await run(`showSetting(row=>row.key==='splitDivider');selectItem();`);await wait(400);
  assert.deepEqual(await run(`[preferences.splitDivider,JSON.parse(localStorage.getItem('turnbit-preferences')).splitDivider,nav.current.rows[nav.current.selected].detail]`),[false,false,'Off'],'turning it off saves');
  await until(async()=>await seam()===0,'the divider did not go away');
  assert.equal(await run(`document.body.dataset.backdropSplit`),'true','with the halves themselves untouched');
  await run(`selectItem();`);await wait(400);
  assert.deepEqual(await run(`[preferences.splitDivider,nav.current.rows[nav.current.selected].detail]`),[true,'On'],'and back on again');
  await until(async()=>await seam()===1,'the divider did not come back');
  await run(`nav.reset(root());showLibrary('songs');`);
  await until(()=>run(`nav.current.rows.some(row=>row.action==='song')`),'the demo song list did not load');
  // Open Song in Now Playing puts the menu away, the same as it does in the overlay.
  await run(`savePreferences({songOpensNowPlaying:true});nav.current.selected=nav.current.rows.findIndex(row=>row.action==='song'&&row.demoIndex===0);drawNavigation();selectItem();`);await wait(600);
  assert.equal(await hidden(),true,'Open Song in Now Playing collapses the menu to the full player');
  await run(`savePreferences({songOpensNowPlaying:false});browseFromPlayer();`);await wait(400);
  await run(`savePreferences({radialSide:'right'});drawNavigation();`);await wait(400);
  assert.equal(await run(`(()=>{const menu=$('#radial').getBoundingClientRect(),player=$('.radial-backdrop-info').getBoundingClientRect();return menu.right>=innerWidth-1&&player.right<=menu.left+1;})()`),true,'docking right mirrors the halves');
  assert.equal(await insideMenu(),true,'a right-docked menu keeps its artwork inside its half too');
  await shot('window-split-right.png');
  await run(`savePreferences({radialSide:'left'});drawNavigation();`);await wait(250);
  // Two columns need room: a window that would leave either half slim returns to the overlay.
  win.setContentSize(940,700);await wait(400);
  assert.equal(await run(`document.body.dataset.backdropSplit`),'false','just under the split width falls back to the overlay');
  assert.equal(await run(`getComputedStyle($('.radial-backdrop-info')).opacity`),'0','and the overlay hides the player while browsing');
  win.setSize(1500,760);await wait(400);
  assert.equal(await run(`document.body.dataset.backdropSplit`),'true','widening restores Split View');
  assert.equal(await run(`document.body.dataset.playerColumn`),'wide','a wide enough half puts artwork beside the text');
  assert.equal(await run(`Math.abs($('#radial').getBoundingClientRect().width-innerWidth/3)<=1`),true,'the menu takes a third of a large window rather than a fixed-width strip');
  await run(`savePreferences({backdropLayout:'overlay'});drawNavigation();`);await wait(400);
  assert.equal(await run(`document.body.dataset.backdropSplit`),'false','switching back leaves one view at a time');
  assert.equal(await run(`$('#radialBackdropDismiss').hidden`),false,'the overlay gets its dismiss target back');
  await run(`dismissDialOverlay();`);win.setSize(960,720);await wait(300);
  await run(`demo=false;acceptPlayback(null);render();`);
  assert.equal(await run(`$('#radialBackdropTitle').textContent`),'Nothing playing');
  assert.equal(await run(`$('#radialBackdropArt').style.backgroundImage`),'none');
  // A loop here asserted the backdrop hides for every non-radial interface. Both of those are paused:
  // see CLAUDE.md. Turning the backdrop off below still covers the same hiding path.
  await run(`savePreferences({interfaceStyle:'radial',nowPlayingBackdrop:false});drawNavigation();`);
  assert.equal(await run(`$('#radialBackdrop').hidden`),true,'optional classic window presentation still works');
  assert.equal(await run(`$('#radial').inert`),false,'ordinary widget navigation remains accessible');
  assert.deepEqual(errors,[],'no renderer crashes');
  console.log('Window views: complete player fade, an artwork-tinted menu glow, dedicated browsing, an adjustable menu timeout, Split View on both edges with its optional divider, idle collapse and narrow-window fallback, song selection, rapid reversals, idle return, focus, responsive controls, and playback passed.');
  app.quit();
}
main().catch(error=>{console.error(error);app.exit(1);});
