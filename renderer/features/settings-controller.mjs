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
  themes,
  themeName,
  mouseModeKeys,
  radialColorName,
  backdropActive,
  backdropLayoutName,
  revealDialOverlay,
  visibilityNow,
  valueText,
  WINDOW_MIN_OPACITY,
  savePreferences,
  togglePin,
  toggleWindowMode,
  toggleIdlePin,
  toggleCurrentSongBehavior,
  syncMouseMode,
  command,
  menuBack,
  openSettings,
}) {
  let knownDisplays = [];
  const settingsGroups = [
    { id: 'playback', label: 'Playback', detail: 'Volume and devices' },
    { id: 'appearance', label: 'Appearance', detail: 'Interface and colors' },
    { id: 'navigation', label: 'Navigation', detail: 'Dial and shortcuts' },
    { id: 'now-playing', label: 'Now Playing', detail: 'When it opens' },
    { id: 'window', label: 'Window', detail: 'Visibility and focus' },
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
  function alignName() {
    return { auto: 'Auto', left: 'Left', right: 'Right' }[
      preferences.radialAlign
    ];
  }
  function radialSettingsRows() {
    return [
      {
        label: 'Curved Menu',
        action: 'playback-preference',
        key: 'radialCurve',
        detail: preferences.radialCurve ? 'On' : 'Off',
      },
      { label: 'Text Alignment', action: 'radial-align', detail: alignName() },
      {
        label: preferences.windowMode ? 'Menu Side' : 'Screen Edge',
        action: 'radial-side',
        detail: preferences.radialSide === 'left' ? 'Left' : 'Right',
      },
      {
        label: 'Smoky Background',
        action: 'radial-background',
        detail: preferences.radialBackground
          ? preferences.radialBackground + '%'
          : 'Off',
        branch: true,
        showDetail: true,
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
  function settingsRows(group) {
    const toggle = (label, key) => ({
      label,
      action: 'playback-preference',
      key,
      detail: preferences[key] ? 'On' : 'Off',
    });
    switch (group) {
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
          toggle('Open Spotify Automatically', 'autoLaunchSpotify'),
          {
            label: 'When Nothing Is Playing',
            action: 'cold-start',
            detail: coldStartName(),
            branch: true,
            showDetail: true,
          },
          {
            label: 'Keep Song Position',
            action: 'current-song',
            detail: preferences.keepCurrentSongPosition ? 'On' : 'Off',
          },
          { label: 'Spotify Connection', action: 'connect', branch: true },
        ];
      case 'appearance':
        return [
          {
            label: 'Interface',
            action: 'interface',
            detail: interfaceName(preferences.interfaceStyle),
            branch: true,
          },
          ...(preferences.interfaceStyle === 'radial'
            ? radialSettingsRows()
            : [
                {
                  label: 'Case Color',
                  action: 'case-theme',
                  detail: themeName(preferences.appearance),
                  branch: true,
                },
                {
                  label: 'Screen Theme',
                  action: 'screen-theme',
                  detail: preferences.screenTheme === 'dark' ? 'Dark' : 'Light',
                },
              ]),
        ];
      case 'navigation':
        return [
          toggle('Reverse Dial Direction', 'reverseDial'),
          {
            label: 'Dial Double-Press',
            action: 'double-press',
            detail: preferences.doublePress === 'home' ? 'Home' : 'Back',
          },
          toggle('Back in Lists', 'backRow'),
          toggle('Last Song List on Home', 'homeLastSongList'),
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
      case 'now-playing':
        return [
          toggle('Play Opens Now Playing', 'playOpensNowPlaying'),
          toggle('Open Song in Now Playing', 'songOpensNowPlaying'),
          toggle('Idle to Now Playing', 'idleNowPlaying'),
          toggle('Follow Playing Song', 'idleFollowSong'),
        ];
      case 'window':
        return [
          {
            label: 'Window Mode',
            action: 'window-mode',
            detail: preferences.windowMode ? 'On' : 'Off',
          },
          ...(preferences.windowMode && preferences.interfaceStyle === 'radial'
            ? [toggle('Now Playing Backdrop', 'nowPlayingBackdrop')]
            : []),
          ...(backdropActive()
            ? [
                {
                  label: 'Dial Menu Layout',
                  action: 'backdrop-layout',
                  detail: backdropLayoutName(),
                },
                {
                  label: 'Dial Menu Timeout',
                  action: 'menu-timeout',
                  key: 'menuTimeout',
                  detail: valueText('menuTimeout', preferences.menuTimeout),
                  branch: true,
                  showDetail: true,
                },
                ...(preferences.backdropLayout === 'split'
                  ? [toggle('Dial Menu Divider', 'splitDivider')]
                  : []),
              ]
            : []),
          { label: 'Transparency', action: 'visibility', branch: true },
          ...(preferences.interfaceStyle === 'radial' && !preferences.windowMode
            ? [
                {
                  label: 'Size & Position',
                  action: 'radial-layout',
                  branch: true,
                },
              ]
            : []),
          {
            label: 'Keep on Top',
            action: 'pin',
            detail: getState().pinned ? 'On' : 'Off',
          },
          {
            label: backdropActive() ? 'Pin Dial Menu' : 'Pin Widget',
            action: 'idle-pin',
            detail: preferences.idlePinned ? 'On' : 'Off',
          },
          toggle('Dial Only Wake', 'dialOnlyWake'),
          ...(preferences.windowMode
            ? []
            : [toggle('Mouse Click Through', 'mousePassthrough')]),
          toggle('Gaming Mode', 'gamingMode'),
        ];
    }
    return [];
  }
  function showSettings() {
    push({
      title: 'Settings',
      rows: settingsGroups.map((group) => ({
        label: group.label,
        action: 'settings-group',
        group: group.id,
        detail: group.detail,
        branch: true,
      })),
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
    const group = settingsGroups.find((item) =>
      settingsRows(item.id).some(match),
    );
    if (!group) return false;
    nav.current.selected = nav.current.rows.findIndex(
      (row) => row.group === group.id,
    );
    drawNavigation();
    showSettingsGroup(group.id);
    nav.current.selected = nav.current.rows.findIndex(match);
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
  function showZunePlaybackOptions() {
    push({
      title: 'Playback',
      rows: [
        { label: 'Song list', action: 'song-list', branch: true },
        { label: 'Volume', action: 'volume', branch: true },
        { label: 'Playback device', action: 'devices', branch: true },
        { label: 'Now playing', action: 'back-now', branch: true },
      ],
    });
  }
  function interfaceName(style) {
    return (
      { radial: 'turnbit', ipod: 'iPod', zune: 'Zune' }[style] || 'turnbit'
    );
  }
  function showInterfaces() {
    const styles = ['radial', 'ipod', 'zune'];
    push({
      title: 'Interface',
      rows: styles.map((style) => ({
        label: interfaceName(style),
        action: 'set-interface',
        style,
        detail: preferences.interfaceStyle === style ? '✓' : '',
      })),
      hint: 'Select an interface · Menu to return',
    });
    nav.current.selected = nav.current.rows.findIndex(
      (row) => row.style === preferences.interfaceStyle,
    );
    drawNavigation();
  }
  function showCaseThemes() {
    push({
      title: 'Case Theme',
      rows: themes.map((theme) => ({
        label: theme.name,
        action: 'theme',
        theme: theme.id,
        swatch: theme.color,
        detail: theme.id === preferences.appearance ? '✓' : '',
      })),
      hint: 'Turn to preview · Select to save',
    });
    nav.current.selected = nav.current.rows.findIndex(
      (row) => row.theme === preferences.appearance,
    );
    drawNavigation();
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
      const data = await api.library('playlists');
      page.rows = (data?.items || [])
        .filter((item) =>
          /^spotify:playlist:[a-zA-Z0-9]{22}$/.test(item?.uri || ''),
        )
        .map((item) => ({
          label: item.name || 'Untitled playlist',
          action: 'cold-start-playlist',
          playlist: { uri: item.uri, name: item.name || 'Untitled playlist' },
          detail: item.uri === preferences.coldStartPlaylist?.uri ? '✓' : '',
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
  async function select(row) {
    switch (row.action) {
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
      case 'radial-align':
        if (
          savePreferences({
            radialAlign: { auto: 'left', left: 'right', right: 'auto' }[
              preferences.radialAlign
            ],
          })
        ) {
          row.detail = alignName();
          drawNavigation();
        }
        break;
      case 'settings-group':
        showSettingsGroup(row.group);
        break;
      case 'current-song':
        toggleCurrentSongBehavior();
        break;
      case 'screen-theme':
        if (
          savePreferences({
            screenTheme: preferences.screenTheme === 'light' ? 'dark' : 'light',
          })
        ) {
          row.detail = preferences.screenTheme === 'dark' ? 'Dark' : 'Light';
          drawNavigation();
        }
        break;
      case 'interface':
        showInterfaces();
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
          title: 'Smoky Background',
          kind: 'visibility',
          visibilitySettings: true,
          key: 'radialBackground',
          value: preferences.radialBackground,
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
      case 'set-interface':
        if (savePreferences({ interfaceStyle: row.style })) {
          nav.back();
          if (nav.current.settingsGroup === 'appearance') {
            nav.current.rows = settingsRows('appearance');
            nav.current.selected = nav.current.rows.findIndex(
              (item) => item.action === 'interface',
            );
          }
          drawNavigation();
          render();
        }
        break;
      case 'case-theme':
        showCaseThemes();
        break;
      case 'theme':
        if (savePreferences({ appearance: row.theme })) {
          for (const page of nav.stack) {
            for (const item of page.rows) {
              if (item.action === 'case-theme')
                item.detail = themeName(preferences.appearance);
              if (item.action === 'theme')
                item.detail = item.theme === preferences.appearance ? '✓' : '';
            }
          }
          nav.back();
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
    alignName,
    radialSettingsRows,
    settingsRows,
    showSettings,
    showSettingsGroup,
    showSetting,
    showTransparency,
    showZunePlaybackOptions,
    interfaceName,
    showInterfaces,
    showCaseThemes,
    showDevices,
    coldStartName,
    showColdStart,
    showColdStartPlaylists,
    refreshColdStartSetting,
    settingsGroups,
    select,
  };
}
