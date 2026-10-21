const path = require('node:path');
const fs = require('node:fs');
const { VisibilityControl } = require('../visibility');
const { HardwareWakeGate } = require('../hardware-wake');
const {
  fitWindow,
  readWindowState,
  writeWindowState,
} = require('../window-state');

function createDesktopWindow({
  electron,
  rootDir,
  appId,
  isQuitting,
  onVisibility,
  onWindowChange,
}) {
  const { app, BrowserWindow, screen } = electron;
  const APP_ID = appId;
  let mainWindow, visibility, visibilityTimer, wakeGate;
  function send(channel, data) {
    if (channel === 'app-visibility') onVisibility(data);
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      !mainWindow.webContents.isDestroyed() &&
      !mainWindow.webContents.isCrashed()
    )
      mainWindow.webContents.send(channel, data);
  }
  // Window Mode: a normal titled, taskbar/dock-visible window instead of the frameless tray widget.
  // Read before the first createWindow() so the initial frame/transparent/skipTaskbar choice is correct from boot.
  let windowMode = false;
  let dockTimer,
    lastDockHide = 0;
  function syncDockVisibility() {
    if (process.platform !== 'darwin') return;
    clearTimeout(dockTimer);
    if (windowMode) {
      app.dock
        ?.show()
        .then(() => {
          if (!windowMode) syncDockVisibility();
        })
        .catch((error) =>
          console.warn('Could not show Dock icon:', error.message),
        );
      return;
    }
    if (!app.dock?.isVisible()) return;
    // Electron ignores repeated hide() calls within one second. Window activation
    // can also restore the icon, so recheck after the replacement window is shown.
    const delay = 1100 - (Date.now() - lastDockHide);
    if (delay > 0) {
      dockTimer = setTimeout(syncDockVisibility, delay);
      dockTimer.unref();
      return;
    }
    lastDockHide = Date.now();
    app.dock.hide();
  }
  function windowModeFile() {
    return path.join(app.getPath('userData'), 'window-mode.json');
  }
  let windowState = { enabled: false, bounds: {} },
    placementTimer,
    windowModeSwitching = false;
  function rememberWindow() {
    clearTimeout(placementTimer);
    if (
      !windowMode ||
      !activeInterface ||
      !mainWindow ||
      mainWindow.isDestroyed() ||
      mainWindow.isMinimized()
    )
      return;
    windowState.bounds[activeInterface.split(':')[0]] =
      mainWindow.getNormalBounds();
    try {
      writeWindowState(windowModeFile(), windowState);
    } catch (error) {
      console.warn('Could not save window placement:', error.message);
    }
  }
  function restoreWindow(style) {
    const saved = windowState.bounds[style];
    const area = screen.getDisplayMatching(
      saved || mainWindow.getBounds(),
    ).workArea;
    const width = style === 'radial' ? 960 : 380,
      height = 720;
    const bounds = saved || {
      x: area.x + (area.width - width) / 2,
      y: area.y + (area.height - height) / 2,
      width,
      height,
    };
    const target = fitWindow(bounds, area);
    mainWindow.setBounds(target);
    // At fractional display scaling, Windows rounds a framed window's size up, so the
    // window would grow a few pixels every time Window Mode recreates it. Correct once.
    const actual = mainWindow.getBounds();
    if (actual.width !== target.width || actual.height !== target.height)
      mainWindow.setBounds({
        ...target,
        width: 2 * target.width - actual.width,
        height: 2 * target.height - actual.height,
      });
  }
  let mousePassthrough = false,
    mouseIgnored = false,
    mouseFocusable = true;
  // Window Mode keeps the mouse live no matter what. The title bar buttons (minimize, full screen,
  // close) and the resize edges are the only way to manage a normal window, so neither Mouse Click
  // Through nor a fully faded window may swallow clicks there. The widget has the tray and the D100H
  // to fall back on, so it can still go click-through.
  function syncMousePassthrough() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const ignore =
      !windowMode && (mousePassthrough || visibility?.opacity === 0);
    const focusable = windowMode || !mousePassthrough;
    if (ignore !== mouseIgnored) {
      mainWindow.setIgnoreMouseEvents(ignore);
      mouseIgnored = ignore;
    }
    if (focusable !== mouseFocusable) {
      mouseFocusable = focusable;
      mainWindow.setFocusable(focusable);
    }
  }

  let activeInterface = null;
  let windowGesture = null,
    gestureTimer;
  function finishWindowGesture(cancel = false) {
    clearInterval(gestureTimer);
    gestureTimer = null;
    if (!windowGesture) return;
    if (cancel && !mainWindow.isDestroyed())
      mainWindow.setBounds(windowGesture.bounds);
    else if (!mainWindow.isDestroyed()) {
      try {
        fs.writeFileSync(
          path.join(app.getPath('userData'), 'floating-placement.json'),
          JSON.stringify({
            key: activeInterface,
            bounds: mainWindow.getBounds(),
          }),
        );
      } catch {}
    }
    windowGesture = null;
  }

  function windowGestureEvent(event, phase, kind) {
    if (
      windowMode ||
      event.sender !== mainWindow?.webContents ||
      !activeInterface?.startsWith('radial:')
    )
      return;
    if (phase === 'end' || phase === 'cancel') {
      finishWindowGesture(phase === 'cancel');
      return;
    }
    if (phase !== 'start' || !['move', 'resize'].includes(kind)) return;
    finishWindowGesture();
    const bounds = mainWindow.getBounds(),
      origin = screen.getCursorScreenPoint(),
      area = screen.getDisplayMatching(bounds).workArea;
    windowGesture = { bounds, origin, kind };
    gestureTimer = setInterval(() => {
      if (!windowGesture || mainWindow.isDestroyed()) {
        clearInterval(gestureTimer);
        return;
      }
      const point = screen.getCursorScreenPoint(),
        dx = point.x - origin.x,
        dy = point.y - origin.y;
      if (kind === 'move') {
        const target = screen.getDisplayNearestPoint(point).workArea;
        mainWindow.setPosition(
          Math.round(
            Math.max(
              target.x - bounds.width + 80,
              Math.min(target.x + target.width - 80, bounds.x + dx),
            ),
          ),
          Math.round(
            Math.max(
              target.y,
              Math.min(target.y + target.height - 48, bounds.y + dy),
            ),
          ),
        );
      } else {
        const right = activeInterface.startsWith('radial:right:'),
          horizontal = right ? -dx : dx;
        const delta =
          (horizontal * bounds.width + dy * bounds.height) /
          (bounds.width * bounds.width + bounds.height * bounds.height);
        const min = Math.max(400 / bounds.width, 300 / bounds.height),
          max = Math.max(
            min,
            Math.min(area.width / bounds.width, area.height / bounds.height),
          );
        const scale = Math.max(min, Math.min(max, 1 + delta)),
          width = Math.round(bounds.width * scale),
          height = Math.round(bounds.height * scale);
        const x = right ? bounds.x + bounds.width - width : bounds.x;
        mainWindow.setBounds({
          x: Math.max(area.x, Math.min(area.x + area.width - width, x)),
          y: Math.max(
            area.y,
            Math.min(area.y + area.height - height, bounds.y),
          ),
          width,
          height,
        });
      }
    }, 16);
    gestureTimer.unref();
    return bounds;
  }

  function scheduleVisibility() {
    clearTimeout(visibilityTimer);
    const delay = visibility?.nextDelay();
    if (delay == null) return;
    visibilityTimer = setTimeout(
      () => {
        visibility?.tick();
        scheduleVisibility();
      },
      Math.max(1, delay),
    );
    visibilityTimer.unref();
  }
  function wakeVisibility(force = false) {
    visibility?.wake(force);
    scheduleVisibility();
  }
  function createWindow(bounds) {
    // Widget mode: frameless/transparent, tray-only. Window Mode: a normal titled, taskbar/dock-visible window.
    const chrome = windowMode
      ? {
          frame: true,
          transparent: false,
          backgroundColor: '#15171a',
          skipTaskbar: false,
        }
      : {
          frame: false,
          transparent: true,
          backgroundColor: '#00000000',
          skipTaskbar: true,
        };
    mouseIgnored = false;
    mouseFocusable = true;
    mainWindow = new BrowserWindow({
      show: false,
      icon: path.join(rootDir, 'assets/branding/turnbit.ico'),
      ...(bounds || { width: 380, height: 710 }),
      minWidth: 360,
      minHeight: 320,
      ...chrome,
      resizable: true,
      webPreferences: {
        preload: path.join(rootDir, 'src/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    syncDockVisibility();
    // macOS ties a window to the Space it was born on. A desk widget belongs on every Space and
    // over fullscreen apps; a Window Mode window is an ordinary window and stays where it is put.
    if (process.platform === 'darwin' && !windowMode)
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Running from the repo, the process is electron.exe; tell Windows which icon and command to use when pinned
    if (process.platform === 'win32' && !app.isPackaged)
      mainWindow.setAppDetails({
        appId: APP_ID,
        appIconPath: path.join(rootDir, 'assets/branding/turnbit.ico'),
        appIconIndex: 0,
        relaunchCommand: `"${process.execPath}" "${app.getAppPath()}"`,
        relaunchDisplayName: 'turnbit',
      });
    let invisible = false;
    visibility = new VisibilityControl((value) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const nextInvisible = value === 0;
        if (nextInvisible !== invisible) {
          invisible = nextInvisible;
          send('app-visibility', { invisible });
        }
        syncMousePassthrough();
        mainWindow.setOpacity(value);
      }
    });
    wakeGate = new HardwareWakeGate(visibility);
    scheduleVisibility();
    mainWindow.on('focus', () => wakeVisibility());
    for (const event of ['move', 'resize'])
      mainWindow.on(event, () => {
        clearTimeout(placementTimer);
        placementTimer = setTimeout(rememberWindow, 250);
        placementTimer.unref();
      });
    mainWindow.on('blur', () => finishWindowGesture());
    mainWindow.on('minimize', () =>
      send('app-visibility', { minimized: true }),
    );
    mainWindow.on('restore', () =>
      send('app-visibility', { minimized: false }),
    );
    // Hidden in the tray counts as minimized, so rendering and polling slow down. Closing hides instead of quitting.
    mainWindow.on('hide', () => {
      send('app-visibility', { minimized: true });
      onWindowChange();
    });
    mainWindow.on('show', () => {
      send('app-visibility', { minimized: false });
      onWindowChange();
      syncDockVisibility();
    });
    mainWindow.on('close', (event) => {
      if (!isQuitting()) {
        event.preventDefault();
        hideWindow();
      }
    });
    // Stay hidden until the renderer applies its interface, so the default turnbit layout does not flash at the compact size first.
    mainWindow.once('ready-to-show', () => {
      const fallback = setTimeout(revealWindow, 1500);
      fallback.unref();
    });
    mainWindow.loadFile(path.join(rootDir, 'renderer/index.html'));
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event) =>
      event.preventDefault(),
    );
  }
  // Switching Widget Mode <-> Window Mode changes frame/transparent/skipTaskbar, which Electron
  // cannot change on a live window, so the window is destroyed and recreated. spotify/bridge/tray/
  // mouseMode live outside mainWindow and are untouched, so playback state carries over for free.
  function recreateWindow(nextWindowMode) {
    finishWindowGesture();
    rememberWindow();
    clearTimeout(visibilityTimer);
    const bounds =
      mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null;
    const wasVisible = mainWindow?.isVisible() ?? true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    windowMode = nextWindowMode;
    activeInterface = null;
    revealed = !wasVisible;
    onVisibility({
      invisible: false,
      minimized: !wasVisible,
      resetDocument: true,
    });
    createWindow(bounds);
    windowModeSwitching = false;
  }

  function pinWindow(pinned) {
    if (process.platform === 'darwin')
      mainWindow.setAlwaysOnTop(pinned, 'screen-saver');
    else mainWindow.setAlwaysOnTop(pinned);
  }

  function windowModeEvent(event, value) {
    if (value === undefined) return windowMode;
    if (typeof value !== 'boolean')
      throw new Error('Invalid window mode value.');
    if (value === windowMode) return windowMode;
    if (windowModeSwitching || event.sender !== mainWindow?.webContents)
      throw new Error('Window mode is already changing.');
    // Persist before replacing the window; a failed write leaves the current mode usable.
    writeWindowState(windowModeFile(), { ...windowState, enabled: value });
    windowState.enabled = value;
    windowModeSwitching = true;
    setImmediate(() => recreateWindow(value));
    return value;
  }

  // Only the first reveal at startup; later interface updates must not pull turnbit back out of the tray.
  let revealed = false;
  function revealWindow() {
    if (revealed || !mainWindow || mainWindow.isDestroyed()) return;
    revealed = true;
    if (!mainWindow.isVisible()) mainWindow.show();
  }
  // Size & Position for the turnbit interface: display (Automatic keeps the current screen), width and height as
  // shares of the screen, and vertical position. Width never drops below 400 px so the menu and its fade fit.
  // Invalid values fall back to the defaults.
  function radialLayout(layout = {}) {
    const number = (value, fallback, min, max) =>
      Number.isFinite(Number(value))
        ? Math.max(min, Math.min(max, Math.round(Number(value))))
        : fallback;
    return {
      width: number(layout.width, 35, 15, 70),
      height: number(layout.height, 100, 30, 100),
      vertical: ['top', 'center', 'bottom'].includes(layout.vertical)
        ? layout.vertical
        : 'center',
      display: layout.display == null ? null : String(layout.display),
    };
  }

  function displays() {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((display, i) => ({
      id: String(display.id),
      name: display.label || `Display ${i + 1}`,
      primary: display.id === primary,
      width: display.bounds.width,
      height: display.bounds.height,
    }));
  }

  function setInterface(_, style, side = 'left', layout) {
    setImmediate(revealWindow);
    if (style !== 'radial') throw new Error('Unknown interface');
    side = side === 'right' ? 'right' : 'left';
    const size = style === 'radial' ? radialLayout(layout) : null,
      key = `${style}:${side}${size ? ':' + JSON.stringify(size) : ''}`;
    if (!mainWindow || key === activeInterface) return;
    const previous = activeInterface;
    if (windowMode && previous?.split(':')[0] !== style) rememberWindow();
    activeInterface = key;
    finishWindowGesture(true);
    if (style === 'radial') {
      const display =
          screen
            .getAllDisplays()
            .find((item) => String(item.id) === size.display) ||
          screen.getDisplayMatching(mainWindow.getBounds()),
        area = display.bounds;
      const width = Math.min(
          area.width,
          Math.max(400, Math.round((area.width * size.width) / 100)),
        ),
        height = Math.round((area.height * size.height) / 100);
      mainWindow.setMinimumSize(windowMode ? 400 : 320, windowMode ? 520 : 240);
      mainWindow.setMaximumSize(
        Math.max(1200, area.width),
        Math.max(1000, area.height),
      );
      if (windowMode) {
        // A titled window: native move/resize via the title bar and edges, no forced edge-docking.
        mainWindow.setResizable(true);
        if (!previous?.startsWith('radial:')) restoreWindow(style);
        return;
      }
      mainWindow.setResizable(false);
      const y =
        area.y +
        (size.vertical === 'top'
          ? 0
          : size.vertical === 'bottom'
            ? area.height - height
            : Math.round((area.height - height) / 2));
      mainWindow.setBounds({
        x: side === 'right' ? area.x + area.width - width : area.x,
        y,
        width,
        height,
      });
      // Display scaling can round the window a pixel wider than asked; keep a right-docked window flush with the edge.
      if (side === 'right') {
        const actual = mainWindow.getBounds();
        if (actual.x + actual.width !== area.x + area.width)
          mainWindow.setPosition(area.x + area.width - actual.width, actual.y);
      }
      if (!previous) {
        try {
          const saved = JSON.parse(
              fs.readFileSync(
                path.join(app.getPath('userData'), 'floating-placement.json'),
                'utf8',
              ),
            ),
            b = saved.bounds;
          if (
            saved.key === key &&
            b &&
            ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(b[k])) &&
            b.width >= 400 &&
            b.height >= 300
          ) {
            const work = screen.getDisplayMatching(b).workArea;
            if (b.width <= work.width && b.height <= work.height)
              mainWindow.setBounds({
                ...b,
                x: Math.max(
                  work.x,
                  Math.min(work.x + work.width - b.width, b.x),
                ),
                y: Math.max(
                  work.y,
                  Math.min(work.y + work.height - b.height, b.y),
                ),
              });
          }
        } catch {}
      }
      return;
    }
  }

  function showWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    wakeVisibility(true);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  function hideWindow() {
    finishWindowGesture();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  }

  return {
    initialize() {
      windowState = readWindowState(windowModeFile());
      windowMode = windowState.enabled;
      createWindow();
    },
    get window() {
      return mainWindow;
    },
    get hasWindow() {
      return !!mainWindow && !mainWindow.isDestroyed();
    },
    send,
    show: showWindow,
    hide: hideWindow,
    showInactive() {
      wakeVisibility(true);
      if (!mainWindow.isVisible()) mainWindow.showInactive();
    },
    create: createWindow,
    setInterface,
    displays,
    gesture: windowGestureEvent,
    mode: windowModeEvent,
    pin(value) {
      pinWindow(!!value);
      return mainWindow.isAlwaysOnTop();
    },
    minimize() {
      return windowMode ? mainWindow.minimize() : hideWindow();
    },
    activity: wakeVisibility,
    isIdle: () => visibility?.isIdle() || visibility?.opacity === 0,
    visibility(value, protectedView, dialOnlyWake, ignoreMouse) {
      mousePassthrough = ignoreMouse === true;
      syncMousePassthrough();
      if (wakeGate) wakeGate.dialOnlyWake = dialOnlyWake === true;
      const result = visibility?.configure(value, protectedView === true);
      scheduleVisibility();
      return result;
    },
    hardware(event) {
      const action = wakeGate?.handle(event) || 'forward';
      scheduleVisibility();
      return action;
    },
    beforeQuit() {
      finishWindowGesture();
      rememberWindow();
    },
    dispose() {
      clearTimeout(dockTimer);
      clearTimeout(placementTimer);
      clearTimeout(visibilityTimer);
      clearInterval(gestureTimer);
    },
  };
}
module.exports = { createDesktopWindow };
