const electron = require('electron');
const { app, ipcMain, shell, safeStorage, globalShortcut, powerSaveBlocker } =
  electron;
const path = require('node:path');
const { SpotifyClient } = require('./spotify');
const { createPlaybackService } = require('./app/playback-service');
const { createHardwareInput } = require('./app/hardware-input');
const { createLibraryService } = require('./app/library-service');
const { createSettingsService } = require('./app/settings-service');
const {
  createSpotifyPlaybackProvider,
} = require('./integrations/spotify/playback-provider');
const {
  createSpotifyLibraryProvider,
} = require('./integrations/spotify/library-provider');
const {
  RECOVERY_DEFAULTS,
  normalizeRecoverySettings,
} = require('./integrations/spotify/recovery-settings');
const { createDesktopWindow } = require('./desktop/window');
const { registerDesktopIpc } = require('./desktop/ipc');
const { createSettingsStorage } = require('./desktop/settings-storage');
const { createSessionStorage } = require('./desktop/session-storage');
const { createBridge } = require('./bridge');
const { DisplayWake } = require('./display-wake');
const { MediaSession } = require('./media-session');
const { MacMediaSession } = require('./mac-media-session');
const { createTray } = require('./tray');
const { MouseMode } = require('./mouse-mode');

const APP_ID = 'com.turnbit.app';
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
let desktop,
  spotify,
  playback,
  library,
  settings,
  bridge,
  bridgeError,
  media,
  tray,
  mouseMode,
  displayWake,
  removeIpc,
  input;
let quitting = false;
const presentation = {
  invisible: false,
  minimized: false,
  documentHidden: false,
};
const syncPresentation = () =>
  playback?.setPresentation({
    hidden:
      presentation.invisible ||
      presentation.minimized ||
      presentation.documentHidden,
  });
const send = (channel, data) => desktop?.send(channel, data);

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => desktop?.show());
  app.on('before-quit', () => {
    quitting = true;
    desktop?.beforeQuit();
    displayWake?.release();
  });
  app.whenReady().then(() => {
    const userData = app.getPath('userData');
    const session = createSessionStorage(safeStorage);
    const file = path.join(userData, 'spotify-session.json'),
      limits = path.join(userData, 'rate-limits.json');
    settings = createSettingsService({
      storage: createSettingsStorage(
        path.join(userData, 'application-settings.json'),
      ),
      defaults: RECOVERY_DEFAULTS,
      normalize: normalizeRecoverySettings,
    });
    // The Spotify desktop app's own controls: Windows media sessions, or AppleScript on a Mac.
    const LocalSession =
      process.platform === 'win32'
        ? MediaSession
        : process.platform === 'darwin'
          ? MacMediaSession
          : null;
    if (LocalSession)
      media = new LocalSession((state) => spotify?.localChanged(state));
    spotify = new SpotifyClient(null, {
      media,
      recovery: settings.get(),
      openExternal: (url) => shell.openExternal(url),
      session: session.readSession(file),
      persist: (data) => session.saveSession(file, data),
      cooldowns: session.readCooldowns(limits),
      onCooldowns: (data) => session.saveCooldowns(limits, data),
      onConnected: () => playback?.refresh().catch(() => {}),
      onAuth: (auth) => {
        if (!auth.connected) {
          library?.reset();
          input?.reset();
        }
        playback?.setConnected(auth.connected);
        send('spotify-auth', auth);
      },
    });
    library = createLibraryService(createSpotifyLibraryProvider(spotify));
    playback = createPlaybackService(createSpotifyPlaybackProvider(spotify));
    desktop = createDesktopWindow({
      electron,
      rootDir: path.join(__dirname, '..'),
      appId: APP_ID,
      isQuitting: () => quitting,
      onWindowChange: () => tray?.refresh(),
      onVisibility: (state) => {
        if (state.resetDocument) presentation.documentHidden = false;
        Object.assign(presentation, state);
        syncPresentation();
      },
    });
    settings.subscribe((value) => {
      spotify.configureRecovery(value);
      send('settings-changed', value);
    });
    playback.subscribe((event) => {
      if (event.type === 'state') input?.stateChanged(event.state);
      if (
        event.type === 'device-recovered' &&
        settings.get().preferredDevice?.id !== event.device.id
      )
        settings.update({ preferredDevice: event.device });
      send('playback-event', event);
    });
    input = createHardwareInput({
      playback,
      forward: (event) => send('device-event', event),
      isIdle: desktop.isIdle,
      hasView: () =>
        desktop.hasWindow &&
        !desktop.window.webContents.isCrashed() &&
        !desktop.window.webContents.isLoading(),
      activity: () => {
        desktop.activity();
        playback.noteActivity();
      },
    });
    playback.setConnected(spotify.status().connected);
    media?.start();
    const bridgePort =
      process.env.TURNBIT_BRIDGE_PORT || process.env.DIALPOD_BRIDGE_PORT;
    displayWake = new DisplayWake(powerSaveBlocker);
    bridge = createBridge(
      (event) => {
        displayWake.note(event);
        const action = desktop.hardware(event);
        if (action === 'forward') input.handle(event);
        else if (action === 'wake') send('device-event', { type: 'wake' });
      },
      Number(bridgePort || 4765),
    );
    bridge.on('error', (error) => {
      bridgeError = `D100H bridge unavailable: ${error.message}`;
      send('bridge-error', bridgeError);
    });
    desktop.initialize();
    mouseMode = new MouseMode({
      electron,
      onEvent: (event) => {
        desktop.activity(true);
        send('mouse-mode', event);
      },
      onChange: (active) => {
        if (active) desktop.showInactive();
        send('mouse-mode', { type: 'active', active });
      },
    });
    if (bridgePort) global.turnbitMouseMode = mouseMode;
    removeIpc = registerDesktopIpc({
      ipcMain,
      desktop,
      spotify,
      playback,
      library,
      input,
      settings: {
        ...settings,
        recovery: (value) =>
          Object.keys(value || {}).length
            ? settings.update(value)
            : settings.get(),
      },
      hardwareStatus: () => ({ ...bridge?.status(), error: bridgeError }),
      mouseMode,
      shell,
      presentation: (hidden) => {
        presentation.documentHidden = hidden;
        syncPresentation();
      },
      activity: () => {
        desktop.activity();
        playback.noteActivity();
      },
    });
    tray = createTray({
      isVisible: () => !!desktop.window?.isVisible(),
      show: desktop.show,
      hide: desktop.hide,
      command: (command) => playback.command(command).catch(() => {}),
      restart: () => {
        quitting = true;
        app.relaunch();
        app.quit();
      },
      quit: () => {
        quitting = true;
        app.quit();
      },
    });
    if (!bridgePort)
      globalShortcut.register('Control+Alt+Shift+D', desktop.show);
    app.on('activate', () => {
      if (!desktop.hasWindow) desktop.create();
      else desktop.show();
    });
  });
  app.on('window-all-closed', () => {
    if (quitting) app.quit();
  });
  app.on('will-quit', () => {
    removeIpc?.();
    input?.dispose();
    desktop?.dispose();
    mouseMode?.dispose();
    globalShortcut.unregisterAll();
    playback?.dispose();
    spotify?.cancelLogin();
    media?.stop();
    bridge?.close();
    tray?.tray.destroy();
  });
}
