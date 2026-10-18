const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-visibility-test'));
process.env.TURNBIT_BRIDGE_PORT='4769';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  try{
    await wait(1000);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
    const ignore=[];const setIgnore=window.setIgnoreMouseEvents.bind(window);window.setIgnoreMouseEvents=(value,options)=>{ignore.push(value);setIgnore(value,options);};
    const post=async event=>{const result=await fetch('http://127.0.0.1:4769/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});assert.equal(result.status,204);await wait(100);};
    const fadeFrames=[];const setOpacity=window.setOpacity.bind(window);window.setOpacity=value=>{fadeFrames.push({time:performance.now(),value});setOpacity(value);};
    window.blur();await js(`savePreferences({visibility:{mode:'idle',opacity:60,idleOpacity:0,timeout:1}});nav.reset(root());drawNavigation();`);
    await wait(1900);assert.ok(fadeFrames.filter(frame=>frame.value>0&&frame.value<1).length>=35,'Fade should have at least 35 intermediate native opacity updates');console.log('Intermediate fade frames:',fadeFrames.filter(frame=>frame.value>0&&frame.value<1).length);assert.equal(window.getOpacity(),0);assert.equal(ignore.at(-1),true);
    await post({type:'heartbeat'});assert.equal(window.getOpacity(),0);
    await post({type:'command',command:'touch'});assert.ok(window.getOpacity()>.99);assert.equal(ignore.at(-1),false);
    await js(`showTransparency();`);await wait(2000);require('node:fs').writeFileSync(path.join(__dirname,'../artifacts/turnbit-transparency-settings.png'),(await window.webContents.capturePage()).toPNG());assert.ok(window.getOpacity()>.99);assert.equal(await js(`nav.current.title==='Transparency'`),true);
    await post({type:'command',command:'menu'});await wait(1900);assert.equal(window.getOpacity(),0);
    await post({type:'dial',delta:1});assert.ok(window.getOpacity()>.99);
    await js(`savePreferences({visibility:{mode:'always',opacity:35,idleOpacity:0,timeout:1}});nav.reset(root());drawNavigation();`);
    await wait(800);assert.ok(Math.abs(window.getOpacity()-.35)<.02);
    await post({type:'command',command:'touch'});assert.ok(Math.abs(window.getOpacity()-.35)<.02);
    window.webContents.reload();await wait(1000);assert.equal(await js(`preferences.visibility.mode==='always' && preferences.visibility.opacity===35`),true);
    await js(`savePreferences({visibility:{mode:'off',opacity:70,idleOpacity:20,timeout:10}});`);await wait(750);assert.ok(window.getOpacity()>.99);
    console.log('Native opacity, invisible click-through, heartbeat immunity, D100H wake, settings protection and persistence passed.');app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
