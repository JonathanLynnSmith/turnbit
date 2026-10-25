// Desktop transport only: handlers delegate to application services or native
// window operations. Registration returns cleanup for the host lifecycle.
function spotifyDesktopInstalled(app, platform = process.platform) {
  if (platform !== 'win32' && platform !== 'darwin') return false;
  try {
    return !!app.getApplicationNameForProtocol('spotify://');
  } catch {
    return false;
  }
}

async function openSpotifyExternal(
  url,
  { app, shell, platform = process.platform },
) {
  const parsed = new URL(url);
  if (parsed.origin === 'https://developer.spotify.com')
    return shell.openExternal(parsed.href);

  const content =
    parsed.origin === 'https://open.spotify.com' &&
    !parsed.search &&
    !parsed.hash &&
    (parsed.pathname === '/' ||
      /^\/(track|episode|playlist)\/[A-Za-z0-9]{22}\/?$/.test(parsed.pathname));
  if (!content) throw new Error('Unsupported external link.');

  if (spotifyDesktopInstalled(app, platform)) {
    const match = /^\/(track|episode|playlist)\/([A-Za-z0-9]{22})\/?$/.exec(
      parsed.pathname,
    );
    const spotifyUri = match ? `spotify:${match[1]}:${match[2]}` : 'spotify:';
    try {
      await shell.openExternal(spotifyUri);
      return;
    } catch {
      // A stale handler should still lead to the official desktop installer.
    }
  }
  return shell.openExternal('https://www.spotify.com/download/');
}

function registerDesktopIpc({
  app,
  ipcMain,
  desktop,
  spotify,
  playback,
  library,
  settings,
  hardwareStatus,
  mouseMode,
  shell,
  presentation,
  activity,
  input,
}) {
  const handlers = {
    'spotify:configure': (_, id) => spotify.configure(id),
    'spotify:login': () => spotify.login(),
    'spotify:logout': () => spotify.logout(),
    'spotify:status': () => spotify.status(),
    'spotify:devices': () => spotify.getDevices(),
    'spotify:recovery': (_, value) =>
      settings ? settings.recovery(value) : spotify.configureRecovery(value),
    'library:page': (_, request) => library.page(request),
    'playback:refresh': () => playback.refresh(),
    'playback:state': () => playback.getState(),
    'playback:command': (_, command, value) => playback.command(command, value),
    'app:hardware': hardwareStatus,
    'app:interface': (...args) => desktop.setInterface(...args),
    'app:window-gesture': (...args) => desktop.gesture(...args),
    'app:window-mode': (...args) => desktop.mode(...args),
    'app:displays': () => desktop.displays(),
    'app:visibility': (_, ...args) => desktop.visibility(...args),
    'app:pin': (_, value) => desktop.pin(value),
    'app:mouse-mode': (_, key) => mouseMode.setKey(key),
    'app:minimize': () => desktop.minimize(),
    'app:close': () => desktop.hide(),
    'app:open-external': (_, url) => openSpotifyExternal(url, { app, shell }),
    'app:spotify-installed': () => spotifyDesktopInstalled(app),
  };
  if (settings)
    Object.assign(handlers, {
      'settings:get': () => settings.get(),
      'settings:update': (_, patch) => settings.update(patch),
      'settings:import': (_, legacy) => settings.importLegacy(legacy),
    });
  for (const [channel, handle] of Object.entries(handlers))
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== desktop.window?.webContents)
        throw new Error('Unknown desktop client.');
      return handle(event, ...args);
    });
  const onPresentation = (event, hidden) => {
    if (event.sender === desktop.window?.webContents)
      presentation(hidden === true);
  };
  const onActivity = (event) => {
    if (event.sender === desktop.window?.webContents) activity();
  };
  ipcMain.on('playback:presentation', onPresentation);
  ipcMain.on('app:activity', onActivity);
  const onContext = (event, value) => {
    if (event.sender === desktop.window?.webContents) input?.setContext(value);
  };
  ipcMain.on('input:context', onContext);
  return () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
    ipcMain.removeListener('playback:presentation', onPresentation);
    ipcMain.removeListener('app:activity', onActivity);
    ipcMain.removeListener('input:context', onContext);
  };
}
module.exports = {
  registerDesktopIpc,
  openSpotifyExternal,
  spotifyDesktopInstalled,
};
