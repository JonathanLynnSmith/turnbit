const { app, BrowserWindow, ipcMain, shell, safeStorage, globalShortcut, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
// Must match build.appId in package.json; Windows and macOS use it to recognize turnbit across installs and updates.
const APP_ID='com.turnbit.app';
if(process.platform==='win32')app.setAppUserModelId(APP_ID);
const { SpotifyClient } = require('./spotify');
const { createBridge } = require('./bridge');
const { VisibilityControl } = require('./visibility');
const { HardwareWakeGate } = require('./hardware-wake');
const { MediaSession } = require('./media-session');
const { createTray } = require('./tray');
let mainWindow, spotify, bridge, bridgeError, media, tray, quitting = false;
let visibility,visibilityTimer,wakeGate;
let mousePassthrough=false,mouseIgnored=false,mouseFocusable=true;
function syncMousePassthrough(){
  if(!mainWindow||mainWindow.isDestroyed())return;
  const ignore=mousePassthrough||visibility?.opacity===0;
  if(ignore!==mouseIgnored){mainWindow.setIgnoreMouseEvents(ignore);mouseIgnored=ignore;}
  if(mouseFocusable===mousePassthrough){mouseFocusable=!mousePassthrough;mainWindow.setFocusable(mouseFocusable);}
}
let commandQueue = Promise.resolve();
let activeInterface=null;
const send = (channel, data) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data); };
function scheduleVisibility(){
  clearTimeout(visibilityTimer);const delay=visibility?.nextDelay();
  if(delay==null)return;
  visibilityTimer=setTimeout(()=>{visibility?.tick();scheduleVisibility();},Math.max(1,delay));visibilityTimer.unref();
}
function wakeVisibility(force=false){visibility?.wake(force);scheduleVisibility();}
function createWindow() {
  mainWindow = new BrowserWindow({ show: false, skipTaskbar: true, icon: path.join(__dirname, '../assets/branding/turnbit.ico'), width: 380, height: 710, minWidth: 360, minHeight: 700, maxWidth: 460, maxHeight: 800, frame: false, transparent: true, backgroundColor: '#00000000', resizable: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  // Running from the repo, the process is electron.exe; tell Windows which icon and command to use when pinned
  if(process.platform==='win32'&&!app.isPackaged)mainWindow.setAppDetails({appId:APP_ID,appIconPath:path.join(__dirname,'../assets/branding/turnbit.ico'),appIconIndex:0,relaunchCommand:`"${process.execPath}" "${app.getAppPath()}"`,relaunchDisplayName:'turnbit'});
  let invisible=false;
  visibility=new VisibilityControl(value=>{if(mainWindow&&!mainWindow.isDestroyed()){const nextInvisible=value===0;if(nextInvisible!==invisible){invisible=nextInvisible;send('app-visibility',{invisible});}syncMousePassthrough();mainWindow.setOpacity(value);}});
  wakeGate=new HardwareWakeGate(visibility);
  scheduleVisibility();
  mainWindow.on('focus',()=>wakeVisibility());
  mainWindow.on('minimize',()=>send('app-visibility',{minimized:true}));mainWindow.on('restore',()=>send('app-visibility',{minimized:false}));
  // Hidden in the tray counts as minimized, so rendering and polling slow down. Closing hides instead of quitting.
  mainWindow.on('hide',()=>{send('app-visibility',{minimized:true});tray?.refresh();});mainWindow.on('show',()=>{send('app-visibility',{minimized:false});tray?.refresh();});
  mainWindow.on('close',event=>{if(!quitting){event.preventDefault();hideWindow();}});
  // Stay hidden until the renderer applies its interface, so the default turnbit layout does not flash at the compact size first.
  mainWindow.once('ready-to-show',()=>{const fallback=setTimeout(revealWindow,1500);fallback.unref();});
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
}
function readSession(file) {
  try { const data = JSON.parse(fs.readFileSync(file, 'utf8')); return { clientId: data.clientId, refreshToken: data.encryptedToken && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(data.encryptedToken, 'base64')) : null }; } catch { return {}; }
}
function readCooldowns(file) { try { const data = JSON.parse(fs.readFileSync(file, 'utf8')); return data && typeof data === 'object' ? data : {}; } catch { return {}; } }
function saveCooldowns(file, data) { try { fs.writeFileSync(`${file}.tmp`, JSON.stringify(data)); fs.renameSync(`${file}.tmp`, file); } catch { /* Best effort: a lost file only costs one throttled request. */ } }
function saveSession(file, data) {
  const saved = { clientId: data.clientId, encryptedToken: data.refreshToken && safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(data.refreshToken).toString('base64') : null };
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(saved)); fs.renameSync(`${file}.tmp`, file);
}
ipcMain.handle('spotify:configure', (_, id) => spotify.configure(id));
ipcMain.handle('spotify:login', () => spotify.login());
ipcMain.handle('spotify:logout', () => spotify.logout());
ipcMain.handle('spotify:status', () => spotify.status());
ipcMain.handle('spotify:state', () => spotify.getPlaybackState());
ipcMain.handle('spotify:devices', () => spotify.getDevices());
ipcMain.handle('spotify:recovery',(_,value)=>spotify.configureRecovery(value));
ipcMain.handle('spotify:library', (_, kind, id, offset) => spotify.library(kind, id, offset));
ipcMain.handle('spotify:command', (_, command, value) => {
  // Renderer controllers limit volume and seek to one write each. Do not make
  // transport buttons wait behind a slow volume request.
  if(command==='volume'||command==='seek')return spotify.command(command,value);
  const next = commandQueue.then(() => spotify.command(command, value));
  commandQueue = next.catch(() => {}); return next;
});
ipcMain.handle('app:hardware', () => ({ ...bridge?.status(), error: bridgeError }));
ipcMain.handle('app:visibility',(_,value,protectedView,dialOnlyWake,ignoreMouse)=>{mousePassthrough=ignoreMouse===true;syncMousePassthrough();if(wakeGate)wakeGate.dialOnlyWake=dialOnlyWake===true;const result=visibility?.configure(value,protectedView===true);scheduleVisibility();return result;});
ipcMain.on('app:activity',()=>wakeVisibility());
ipcMain.handle('app:pin', (_, pinned) => { mainWindow.setAlwaysOnTop(!!pinned); return mainWindow.isAlwaysOnTop(); });
// Only the first reveal at startup; later interface updates must not pull turnbit back out of the tray.
let revealed=false;
function revealWindow(){if(revealed||!mainWindow||mainWindow.isDestroyed())return;revealed=true;if(!mainWindow.isVisible())mainWindow.show();}
// Size & Position for the turnbit interface: display (Automatic keeps the current screen), width and height as
// shares of the screen, and vertical position. Width never drops below 400 px so the menu and its fade fit.
// Invalid values fall back to the defaults.
function radialLayout(layout={}){
  const number=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Math.round(Number(value)))):fallback;
  return {width:number(layout.width,35,15,70),height:number(layout.height,100,30,100),vertical:['top','center','bottom'].includes(layout.vertical)?layout.vertical:'center',display:layout.display==null?null:String(layout.display)};
}
ipcMain.handle('app:displays',()=>{const primary=screen.getPrimaryDisplay().id;return screen.getAllDisplays().map((display,i)=>({id:String(display.id),name:display.label||`Display ${i+1}`,primary:display.id===primary,width:display.bounds.width,height:display.bounds.height}));});
ipcMain.handle('app:interface',(_,style,side='left',layout)=>{
  setImmediate(revealWindow);
  if(!['ipod','zune','radial'].includes(style))throw new Error('Unknown interface');
  side=side==='right'?'right':'left';
  const size=style==='radial'?radialLayout(layout):null,key=`${style}:${side}${size?':'+JSON.stringify(size):''}`;
  if(!mainWindow||key===activeInterface)return;
  const previous=activeInterface;activeInterface=key;
  if(style==='radial'){
    const display=screen.getAllDisplays().find(item=>String(item.id)===size.display)||screen.getDisplayMatching(mainWindow.getBounds()),area=display.bounds;
    const width=Math.min(area.width,Math.max(400,Math.round(area.width*size.width/100))),height=Math.round(area.height*size.height/100);
    const y=area.y+(size.vertical==='top'?0:size.vertical==='bottom'?area.height-height:Math.round((area.height-height)/2));
    mainWindow.setMinimumSize(320,240);mainWindow.setMaximumSize(Math.max(1200,area.width),Math.max(1000,area.height));mainWindow.setBounds({x:side==='right'?area.x+area.width-width:area.x,y,width,height});
    // Display scaling can round the window a pixel wider than asked; keep a right-docked window flush with the edge.
    if(side==='right'){const actual=mainWindow.getBounds();if(actual.x+actual.width!==area.x+area.width)mainWindow.setPosition(area.x+area.width-actual.width,actual.y);}
    return;
  }
  mainWindow.setMaximumSize(460,800);
  if(previous?.startsWith('radial:')){mainWindow.setSize(380,710);mainWindow.center();}
  const [width]=mainWindow.getSize();
  mainWindow.setMinimumSize(360,style==='zune'?640:700);
  mainWindow.setSize(width,style==='zune'?Math.max(640,Math.min(800,Math.round((width-24)*1.77+24))):710);
});
ipcMain.handle('app:open-external', (_, url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'developer.spotify.com') throw new Error('Unsupported external link.');
  return shell.openExternal(parsed.href);
});
function showWindow(){if(!mainWindow||mainWindow.isDestroyed())return;wakeVisibility(true);if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}
function hideWindow(){if(mainWindow&&!mainWindow.isDestroyed())mainWindow.hide();}
function trayCommand(command){const next=commandQueue.then(()=>spotify.command(command));commandQueue=next.catch(()=>{});next.catch(error=>send('spotify-state',{error:error.message}));}
// With no taskbar button, minimize and close both tuck turnbit into the tray.
ipcMain.handle('app:minimize', () => hideWindow());
ipcMain.handle('app:close', () => hideWindow());
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showWindow());
  app.on('before-quit', () => { quitting = true; });
  app.whenReady().then(() => {
    const file = path.join(app.getPath('userData'), 'spotify-session.json'), limits = path.join(app.getPath('userData'), 'rate-limits.json');
    if (process.platform === 'win32') media = new MediaSession(state => spotify?.localChanged(state));
    spotify = new SpotifyClient(state => send('spotify-state', state), { media, session: readSession(file), persist: data => saveSession(file, data), cooldowns: readCooldowns(limits), onCooldowns: data => saveCooldowns(limits, data), onAuth: auth => send('spotify-auth', auth) });
    media?.start();
    bridge = createBridge(event => {const action=wakeGate?.handle(event)||'forward';scheduleVisibility();if(action==='forward')send('device-event',event);else if(action==='wake')send('device-event',{type:'wake'});}, Number(process.env.DIALPOD_BRIDGE_PORT || 4765));
    bridge.on('error', error => { bridgeError = `D100H bridge unavailable: ${error.message}`; send('bridge-error', bridgeError); });
    if (process.platform === 'darwin') app.dock?.hide();
    createWindow();
    tray = createTray({ isVisible: () => !!mainWindow?.isVisible(), show: showWindow, hide: hideWindow, command: trayCommand, restart: () => { quitting = true; app.relaunch(); app.quit(); }, quit: () => { quitting = true; app.quit(); } });
    if(!process.env.DIALPOD_BRIDGE_PORT)globalShortcut.register('Control+Alt+Shift+D',()=>showWindow());
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); else showWindow(); });
  });
  // A tray app keeps running with no window; Quit is in the tray menu.
  app.on('window-all-closed', () => { if (quitting) app.quit(); });
  app.on('will-quit', () => { clearTimeout(visibilityTimer);globalShortcut.unregisterAll();spotify?.cancelLogin(); media?.stop(); bridge?.close(); tray?.tray.destroy(); });
}
