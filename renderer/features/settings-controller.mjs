export function createSettingsController({
  $,
  preferences,
  nav,
  api,
  push,
  drawNavigation,
  render,
  message,
  noteActivity,
  getState,
  mouseModeKeys,
  radialColorName,
  backdropActive,
  backdropLayoutName,
  menuBackgroundName,
  revealDialOverlay,
  visibilityNow,
  valueText,
  WINDOW_MIN_OPACITY,
  savePreferences,
  togglePin,
  toggleWindowMode,
  resetSettings,
  toggleIdlePin,
  syncMouseMode,
  command,
  menuBack,
  openSettings,
}) {
  let knownDisplays = [];
  // Settings answer four questions, in the order most apps use. A setting that
  // only applies to the window or to the widget appears in whichever is in use.
  const settingsGroups = [
    {
      id: 'general',
      label: 'General',
      detail: 'Now Playing, visibility, and startup',
    },
    {
      id: 'playback',
      label: 'Playback',
      detail: 'What plays, and on which device',
    },
    { id: 'controls', label: 'Controls', detail: 'Dial, mouse, and sounds' },
    {
      id: 'appearance',
      label: 'Appearance',
      detail: 'Layout, colors, and background',
    },
  ];
  // What Reset to Defaults can restore. Window and Widget stay separate scopes,
  // so resetting one leaves the other's look alone.
  const resetScopes = [
    ['all', 'Everything', 'Every setting. Your Spotify connection is kept.'],
    ['general', 'General', 'Now Playing, visibility, and startup.'],
    ['playback', 'Playback', 'What Play starts and the preferred device.'],
    ['controls', 'Controls', 'Dial, mouse, and sound settings.'],
    ['appearance', 'Appearance', 'Menu shape, side, colors, and layout.'],
    ['window', 'Window', 'The window menu: its timeout and background.'],
    [
      'widget',
      'Widget',
      'Widget size, position, click through, and background. Returns to the window.',
    ],
  ];
  // One line per setting, shown while it is highlighted. Looked up by the row's
  // key, then its action; a function gets the row when the wording depends on it.
  const HELP = {
    'window-mode':
      'Window is an ordinary window. Widget floats at the edge of your screen.',
    connect: 'Connect or disconnect your Spotify account.',
    'reset-page': 'Put settings back the way they came.',
    'now-playing-opens':
      'Automatically: opens when you press Play, pick a song, or stop browsing. Only When Asked: stays where you are.',
    pin: 'Keeps turnbit above other windows.',
    visibility:
      'Make turnbit see-through all the time, or fade it out when you are not using it.',
    'idle-pin': () =>
      preferences.windowMode
        ? 'Stops the menu closing on its own after the Menu Timeout.'
        : 'Stops the widget fading out and switching to Now Playing while idle.',
    gamingMode:
      'Stops decorative animation while you are not using turnbit, leaving more for games.',
    'start-at-login': 'Opens turnbit when you sign in to your computer.',
    menuTimeout:
      'Seconds without input before the menu closes and Now Playing returns.',
    mousePassthrough:
      'Clicks pass through the widget to whatever is behind it. Use the dial or keyboard to control turnbit.',
    'cold-start': 'What Play starts when Spotify has nothing loaded.',
    'preferred-devices':
      'The device turnbit reconnects to after playback has gone idle.',
    autoLaunchSpotify: 'Starts the Spotify app when no device is available.',
    devices: 'Move what is playing to another Spotify device.',
    volume: 'Change the volume of the current device.',
    reverseDial: 'Swaps which way the dial moves through a list.',
    'double-press':
      'What pressing the dial twice quickly does: go back one level, or go Home.',
    hoverBack:
      'Resting for a second on Back, Now Playing, or Load more runs it. A ring shows the countdown.',
    'mouse-mode-key':
      'Hold this shortcut to use the mouse: scroll to move, click to select, right-click to go back.',
    clicker: 'Plays a soft click as you move through a list.',
    radialCurve: 'Bows the menu along a curve. Off shows a straight list.',
    'radial-side': () =>
      preferences.windowMode
        ? 'Which side of the window the menu opens on.'
        : 'Which edge of the screen the widget sits on.',
    primaryHue: 'Color of text and controls.',
    accentHue: 'Color of the playing song and of controls that are on.',
    nowPlayingBackdrop:
      'Shows the full-window player with large artwork. Off shows only the menu.',
    'backdrop-layout':
      'Overlay covers the player while you browse. Split View puts the menu beside it.',
    'menu-background-page': 'The panel and haze behind the window menu.',
    'menu-background':
      "Matching shares the player's background. Black, Glass, and Cover Color give the menu its own panel.",
    'radial-layout':
      'Which screen the widget is on, and how much of it it takes.',
    'widget-background-page': 'The haze behind the widget.',
    windowBackground: 'How dark the haze behind the menu is. 0% turns it off.',
    radialBackground:
      'How dark the haze behind the widget is. 0% turns it off.',
    windowSmokeHue: 'Color of the haze behind the menu.',
    widgetSmokeHue: 'Color of the haze behind the widget.',
    'radial-display': 'Which screen the widget sits on.',
    radialWidthPct: "How much of the screen's width the widget takes.",
    radialHeight: "How much of the screen's height the widget takes.",
    'radial-vertical':
      'Where the widget sits when it is shorter than the screen.',
    'visibility-mode':
      'Off, Always see-through, or Idle Fade, which fades turnbit out when you stop using it.',
    opacity: 'How solid turnbit is. Lower is more see-through.',
    idleOpacity: 'How solid turnbit is after it fades. 0% hides it completely.',
    timeout: 'Seconds without input before turnbit fades.',
    dialOnlyWake:
      'Play, Next, and Previous work without waking turnbit. Turning or pressing the dial wakes it.',
    'cold-start-mode': (row) =>
      ({
        last: 'Continue what Spotify played last.',
        liked: 'Start your Liked Songs.',
        off: 'Play does nothing until you start something in Spotify.',
      })[row.mode],
    'cold-start-playlists': 'Start a playlist you pick.',
  };
  function withHelp(rows) {
    for (const row of rows) {
      if (row.help) continue;
      const help = HELP[row.key] ?? HELP[row.action];
      const text = typeof help === 'function' ? help(row) : help;
      if (text) row.help = text;
    }
    return rows;
  }
  // Every page this controller opens gets its rows' descriptions.
  const openPage = push;
  push = (page) =>
    openPage(page.rows ? { ...page, rows: withHelp(page.rows) } : page);
  // Start at Login belongs to the operating system; ask once and keep the answer.
  let startAtLogin = null;
  api?.startAtLogin?.().then(
    (value) => {
      startAtLogin = value === true;
    },
    () => {},
  );
  function displayName(id) {
    if (id == null) return 'Automatic';
    const display = knownDisplays.find((item) => item.id === id);
    return display
      ? display.name + (display.primary ? ' (main)' : '')
      : 'Saved display';
  }
  function verticalName() {
    return { top: 'Top', center: 'Center', bottom: 'Bottom' }[
      preferences.radialVertical
    ];
  }
  function layoutRows() {
    return [
      {
        label: 'Display',
        action: 'radial-display',
        detail: displayName(preferences.radialDisplay),
      },
      {
        label: 'Width',
        action: 'radial-size',
        key: 'radialWidthPct',
        detail: valueText('radialWidthPct', preferences.radialWidthPct),
        branch: true,
        showDetail: true,
      },
      {
        label: 'Height',
        action: 'radial-size',
        key: 'radialHeight',
        detail: valueText('radialHeight', preferences.radialHeight),
        branch: true,
        showDetail: true,
      },
      {
        label: 'Vertical Position',
        action: 'radial-vertical',
        detail: verticalName(),
      },
    ];
  }
  async function showLayout() {
    push({ title: 'Size & Position', rows: layoutRows() });
    const page = nav.current;
    try {
      knownDisplays = await api.displays();
    } catch {
      knownDisplays = [];
    }
    if (nav.current === page) {
      const row = page.rows.find((item) => item.action === 'radial-display');
      if (row) row.detail = displayName(preferences.radialDisplay);
      drawNavigation();
    }
  }
  function radialSettingsRows() {
    return [
      {
        label: 'Curved Menu',
        action: 'playback-preference',
        key: 'radialCurve',
        detail: preferences.radialCurve ? 'On' : 'Off',
      },
      {
        label: preferences.windowMode ? 'Menu Side' : 'Screen Edge',
        action: 'radial-side',
        detail: preferences.radialSide === 'left' ? 'Left' : 'Right',
      },
      {
        label: 'Text Color',
        action: 'radial-color',
        key: 'primaryHue',
        detail: radialColorName(preferences.primaryHue),
        branch: true,
      },
      {
        label: 'Accent Color',
        action: 'radial-color',
        key: 'accentHue',
        detail: radialColorName(preferences.accentHue),
        branch: true,
      },
    ];
  }
  function nowPlayingOpensName() {
    return preferences.nowPlayingOpens === 'manual'
      ? 'Only When Asked'
      : 'Automatically';
  }
  // Window Mode's dial menu background: the panel style, plus the haze over a Matching background.
  function menuBackgroundRows() {
    return [
      ...(backdropActive()
        ? [
            {
              label: 'Style',
              action: 'menu-background',
              detail: menuBackgroundName(),
            },
          ]
        : []),
      ...smokeRows('window'),
    ];
  }
  function showMenuBackground() {
    push({ title: 'Menu Background', rows: menuBackgroundRows() });
  }
  function showWidgetBackground() {
    push({ title: 'Background', rows: smokeRows('widget') });
  }
  // Rows that open one more page of settings, so showSetting can reach what is inside them.
  const subPages = {
    'menu-background-page': {
      rows: menuBackgroundRows,
      show: showMenuBackground,
    },
    'widget-background-page': {
      rows: () => smokeRows('widget'),
      show: showWidgetBackground,
    },
  };
  function smokeRows(mode) {
    const key = mode === 'widget' ? 'radialBackground' : 'windowBackground';
    const colorKey = mode + 'SmokeHue';
    return [
      {
        label: 'Background Darkness',
        action: 'radial-background',
        key,
        detail: preferences[key] ? preferences[key] + '%' : 'Off',
        branch: true,
        showDetail: true,
      },
      {
        label: 'Background Color',
        action: 'radial-color',
        key: colorKey,
        detail: radialColorName(preferences[colorKey]),
        branch: true,
        showDetail: true,
      },
    ];
  }
  function settingsRows(group) {
    return withHelp(groupRows(group));
  }
  function groupRows(group) {
    const toggle = (label, key) => ({
      label,
      action: 'playback-preference',
      key,
      detail: preferences[key] ? 'On' : 'Off',
    });
    const inWindow = preferences.windowMode;
    switch (group) {
      case 'general':
        return [
          {
            label: 'Now Playing Opens',
            action: 'now-playing-opens',
            detail: nowPlayingOpensName(),
          },
          {
            label: 'Keep on Top',
            action: 'pin',
            detail: getState().pinned ? 'On' : 'Off',
          },
          {
            label: 'Transparency',
            action: 'visibility',
            detail: transparencyName(),
            branch: true,
            showDetail: true,
          },
          {
            label: inWindow ? 'Keep Menu Open' : 'Stay Visible',
            action: 'idle-pin',
            detail: preferences.idlePinned ? 'On' : 'Off',
          },
          toggle('Pause Animations When Idle', 'gamingMode'),
          ...(startAtLogin === null
            ? []
            : [
                {
                  label: 'Start at Login',
                  action: 'start-at-login',
                  detail: startAtLogin ? 'On' : 'Off',
                },
              ]),
          ...(inWindow
            ? [
                {
                  label: 'Menu Timeout',
                  action: 'menu-timeout',
                  key: 'menuTimeout',
                  detail: valueText('menuTimeout', preferences.menuTimeout),
                  branch: true,
                  showDetail: true,
                },
              ]
            : [toggle('Mouse Click Through', 'mousePassthrough')]),
        ];
      case 'playback':
        // What you set once, then the two things you do now.
        return [
          {
            label: 'What Play Starts',
            action: 'cold-start',
            detail: coldStartName(),
            branch: true,
            showDetail: true,
          },
          {
            label: 'Preferred Device',
            action: 'preferred-devices',
            detail: preferences.preferredDevice?.name || 'Automatic',
            branch: true,
            showDetail: true,
          },
          toggle('Open Spotify Automatically', 'autoLaunchSpotify'),
          { label: 'Playback Device', action: 'devices', branch: true },
          { label: 'Volume', action: 'volume', branch: true },
        ];
      case 'controls':
        return [
          toggle('Reverse Dial Direction', 'reverseDial'),
          {
            label: 'Dial Double-Press',
            action: 'double-press',
            detail: preferences.doublePress === 'home' ? 'Home' : 'Back',
          },
          toggle('Rest to Activate', 'hoverBack'),
          {
            label: 'Mouse Mode Shortcut',
            action: 'mouse-mode-key',
            detail: mouseModeKeys[preferences.mouseModeKey],
          },
          {
            label: 'Click Sounds',
            action: 'clicker',
            detail: preferences.clicker ? 'On' : 'Off',
          },
        ];
      case 'appearance':
        return [
          ...radialSettingsRows(),
          ...(inWindow
            ? [
                toggle('Large Now Playing Screen', 'nowPlayingBackdrop'),
                ...(backdropActive()
                  ? [
                      {
                        label: 'Menu Layout',
                        action: 'backdrop-layout',
                        detail: backdropLayoutName(),
                      },
                    ]
                  : []),
                {
                  label: 'Menu Background',
                  action: 'menu-background-page',
                  branch: true,
                },
              ]
            : [
                {
                  label: 'Size & Position',
                  action: 'radial-layout',
                  branch: true,
                },
                {
                  label: 'Background',
                  action: 'widget-background-page',
                  branch: true,
                },
              ]),
        ];
    }
    return [];
  }
  function transparencyName() {
    return { off: 'Off', always: 'Always', idle: 'Idle Fade' }[
      visibilityNow().mode
    ];
  }
  // Settings opens with the two things that shape everything else, then the
  // categories, then one reset.
  function rootRows() {
    return [
      {
        label: 'Display',
        action: 'window-mode',
        detail: preferences.windowMode ? 'Window' : 'Widget',
      },
      {
        label: 'Spotify Account',
        action: 'connect',
        detail: getState().demo ? 'Not connected' : 'Connected',
        branch: true,
        showDetail: true,
      },
      ...settingsGroups.map((group) => ({
        label: group.label,
        action: 'settings-group',
        group: group.id,
        detail: group.detail,
        branch: true,
      })),
      { label: 'Reset to Defaults', action: 'reset-page', branch: true },
    ];
  }
  function showSettings() {
    const rows = rootRows();
    // Open on the first category, not on the Display switch.
    push({
      title: 'Settings',
      rows,
      selected: rows.findIndex((row) => row.action === 'settings-group'),
    });
  }
  function showResetPage() {
    push({
      title: 'Reset to Defaults',
      rows: resetScopes.map(([group, label, help]) => ({
        label,
        action: 'reset-settings',
        group,
        help,
        branch: true,
      })),
    });
  }
  function showSettingsGroup(id) {
    const group = settingsGroups.find((item) => item.id === id);
    if (group)
      push({ title: group.label, settingsGroup: id, rows: settingsRows(id) });
  }
  function showSetting(match) {
    showSettings();
    const top = nav.current.rows.findIndex(match);
    if (top >= 0) {
      nav.current.selected = top;
      drawNavigation();
      return true;
    }
    const inside = (row) => subPages[row.action]?.rows().some(match);
    const group = settingsGroups.find((item) =>
      settingsRows(item.id).some((row) => match(row) || inside(row)),
    );
    if (!group) return false;
    nav.current.selected = nav.current.rows.findIndex(
      (row) => row.group === group.id,
    );
    drawNavigation();
    showSettingsGroup(group.id);
    const direct = nav.current.rows.findIndex(match);
    if (direct >= 0) nav.current.selected = direct;
    else {
      const parent = nav.current.rows.find(inside);
      nav.current.selected = nav.current.rows.indexOf(parent);
      drawNavigation();
      subPages[parent.action].show();
      nav.current.selected = nav.current.rows.findIndex(match);
    }
    drawNavigation();
    return true;
  }
  function showTransparency() {
    const value = visibilityNow();
    push({
      title: 'Transparency',
      visibilitySettings: true,
      rows: [
        {
          label: 'Mode',
          action: 'visibility-mode',
          detail: { off: 'Off', always: 'Always', idle: 'Idle Fade' }[
            value.mode
          ],
        },
        {
          label: 'Opacity',
          action: 'visibility-adjust',
          key: 'opacity',
          detail: value.opacity + '%',
          branch: true,
          showDetail: true,
        },
        {
          label: 'Idle Opacity',
          action: 'visibility-adjust',
          key: 'idleOpacity',
          detail: value.idleOpacity + '%',
          branch: true,
          showDetail: true,
        },
        {
          label: 'Idle Timeout',
          action: 'visibility-adjust',
          key: 'timeout',
          detail: value.timeout + ' sec',
          branch: true,
          showDetail: true,
        },
        // Dial Only Wake only matters once turnbit can fade out.
        ...(value.mode === 'off'
          ? []
          : [
              {
                label: 'Stay Hidden for Media Buttons',
                action: 'playback-preference',
                key: 'dialOnlyWake',
                detail: preferences.dialOnlyWake ? 'On' : 'Off',
              },
            ]),
      ],
      hint:
        value.mode === 'idle'
          ? 'Solid while active · fades after idle'
          : value.mode === 'always'
            ? preferences.windowMode
              ? `Fixed opacity · stays at least ${WINDOW_MIN_OPACITY}% in Window Mode`
              : 'Fixed opacity · 0% wakes on dial input'
            : 'Select Mode to enable transparency',
    });
  }
  async function showDevices(preferred = false) {
    const { demo } = getState();

    const page = push({
      preferred,
      title: preferred ? 'Preferred Device' : 'Playback Device',
      rows: [{ label: 'Looking for devices…', disabled: true }],
    });
    if (demo) {
      page.rows = [
        { label: 'Connect Spotify', action: 'connect', branch: true },
      ];
      drawNavigation();
      return;
    }
    try {
      const data = await api.devices();
      page.rows = (data.devices || []).map((d) => ({
        label: d.name,
        action: preferred ? 'preferred-device' : 'device',
        device: d,
        disabled: d.is_restricted || !d.id,
        detail: preferred
          ? d.id === preferences.preferredDevice?.id
            ? '✓'
            : ''
          : d.is_active
            ? 'Active'
            : '',
      }));
      if (!page.rows.length)
        page.rows = [{ label: 'Open Spotify, then refresh', disabled: true }];
    } catch (e) {
      page.rows = [];
      if (nav.current === page) message(e.message);
    }
    if (preferred)
      page.rows.unshift({
        label: 'Automatic',
        action: 'preferred-device',
        device: null,
        detail: preferences.preferredDevice ? '' : '✓',
      });
    page.rows.push({ label: 'Refresh devices', action: 'refresh-devices' });
    if (nav.current === page) drawNavigation();
  }
  function coldStartName() {
    return preferences.coldStart === 'playlist'
      ? preferences.coldStartPlaylist?.name || 'Playlist'
      : { last: 'Last Session', liked: 'Liked Songs', off: 'Off' }[
          preferences.coldStart
        ] || 'Last Session';
  }
  function showColdStart() {
    const mark = (mode) => (preferences.coldStart === mode ? '✓' : '');
    push({
      title: 'What Play Starts',
      rows: [
        {
          label: 'Last Session',
          action: 'cold-start-mode',
          mode: 'last',
          detail: mark('last'),
        },
        {
          label: 'Liked Songs',
          action: 'cold-start-mode',
          mode: 'liked',
          detail: mark('liked'),
        },
        {
          label: preferences.coldStartPlaylist?.name || 'Choose Playlist',
          action: 'cold-start-playlists',
          detail: mark('playlist'),
          branch: true,
        },
        {
          label: 'Off',
          action: 'cold-start-mode',
          mode: 'off',
          detail: mark('off'),
        },
      ],
      hint: 'What Play starts when Spotify has nothing loaded',
    });
    nav.current.selected = Math.max(
      0,
      nav.current.rows.findIndex((row) => row.detail === '✓'),
    );
    drawNavigation();
  }
  async function showColdStartPlaylists() {
    const { demo } = getState();

    const page = push({
      title: 'Start Playlist',
      rows: [{ label: 'Loading playlists…', disabled: true }],
    });
    if (demo) {
      page.rows = [
        { label: 'Connect Spotify', action: 'connect', branch: true },
      ];
      drawNavigation();
      return;
    }
    try {
      const data = await api.library.page({ kind: 'playlists', offset: 0 });
      page.rows = (data?.items || [])
        .filter((item) =>
          /^spotify:playlist:[a-zA-Z0-9]{22}$/.test(item?.playbackId || ''),
        )
        .map((item) => ({
          label: item.title || 'Untitled playlist',
          action: 'cold-start-playlist',
          playlist: {
            uri: item.playbackId,
            name: item.title || 'Untitled playlist',
          },
          detail:
            item.playbackId === preferences.coldStartPlaylist?.uri ? '✓' : '',
        }));
      if (!page.rows.length)
        page.rows = [{ label: 'No playlists found', disabled: true }];
    } catch (error) {
      page.rows = [{ label: 'Could not load playlists', disabled: true }];
      if (nav.current === page) message(error.message);
    }
    if (nav.current === page) drawNavigation();
  }
  function refreshColdStartSetting() {
    if (nav.stack.some((page) => page.settingsGroup === 'playback')) {
      while (nav.current.settingsGroup !== 'playback') nav.back();
      const row = nav.current.rows.find((item) => item.action === 'cold-start');
      if (row) row.detail = coldStartName();
    }
    drawNavigation();
  }
  let resetting = false;
  async function select(row) {
    switch (row.action) {
      case 'reset-page':
        showResetPage();
        break;
      case 'reset-settings':
        push({
          title:
            row.group === 'all'
              ? 'Reset All Settings?'
              : `Reset ${resetScopes.find(([group]) => group === row.group)?.[1]}?`,
          visibilitySettings: true,
          rows: [
            { label: 'Cancel', action: 'reset-cancel' },
            {
              label: 'Reset',
              action: 'confirm-reset',
              group: row.group,
              detail: 'Restore default settings',
            },
          ],
        });
        break;
      case 'reset-cancel':
        menuBack();
        break;
      case 'confirm-reset':
        if (resetting) break;
        resetting = true;
        try {
          if (await resetSettings(row.group)) {
            // Leave the confirmation and the scope list; reopen Settings with fresh values.
            while (nav.stack.length > 1 && nav.current.title !== 'Settings')
              nav.back();
            if (nav.current.title === 'Settings') nav.back();
            showSettings();
            revealDialOverlay();
            drawNavigation();
            message('Defaults restored');
          }
        } finally {
          resetting = false;
        }
        break;
      case 'visibility':
        showTransparency();
        break;
      case 'visibility-mode': {
        const modes = ['off', 'always', 'idle'];
        if (
          savePreferences({
            visibility: {
              ...preferences.visibility,
              mode: modes[(modes.indexOf(preferences.visibility.mode) + 1) % 3],
            },
          })
        ) {
          nav.back();
          const summary = nav.current.rows?.find(
            (item) => item.action === 'visibility',
          );
          if (summary) summary.detail = transparencyName();
          showTransparency();
        }
        break;
      }
      case 'radial-layout':
        showLayout();
        break;
      case 'radial-size':
      case 'menu-timeout':
        push({
          title: row.label,
          help: row.help,
          kind: 'visibility',
          visibilitySettings: true,
          key: row.key,
          value: preferences[row.key],
        });
        break;
      case 'radial-vertical':
        if (
          savePreferences({
            radialVertical: { top: 'center', center: 'bottom', bottom: 'top' }[
              preferences.radialVertical
            ],
          })
        ) {
          row.detail = verticalName();
          drawNavigation();
        }
        break;
      case 'radial-display': {
        try {
          knownDisplays = await api.displays();
        } catch {
          knownDisplays = [];
        }
        const ids = [null, ...knownDisplays.map((item) => item.id)],
          next = ids[(ids.indexOf(preferences.radialDisplay) + 1) % ids.length];
        if (savePreferences({ radialDisplay: next })) {
          row.detail = displayName(next);
          drawNavigation();
        }
        break;
      }
      case 'visibility-adjust':
        push({
          title: row.label,
          help: row.help,
          kind: 'visibility',
          visibilitySettings: true,
          key: row.key,
          value: visibilityNow()[row.key],
        });
        break;
      case 'settings':
        showSettings();
        break;
      case 'volume':
        push({ title: 'Volume', kind: 'volume' });
        break;
      case 'connect':
        openSettings();
        break;
      case 'pin':
        await togglePin();
        break;
      case 'start-at-login':
        try {
          startAtLogin = (await api.startAtLogin(!startAtLogin)) === true;
          row.detail = startAtLogin ? 'On' : 'Off';
          drawNavigation();
        } catch (error) {
          message(error.message);
        }
        break;
      case 'window-mode':
        await toggleWindowMode();
        break;
      case 'backdrop-layout':
        if (
          savePreferences({
            backdropLayout:
              preferences.backdropLayout === 'split' ? 'overlay' : 'split',
          })
        ) {
          row.detail = backdropLayoutName();
          revealDialOverlay();
          drawNavigation();
        }
        break;
      case 'menu-background-page':
        showMenuBackground();
        break;
      case 'widget-background-page':
        showWidgetBackground();
        break;
      case 'now-playing-opens':
        if (
          savePreferences({
            nowPlayingOpens:
              preferences.nowPlayingOpens === 'manual' ? 'auto' : 'manual',
          })
        ) {
          row.detail = nowPlayingOpensName();
          noteActivity();
          drawNavigation();
        }
        break;
      case 'menu-background': {
        const backgrounds = window.TurnbitSettings.MENU_BACKGROUNDS;
        if (
          savePreferences({
            menuBackground:
              backgrounds[
                (backgrounds.indexOf(preferences.menuBackground) + 1) %
                  backgrounds.length
              ],
          })
        ) {
          // The menu stays up so the new look shows straight away.
          row.detail = menuBackgroundName();
          revealDialOverlay();
          drawNavigation();
        }
        break;
      }
      case 'idle-pin':
        toggleIdlePin();
        break;
      case 'double-press':
        if (
          savePreferences({
            doublePress: preferences.doublePress === 'home' ? 'back' : 'home',
          })
        ) {
          row.detail = preferences.doublePress === 'home' ? 'Home' : 'Back';
          drawNavigation();
        }
        break;
      case 'settings-group':
        showSettingsGroup(row.group);
        break;
      case 'radial-color':
        push({
          title: row.label,
          help: row.help,
          kind: 'color',
          visibilitySettings: true,
          key: row.key,
          value: preferences[row.key],
        });
        break;
      case 'radial-background':
        push({
          title: row.label,
          help: row.help,
          kind: 'visibility',
          visibilitySettings: true,
          key: row.key,
          value: preferences[row.key],
        });
        break;
      case 'radial-side':
        if (
          savePreferences({
            radialSide: preferences.radialSide === 'left' ? 'right' : 'left',
          })
        ) {
          nav.current.rows.find(
            (item) => item.action === 'radial-side',
          ).detail = preferences.radialSide === 'left' ? 'Left' : 'Right';
          drawNavigation();
        }
        break;
      case 'playback-preference':
        if (savePreferences({ [row.key]: !preferences[row.key] })) {
          row.detail = preferences[row.key] ? 'On' : 'Off';
          noteActivity();
          drawNavigation();
        }
        break;
      case 'mouse-mode-key': {
        const keys = Object.keys(mouseModeKeys),
          next =
            keys[(keys.indexOf(preferences.mouseModeKey) + 1) % keys.length];
        if (savePreferences({ mouseModeKey: next })) {
          row.detail = mouseModeKeys[next];
          drawNavigation();
          syncMouseMode();
        }
        break;
      }
      case 'clicker':
        if (savePreferences({ clicker: !preferences.clicker })) {
          row.detail = preferences.clicker ? 'On' : 'Off';
          drawNavigation();
        }
        break;
      case 'devices':
        await showDevices();
        break;
      case 'cold-start':
        showColdStart();
        break;
      case 'cold-start-mode':
        if (savePreferences({ coldStart: row.mode })) refreshColdStartSetting();
        break;
      case 'cold-start-playlists':
        await showColdStartPlaylists();
        break;
      case 'cold-start-playlist':
        if (
          savePreferences({
            coldStart: 'playlist',
            coldStartPlaylist: row.playlist,
          })
        )
          refreshColdStartSetting();
        break;
      case 'refresh-devices': {
        const preferred = !!nav.current.preferred;
        nav.back();
        await showDevices(preferred);
        break;
      }
      case 'preferred-devices':
        await showDevices(true);
        break;
      case 'preferred-device':
        if (
          savePreferences({
            preferredDevice: row.device
              ? {
                  id: row.device.id,
                  name: row.device.name,
                  type: row.device.type,
                }
              : null,
          })
        ) {
          nav.back();
          const setting = nav.current.rows.find(
            (item) => item.action === 'preferred-devices',
          );
          if (setting)
            setting.detail = preferences.preferredDevice?.name || 'Automatic';
          drawNavigation();
        }
        break;
      case 'device':
        if (
          await command('device', {
            id: row.device.id,
            name: row.device.name,
            type: row.device.type,
          })
        )
          menuBack();
        break;
      default:
        return false;
    }
    return true;
  }
  return {
    displayName,
    verticalName,
    layoutRows,
    showLayout,
    nowPlayingOpensName,
    showMenuBackground,
    showWidgetBackground,
    radialSettingsRows,
    settingsRows,
    showSettings,
    showSettingsGroup,
    showSetting,
    showTransparency,
    showDevices,
    coldStartName,
    showColdStart,
    showColdStartPlaylists,
    refreshColdStartSetting,
    settingsGroups,
    select,
  };
}
