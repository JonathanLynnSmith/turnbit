const { app, BrowserWindow, ipcMain, shell, safeStorage, globalShortcut, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
if(process.platform==='win32')app.setAppUserModelId('com.nexez.desktopulanziipod');
const { SpotifyClient } = require('./spotify');
const { createBridge } = require('./bridge');
const { VisibilityControl } = require('./visibility');
const { HardwareWakeGate } = require('./hardware-wake');
const { MediaSession } = require('./media-session');
let mainWindow, spotify, bridge, bridgeError, media;
let visibility,visibilityTimer,wakeGate;
let commandQueue = Promise.resolve();
let activeInterface=null;
const send = (channel, data) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data); };
function createWindow() {
  mainWindow = new BrowserWindow({ icon: path.join(__dirname, '../assets/branding/turnbit.ico'), width: 380, height: 710, minWidth: 360, minHeight: 700, maxWidth: 460, maxHeight: 800, frame: false, transparent: true, backgroundColor: '#00000000', resizable: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  // Running from the repo, the process is electron.exe; tell Windows which icon and command to use when pinned
  if(process.platform==='win32'&&!app.isPackaged)mainWindow.setAppDetails({appId:'com.nexez.desktopulanziipod',appIconPath:path.join(__dirname,'../assets/branding/turnbit.ico'),appIconIndex:0,relaunchCommand:`"${process.execPath}" "${app.getAppPath()}"`,relaunchDisplayName:'TurnBit'});
  let clickThrough=false;
  visibility=new VisibilityControl(value=>{if(mainWindow&&!mainWindow.isDestroyed()){const nextClickThrough=value===0;if(nextClickThrough!==clickThrough){mainWindow.setIgnoreMouseEvents(nextClickThrough);clickThrough=nextClickThrough;}mainWindow.setOpacity(value);}});
  wakeGate=new HardwareWakeGate(visibility);
  clearInterval(visibilityTimer);visibilityTimer=setInterval(()=>visibility?.tick(),1000/120);visibilityTimer.unref();
  mainWindow.on('focus',()=>visibility?.wake());
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
}
function readSession(file) {
  try { const data = JSON.parse(fs.readFileSync(file, 'utf8')); return { clientId: data.clientId, refreshToken: data.encryptedToken && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(data.encryptedToken, 'base64')) : null }; } catch { return {}; }
}
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
ipcMain.handle('spotify:library', (_, kind, id, offset) => spotify.library(kind, id, offset));
ipcMain.handle('spotify:command', (_, command, value) => {
  // Renderer controllers limit volume and seek to one write each. Do not make
  // transport buttons wait behind a slow volume request.
  if(command==='volume'||command==='seek')return spotify.command(command,value);
  const next = commandQueue.then(() => spotify.command(command, value));
  commandQueue = next.catch(() => {}); return next;
});
ipcMain.handle('app:hardware', () => ({ ...bridge?.status(), error: bridgeError }));
ipcMain.handle('app:visibility',(_,value,protectedView)=>visibility?.configure(value,protectedView===true));
ipcMain.on('app:activity',()=>visibility?.wake());
ipcMain.handle('app:pin', (_, pinned) => { mainWindow.setAlwaysOnTop(!!pinned); return mainWindow.isAlwaysOnTop(); });
ipcMain.handle('app:interface',(_,style,side='left')=>{
  if(!['ipod','zune','radial'].includes(style))throw new Error('Unknown interface');
  side=side==='right'?'right':'left';
  if(!mainWindow||`${style}:${side}`===activeInterface)return;
  const previous=activeInterface;activeInterface=`${style}:${side}`;
  if(style==='radial'){const area=screen.getDisplayMatching(mainWindow.getBounds()).bounds;const width=Math.min(1040,area.width),height=area.height;mainWindow.setMinimumSize(320,400);mainWindow.setMaximumSize(1200,Math.max(1000,area.height));mainWindow.setBounds({x:side==='right'?area.x+area.width-width:area.x,y:area.y+Math.round((area.height-height)/2),width,height});return;}
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
ipcMain.handle('app:minimize', () => mainWindow?.minimize());
ipcMain.handle('app:close', () => mainWindow?.close());
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { visibility?.wake(true);mainWindow?.restore(); mainWindow?.focus(); });
  app.whenReady().then(() => {
    const file = path.join(app.getPath('userData'), 'spotify-session.json');
    if (process.platform === 'win32') media = new MediaSession(state => spotify?.localChanged(state));
    spotify = new SpotifyClient(state => send('spotify-state', state), { media, session: readSession(file), persist: data => saveSession(file, data), onAuth: auth => send('spotify-auth', auth) });
    media?.start();
    bridge = createBridge(event => {const action=wakeGate?.handle(event)||'forward';if(action==='forward')send('device-event',event);else if(action==='wake')send('device-event',{type:'wake'});}, Number(process.env.DIALPOD_BRIDGE_PORT || 4765));
    bridge.on('error', error => { bridgeError = `D100H bridge unavailable: ${error.message}`; send('bridge-error', bridgeError); });
    createWindow();
    if(!process.env.DIALPOD_BRIDGE_PORT)globalShortcut.register('Control+Alt+Shift+D',()=>{visibility?.wake(true);mainWindow?.restore();mainWindow?.focus();});
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('will-quit', () => { clearInterval(visibilityTimer);globalShortcut.unregisterAll();spotify?.cancelLogin(); media?.stop(); bridge?.close(); });
}
