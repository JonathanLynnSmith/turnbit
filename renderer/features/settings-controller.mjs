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
  // Each category answers one question, in the order most apps use: General (when Now Playing opens
  // and how turnbit sits on the desktop, in either mode), Playback (what plays and where), Controls
  // (how the dial and buttons respond), Appearance (how it looks), then what only Window or Widget has.
  const settingsGroups = [
    {
      id: 'general',
      label: 'General',
      detail: 'Now Playing, transparency, and pinning',
    },
    {
      id: 'playback',
      label: 'Playback',
      detail: 'Spotify, devices, and volume',
    },
    { id: 'controls', label: 'Controls', detail: 'Dial, mouse, and sounds' },
    { id: 'appearance', label: 'Appearance', detail: 'Layout and colors' },
    {
      id: 'window',
      label: 'Window',
      detail: 'Dial menu timeout and background',
    },
    {
      id: 'widget',
      label: 'Widget',
      detail: 'Placement, click through, and background',
    },
  ];
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
        label: 'Smoky Background',
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
  const resetRow = (group) => ({
    label: 'Reset to Defaults',
    action: 'reset-settings',
    group,
    branch: true,
  });
  function settingsRows(group) {
    return [...groupRows(group), resetRow(group)];
  }
  function groupRows(group) {
    const toggle = (label, key) => ({
      label,
      action: 'playback-preference',
      key,
      detail: preferences[key] ? 'On' : 'Off',
    });
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
          { label: 'Transparency', action: 'visibility', branch: true },
          {
            label: preferences.windowMode ? 'Pin Dial Menu' : 'Pin Widget',
            action: 'idle-pin',
            detail: preferences.idlePinned ? 'On' : 'Off',
          },
          toggle('Gaming Mode', 'gamingMode'),
        ];
      case 'playback':
        return [
          { label: 'Volume', action: 'volume', branch: true },
          { label: 'Playback Device', action: 'devices', branch: true },
          {
            label: 'Preferred Device',
            action: 'preferred-devices',
            detail: preferences.preferredDevice?.name || 'Automatic',
            branch: true,
            showDetail: true,
          },
          {
            label: 'When Nothing Is Playing',
            action: 'cold-start',
            detail: coldStartName(),
            branch: true,
            showDetail: true,
          },
          toggle('Open Spotify Automatically', 'autoLaunchSpotify'),
          { label: 'Spotify Account', action: 'connect', branch: true },
        ];
      case 'controls':
        return [
          toggle('Reverse Dial Direction', 'reverseDial'),
          {
            label: 'Dial Double-Press',
            action: 'double-press',
            detail: preferences.doublePress === 'home' ? 'Home' : 'Back',
          },
          toggle('Hover Shortcuts', 'hoverBack'),
          {
            label: 'Mouse Mode Key',
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
          // The window player's own look, only in Window Mode.
          ...(preferences.windowMode
            ? [toggle('Now Playing Backdrop', 'nowPlayingBackdrop')]
            : []),
          ...(backdropActive()
            ? [
                {
                  label: 'Dial Menu Layout',
                  action: 'backdrop-layout',
                  detail: backdropLayoutName(),
                },
              ]
            : []),
        ];
      case 'window':
        return [
          {
            label: 'Dial Menu Timeout',
            action: 'menu-timeout',
            key: 'menuTimeout',
            detail: valueText('menuTimeout', preferences.menuTimeout),
            branch: true,
            showDetail: true,
          },
          {
            label: 'Menu Background',
            action: 'menu-background-page',
            branch: true,
          },
        ];
      case 'widget':
        return [
          {
            label: 'Widget Mode',
            action: 'window-mode',
            detail: preferences.windowMode ? 'Off' : 'On',
          },
          { label: 'Size & Position', action: 'radial-layout', branch: true },
          toggle('Mouse Click Through', 'mousePassthrough'),
          {
            label: 'Background',
            action: 'widget-background-page',
            branch: true,
          },
        ];
    }
    return [];
  }
  function showSettings() {
    push({
      title: 'Settings',
      rows: [
        ...settingsGroups.map((group) => ({
          label: group.label,
          action: 'settings-group',
          group: group.id,
          detail: group.detail,
          branch: true,
        })),
        resetRow('all'),
      ],
      hint: 'Choose a category · Menu to return',
    });
  }
  function showSettingsGroup(id) {
    const group = settingsGroups.find((item) => item.id === id);
    if (group)
      push({ title: group.label, settingsGroup: id, rows: settingsRows(id) });
  }
  function showSetting(match) {
    showSettings();
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
                label: 'Dial Only Wake',
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
              : 'Fixed opacity · 0% wakes on D100H input'
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
      title: 'When Nothing Is Playing',
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
      case 'reset-settings':
        push({
          title:
            row.group === 'all'
              ? 'Reset All Settings?'
              : `Reset ${settingsGroups.find((group) => group.id === row.group)?.label}?`,
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
            nav.back();
            if (row.group === 'all') {
              nav.back();
              showSettings();
            } else {
              const page = nav.current;
              page.rows = settingsRows(row.group);
              page.selected = 0;
            }
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
          kind: 'color',
          visibilitySettings: true,
          key: row.key,
          value: preferences[row.key],
        });
        break;
      case 'radial-background':
        push({
          title: row.label,
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
