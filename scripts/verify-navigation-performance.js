const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
app.setPath(
  'userData',
  fs.mkdtempSync(path.join(os.tmpdir(), 'turnbit-nav-perf-')),
);
process.env.TURNBIT_BRIDGE_PORT = '4825';
const root = process.env.TURNBIT_PERF_ROOT || path.join(__dirname, '..');
require(path.join(root, 'src/main'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  await app.whenReady();
  let win;
  for (let i = 0; i < 100; i++) {
    win = BrowserWindow.getAllWindows()[0];
    if (win && !win.webContents.isLoading()) break;
    await wait(50);
  }
  const run = (code) => win.webContents.executeJavaScript(code);
  await run(
    `savePreferences({interfaceStyle:'radial',windowMode:false,idleNowPlaying:false,hoverBack:false,mouseModeKey:'off',visibility:{mode:'off',opacity:100,idleOpacity:0,timeout:10}});demo=true;nav.reset(root());drawNavigation();`,
  );
  await wait(300);
  const result = await run(`(async()=>{
    let layouts=0,activities=0;const layoutValues=[];const setInterface=api.setInterface,activity=api.activity;
    api.setInterface=(...args)=>{layouts++;layoutValues.push(args[2]?.width);return setInterface(...args);};
    api.activity=(...args)=>{activities++;return activity(...args);};
    const rows=Array.from({length:1000},(_,i)=>({label:'A long title for song '+i,action:'song',demoIndex:i%3,item:{name:'Song '+i,artist:'Test artist',duration:180000},detail:'3:00'}));
    push({title:'Performance list',rows});
    const samples=[];layouts=0;activities=0;
    for(let i=0;i<40;i++){
      const start=performance.now();rotate(1);samples.push(performance.now()-start);
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    samples.sort((a,b)=>a-b);
    const report={turnMs:{median:samples[20],p95:samples[38],worst:samples[39]},layoutRequests:layouts,activityMessages:activities};
    radial.snapTo(200);nav.current.selected=200;drawNavigation();
    const startFollow=performance.now();rotate(5);
    while(radial.position<204.5&&performance.now()-startFollow<1000)await new Promise(resolve=>requestAnimationFrame(resolve));
    report.dial90PercentMs=performance.now()-startFollow;
    nav.reset(root());nav.current.selected=nav.current.rows.findIndex(row=>row.action==='songs');drawNavigation();
    const selection=selectItem();report.openedSynchronously=nav.current.libraryKind==='songs';await selection;
    preferences.radialWidthPct=40;drawNavigation();layoutValues.length=0;
    push({title:'Width',kind:'visibility',visibilitySettings:true,key:'radialWidthPct',value:45});
    nav.current.value=50;drawNavigation();nav.back();drawNavigation();
    report.layoutPreviewWidths=layoutValues.slice();
    return report;
  })()`);
  console.log(JSON.stringify(result));
  if (!process.env.TURNBIT_PERF_ROOT) {
    assert.equal(
      result.openedSynchronously,
      true,
      'local navigation does not wait for a promise',
    );
    assert.equal(
      result.layoutRequests,
      0,
      'dial turns do not send native layout requests',
    );
    assert.deepEqual(
      result.layoutPreviewWidths,
      [45, 50, 40],
      'size previews and cancellation still reach the native window',
    );
  }
  app.quit();
}
main().catch((error) => {
  console.error(error);
  app.exit(1);
});
