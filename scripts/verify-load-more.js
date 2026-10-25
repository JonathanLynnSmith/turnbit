const {app,BrowserWindow}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'turnbit-load-more-test'));
process.env.TURNBIT_BRIDGE_PORT='4798';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Load more is a hover shortcut: turning down onto it and resting loads the next page, landing on the first new song.
app.whenReady().then(async()=>{try{
  await wait(1200);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
  const post=async event=>{const response=await fetch('http://127.0.0.1:4798/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});assert.equal(response.status,204);await wait(60);};
  const turn=delta=>post({type:'dial',delta});
  const click=async()=>{await post({type:'command',command:'center-down'});await post({type:'command',command:'center-up'});await post({type:'command',command:'center-click'});await wait(450);};
  const page=()=>js(`({count:nav.current.rows.length,highlighted:nav.current.rows[nav.current.selected]?.label,selected:nav.current.selected,last:nav.current.rows.at(-1)?.label,hold:document.body.dataset.backHold})`);
  // Demo songs have no second page, so add a Load more row by hand; loading it appends the demo songs again.
  const songs=async(style,prefs='')=>{await js(`savePreferences({interfaceStyle:'${style}',backRow:true,hoverBack:true,idleNowPlaying:false,idlePinned:false,visibility:{mode:'off',opacity:100,idleOpacity:0,timeout:10}${prefs}});demo=true;nav.reset(root());showMusic();showLibrary('songs');`);await wait(300);
    await js(`nav.current.rows.push(moreRow(3));nav.current.selected=nav.current.rows.length-2;drawNavigation();`);await wait(150);};

  for(const style of ['radial']){
    await songs(style);let p=await page();assert.equal(p.last,'Load more');const before=p.count,moreIndex=p.count-1;
    await turn(1);p=await page();assert.equal(p.highlighted,'Load more');assert.equal(p.hold,'true',`${style}: turning onto Load more starts the ring`);
    await turn(1);await turn(1);assert.equal((await page()).hold,'true','extra down-turns keep the ring');
    await wait(1150);p=await page();
    assert.equal(p.count,before-1+3,`${style}: the next page was appended after the previous songs`);assert.notEqual(p.last,'Load more','no further pages');
    assert.equal(p.selected,moreIndex,'highlight lands where Load more was');assert.equal(p.highlighted,'Night Drive','landing on the first new song');assert.notEqual(p.hold,'true');
  }

  await songs('radial');await turn(1);await wait(500);await turn(-1);await wait(900);
  let p=await page();assert.equal(p.last,'Load more','Turning away cancels');assert.notEqual(p.hold,'true');

  await songs('radial',',hoverBack:false');await turn(1);await wait(1300);p=await page();assert.equal(p.last,'Load more','Hover Shortcuts off: no auto load');
  await click();p=await page();assert.notEqual(p.last,'Load more','Pressing Load more still loads');assert.equal(p.highlighted,'Night Drive');
  console.log('Load more: resting on it appends the next page, extra turns keep counting, turning away cancels, and pressing works when Hover Shortcuts is off.');app.quit();
}catch(error){console.error(error);app.exit(1);}});
