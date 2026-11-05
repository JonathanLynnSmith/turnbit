const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-wake-test'));
process.env.TURNBIT_BRIDGE_PORT='4770';require('./widget-profile')(app);require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  try{
    await wait(1000);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
    const post=async event=>{const response=await fetch('http://127.0.0.1:4770/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});assert.equal(response.status,204);await wait(80);};
    const command=command=>post({type:'command',command});
    window.blur();await js(`lastMouseActivity=Date.now()+60000;`);
    await js(`savePreferences({reverseDial:false,nowPlayingOpens:'auto'});`);
    const sleep=async(setup=true)=>{if(setup)await js(`savePreferences({interfaceStyle:'radial',visibility:{mode:'idle',opacity:70,idleOpacity:0,timeout:1}});nav.reset(root());showSetting(row=>row.key==='radialBackground');`);await wait(2200);assert.equal(window.getOpacity(),0);};
    // The first turn while asleep only wakes; the next one moves.
    await sleep();await post({type:'dial',delta:1});assert.ok(window.getOpacity()>.99);assert.equal(await js(`nav.current.selected`),1,'waking keeps the selection');
    await post({type:'dial',delta:1});assert.equal(await js(`nav.current.selected`),2,'the next turn moves');
    await sleep();await command('center-down');await command('center-up');await command('center-click');await wait(400);assert.equal(await js(`nav.current.title`),'Background','a press while asleep only wakes');
    await command('center-down');await command('center-up');await command('center-click');await wait(400);assert.equal(await js(`nav.current.title`),'Smoky Background','the next press selects');
    await sleep();await command('menu-down');await wait(600);await command('menu-up');assert.equal(await js(`nav.current.title`),'Background','Back while asleep only wakes');
    await command('menu-down');await command('menu-up');assert.equal(await js(`nav.current.title`),'Widget','the next Back goes up a level');
    await sleep();await command('toggle');assert.equal(await js(`nav.current.kind`),'now');
    await js(`window.startIndex=index;`);await sleep(false);await command('next-down');await command('next-up');assert.equal(await js(`index!==window.startIndex`),true);
    await sleep(false);await command('previous-down');await command('previous-up');assert.equal(await js(`index===window.startIndex`),true);
    // Hidden Now Playing still pauses on the first Play press.
    await js(`playing=true;showNow();`);await sleep(false);await command('toggle');assert.equal(await js(`playing`),false);
    // Idle navigation and opacity are independent; waking preserves the list.
    await js(`savePreferences({nowPlayingOpens:'manual'});nav.reset(root());showLibrary('songs');`);await wait(200);
    await js(`nav.current.selected=2;drawNavigation();`);await command('select');assert.equal(await js(`nav.current.libraryKind==='songs'&&index===1&&playing`),true);
    await js(`idle.lastActivity=Date.now()-11000;`);await sleep(false);assert.equal(await js(`nav.current.libraryKind`),'songs');
    await post({type:'dial',delta:1});assert.equal(await js(`nav.current.selected`),2);
    // Direct playback mode toggles from menus, including when faded out.
    await js(`savePreferences({nowPlayingOpens:'manual'});nav.reset(root());playing=true;`);await sleep(false);await command('toggle');assert.equal(await js(`nav.current.kind==='list'&&!playing`),true);
    // Now Playing Opens is a real menu action and survives reload.
    await js(`showSettings();showSettingsGroup('general');`);
    await js(`nav.current.selected=nav.current.rows.findIndex(row=>row.action==='now-playing-opens');drawNavigation();`);await command('select');assert.equal(await js(`preferences.nowPlayingOpens`),'auto');
    await js(`nav.reset(root());idle.lastActivity=Date.now()-11000;`);await wait(350);assert.equal(await js(`nav.current.kind`),'now');
    await js(`savePreferences({visibility:{mode:'off',opacity:70,idleOpacity:20,timeout:10},nowPlayingOpens:'manual'});`);
    await js(`showSetting(row=>row.key==='reverseDial');`);await command('select');assert.equal(await js(`preferences.reverseDial`),true);
    await js(`nav.current.selected=3;drawNavigation();`);await post({type:'dial',delta:1});assert.equal(await js(`nav.current.selected`),2);
    await post({type:'dial',delta:-1});assert.equal(await js(`nav.current.selected`),3);
    await js(`showNow();volume=50;volumeControl.reset(50);`);await post({type:'dial',delta:1});assert.equal(await js(`volume`),48);
    window.webContents.reload();await new Promise(resolve=>window.webContents.once('did-finish-load',resolve));await wait(400);
    assert.equal(await js(`preferences.reverseDial`),true);
    assert.equal(await js(`preferences.nowPlayingOpens==='manual'`),true);
    await js(`savePreferences({visibility:{mode:'off',opacity:70,idleOpacity:20,timeout:10}});`);
    console.log('Native wake gestures, Now Playing Opens navigation, hidden playback and preference persistence passed.');app.quit();
  }catch(error){console.error(error);app.exit(1);}
});

