const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-quiet-play-test'));
process.env.TURNBIT_BRIDGE_PORT='4778';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Play Opens Now Playing applies whenever turnbit is visible; Dial Only Wake only changes Play while turnbit is faded out.
app.whenReady().then(async()=>{try{
  await wait(1200);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
  const post=async event=>{const response=await fetch('http://127.0.0.1:4778/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});assert.equal(response.status,204);await wait(80);};
  // The D100H sends "touch" on key down, then the action.
  const play=async()=>{await post({type:'command',command:'touch'});await post({type:'command',command:'toggle'});};
  const setup=async(dialOnlyWake,playOpensNowPlaying,page='list')=>{await js(`savePreferences({dialOnlyWake:${dialOnlyWake},playOpensNowPlaying:${playOpensNowPlaying},mousePassthrough:false,idleNowPlaying:false,idlePinned:false,interfaceStyle:'radial',visibility:{mode:'idle',opacity:100,idleOpacity:0,timeout:1}});demo=true;playing=true;nav.reset(root());${page==='now'?'showNow();':''}drawNavigation();lastMouseActivity=Date.now()+60000;noteActivity();`);await wait(150);};
  const state=()=>js(`({playing,kind:nav.current.kind,invisible:visibilityState.invisible})`);

  await setup(true,true);await play();
  assert.deepEqual(await state(),{playing:true,kind:'now',invisible:false},'Visible + Play Opens Now Playing: opens Now Playing without pausing');
  await play();assert.equal((await state()).playing,false,'On Now Playing: Play pauses');

  await setup(true,false);await play();
  assert.deepEqual(await state(),{playing:false,kind:'list',invisible:false},'Visible + Play Opens Now Playing off: pauses and stays on the screen');

  await setup(true,true);await wait(1100);const fading=window.getOpacity();assert.ok(fading<1,'fading');
  await play();assert.deepEqual(await state(),{playing:false,kind:'list',invisible:false},'Fading + Dial Only Wake: pauses quietly, no navigation');assert.ok(window.getOpacity()<=fading,'stays faded');
  await wait(800);assert.equal((await state()).invisible,true);
  await play();assert.deepEqual(await state(),{playing:true,kind:'list',invisible:true},'Asleep + Dial Only Wake: plays quietly, stays asleep');assert.equal(window.getOpacity(),0);
  await post({type:'dial',delta:1});assert.equal((await state()).invisible,false,'Dial wakes');

  await setup(false,true);await wait(1900);assert.equal((await state()).invisible,true);
  await play();await wait(200);assert.deepEqual(await state(),{playing:true,kind:'now',invisible:false},'Asleep, Dial Only Wake off: wakes and opens Now Playing without playing or pausing');

  await setup(false,false);await play();
  assert.deepEqual(await state(),{playing:false,kind:'list',invisible:false},'Both off: pauses and stays on the screen');
  console.log('Play follows Play Opens Now Playing while visible, plays quietly while asleep with Dial Only Wake, and the dial wakes.');app.quit();
}catch(error){console.error(error);app.exit(1);}});
