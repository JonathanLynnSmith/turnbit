const { app, Menu, Tray, nativeImage } = require('electron');
const path = require('node:path');
// turnbit lives in the Windows system tray and the macOS menu bar instead of the taskbar or Dock.
const branding = path.join(__dirname, '..', 'assets', 'branding');
function trayIcon() {
  // macOS tints "Template" images for light and dark menu bars; Windows uses the full-color icon.
  if (process.platform === 'darwin') { const image = nativeImage.createFromPath(path.join(branding, 'turnbitTrayTemplate.png')); image.setTemplateImage(true); return image; }
  return nativeImage.createFromPath(path.join(branding, 'turnbit.ico'));
}
// Running from the repo starts electron.exe with the app folder, so login items need that path and argument.
function loginOptions() { return app.isPackaged || process.platform !== 'win32' ? {} : { path: process.execPath, args: [app.getAppPath()] }; }
function opensAtLogin() { return app.getLoginItemSettings(loginOptions()).openAtLogin; }
function setOpensAtLogin(openAtLogin) { app.setLoginItemSettings({ ...loginOptions(), openAtLogin }); }

function createTray({ isVisible, show, hide, command, restart, quit }) {
  const tray = new Tray(trayIcon());
  tray.setToolTip('turnbit');
  const refresh = () => tray.setContextMenu(Menu.buildFromTemplate([
    isVisible() ? { label: 'Hide turnbit', click: hide } : { label: 'Show turnbit', click: show },
    { type: 'separator' },
    { label: 'Play / Pause', click: () => command('toggle') },
    { label: 'Next Track', click: () => command('next') },
    { label: 'Previous Track', click: () => command('previous') },
    { type: 'separator' },
    { label: 'Start at Login', type: 'checkbox', checked: opensAtLogin(), click: item => { setOpensAtLogin(item.checked); refresh(); } },
    { type: 'separator' },
    { label: 'Restart turnbit', click: restart },
    { label: 'Quit turnbit', click: quit }
  ]));
  refresh();
  // Windows convention: left click toggles the widget, right click opens the menu. macOS always opens the menu.
  if (process.platform !== 'darwin') tray.on('click', () => (isVisible() ? hide() : show()));
  return { tray, refresh };
}
module.exports = { createTray, opensAtLogin, setOpensAtLogin };
