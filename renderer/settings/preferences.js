// Preferences own persistence and migration; views apply the resulting values.
(() => {
  const visibilityDefaults = {
    mode: 'off',
    opacity: 70,
    idleOpacity: 20,
    timeout: 10,
  };
  // Dial Menu Background, in the order the setting cycles through them.
  const MENU_BACKGROUNDS = ['match', 'black', 'glass', 'artwork'];
  function cleanVisibility(value = {}) {
    const number = (key, min, max) =>
      Number.isFinite(value[key])
        ? Math.max(min, Math.min(max, Math.round(value[key])))
        : visibilityDefaults[key];
    return {
      mode: ['off', 'always', 'idle'].includes(value.mode) ? value.mode : 'off',
      opacity: number('opacity', 0, 100),
      idleOpacity: number('idleOpacity', 0, 100),
      timeout: number('timeout', 1, 600),
    };
  }
  function cleanLastSongList(value, demoCount) {
    if (value?.kind === 'songs') return { kind: 'songs', name: 'Liked Songs' };
    if (
      value?.kind === 'playlist' &&
      typeof value.playlist?.id === 'string' &&
      /^[A-Za-z0-9-]{1,64}$/.test(value.playlist.id) &&
      typeof value.name === 'string'
    )
      return {
        kind: 'playlist',
        name: value.name.slice(0, 256),
        playlist: {
          id: value.playlist.id,
          name: value.name.slice(0, 256),
          uri: value.playlist.uri,
          demoIndexes: Array.isArray(value.playlist.demoIndexes)
            ? value.playlist.demoIndexes.filter(
                (i) => Number.isInteger(i) && i >= 0 && i < demoCount,
              )
            : undefined,
        },
      };
    return null;
  }

  // Now Playing opens: 'auto' switches to Now Playing on Play, on choosing a song, and after idle;
  // 'manual' only opens it when asked, so browsing stays in the list.
  const NOW_PLAYING_OPENS = ['auto', 'manual'];
  function loadPreferences(storage, { demoCount }) {
    const preferences = {
      lastSongList: null,
      dialOnlyWake: false,
      mousePassthrough: false,
      preferredDevice: null,
      autoLaunchSpotify: true,
      coldStart: 'last',
      coldStartPlaylist: null,
      gamingMode: false,
      idlePinned: false,
      reverseDial: false,
      doublePress: 'back',
      hoverBack: true,
      nowPlayingOpens: 'auto',
      keepOnTop: false,
      radialSide: 'left',
      radialWidthPct: 35,
      radialHeight: 100,
      radialVertical: 'center',
      radialDisplay: null,
      radialCurve: true,
      radialBackground: 24,
      windowBackground: 24,
      widgetSmokeHue: -1,
      windowSmokeHue: -1,
      primaryHue: 360,
      accentHue: 141,
      visibility: { ...visibilityDefaults },
      clicker: false,
      mouseModeKey: 'ctrl-alt-z',
      windowMode: true,
      nowPlayingBackdrop: true,
      backdropLayout: 'overlay',
      menuBackground: 'match',
      menuTimeout: 3,
    };
    try {
      const saved = JSON.parse(
        storage.getItem('turnbit-preferences') ||
          storage.getItem('dialpod-preferences') ||
          '{}',
      );
      for (const key of [
        'mousePassthrough',
        'dialOnlyWake',
        'autoLaunchSpotify',
        'gamingMode',
        'idlePinned',
        'reverseDial',
        'radialCurve',
        'hoverBack',
        'windowMode',
        'nowPlayingBackdrop',
      ])
        if (typeof saved[key] === 'boolean') preferences[key] = saved[key];
      if (NOW_PLAYING_OPENS.includes(saved.nowPlayingOpens))
        preferences.nowPlayingOpens = saved.nowPlayingOpens;
      // Before the single choice, staying in the list meant turning off both Idle to Now Playing
      // and Open Song in Now Playing. Carry that combination over once.
      else if (
        saved.idleNowPlaying === false &&
        saved.songOpensNowPlaying === false
      )
        preferences.nowPlayingOpens = 'manual';
      preferences.lastSongList = cleanLastSongList(
        saved.lastSongList,
        demoCount,
      );
      if (['last', 'liked', 'playlist', 'off'].includes(saved.coldStart))
        preferences.coldStart = saved.coldStart;
      if (
        /^spotify:playlist:[a-zA-Z0-9]{22}$/.test(
          saved.coldStartPlaylist?.uri || '',
        )
      )
        preferences.coldStartPlaylist = {
          uri: saved.coldStartPlaylist.uri,
          name: String(saved.coldStartPlaylist.name || '').slice(0, 256),
        };
      if (
        preferences.coldStart === 'playlist' &&
        !preferences.coldStartPlaylist
      )
        preferences.coldStart = 'last';
      /* Open Spotify Automatically became the default, but savePreferences writes every key, so older installs already hold the old false. Lift it once for settings saved before the cold start source existed; turning it off from here on saves coldStart with it and sticks. */ if (
        !Object.hasOwn(saved, 'coldStart') &&
        saved.autoLaunchSpotify === false
      )
        preferences.autoLaunchSpotify = true;
      if (
        saved.preferredDevice &&
        typeof saved.preferredDevice.id === 'string' &&
        saved.preferredDevice.id.length > 0 &&
        saved.preferredDevice.id.length <= 256 &&
        typeof saved.preferredDevice.name === 'string' &&
        saved.preferredDevice.name.length <= 256
      )
        preferences.preferredDevice = {
          id: saved.preferredDevice.id,
          name: saved.preferredDevice.name,
          type: String(saved.preferredDevice.type || '').slice(0, 64),
        };
      if (['back', 'home'].includes(saved.doublePress))
        preferences.doublePress = saved.doublePress;
      if (typeof saved.keepOnTop === 'boolean')
        preferences.keepOnTop = saved.keepOnTop;
      // Archived interface selections (iPod, Zune) and their case themes are no longer read, so
      // they fall back to the radial interface while every other preference is kept.
      for (const [key, min, max] of [
        ['radialWidthPct', 15, 70],
        ['radialHeight', 30, 100],
      ])
        if (Number.isFinite(saved[key]))
          preferences[key] = Math.max(
            min,
            Math.min(max, Math.round(saved[key])),
          );
      if (['top', 'center', 'bottom'].includes(saved.radialVertical))
        preferences.radialVertical = saved.radialVertical;
      if (
        saved.radialDisplay === null ||
        typeof saved.radialDisplay === 'string'
      )
        preferences.radialDisplay = saved.radialDisplay;
      if (['left', 'right'].includes(saved.radialSide))
        preferences.radialSide = saved.radialSide;
      // Existing installations used one opacity in both modes. Seed each once, then keep them independent.
      for (const key of ['radialBackground', 'windowBackground']) {
        const value = saved[key] ?? saved.radialBackground;
        if (Number.isFinite(value))
          preferences[key] = Math.max(0, Math.min(100, Math.round(value)));
      }
      for (const key of ['widgetSmokeHue', 'windowSmokeHue'])
        if (Number.isFinite(saved[key]))
          preferences[key] = Math.max(
            -1,
            Math.min(360, Math.round(saved[key])),
          );
      for (const key of ['primaryHue', 'accentHue'])
        if (Number.isFinite(saved[key]))
          preferences[key] = Math.max(0, Math.min(360, Math.round(saved[key])));
      if (saved.visibility && typeof saved.visibility === 'object')
        preferences.visibility = cleanVisibility(saved.visibility);
      if (typeof saved.clicker === 'boolean')
        preferences.clicker = saved.clicker;
      if (
        [
          'off',
          'ctrl-alt-z',
          'alt-shift-space',
          'ctrl-alt-space',
          'f13',
        ].includes(saved.mouseModeKey)
      )
        preferences.mouseModeKey = saved.mouseModeKey;
      if (['overlay', 'split'].includes(saved.backdropLayout))
        preferences.backdropLayout = saved.backdropLayout;
      if (MENU_BACKGROUNDS.includes(saved.menuBackground))
        preferences.menuBackground = saved.menuBackground;
      if (Number.isFinite(saved.menuTimeout))
        preferences.menuTimeout = Math.max(
          1,
          Math.min(600, Math.round(saved.menuTimeout)),
        );
    } catch {}
    return preferences;
  }

  // Settings that no longer exist. Their behavior is fixed at the old default, so saved values
  // are dropped the next time preferences are written.
  const RETIRED_KEYS = [
    'appearance',
    'screenTheme',
    'interfaceStyle',
    'backRow',
    'homeLastSongList',
    'idleFollowSong',
    'keepCurrentSongPosition',
    'menuReturnsToSource',
    'splitDivider',
    'radialAlign',
    'idleNowPlaying',
    'songOpensNowPlaying',
    'playOpensNowPlaying',
  ];
  function persistPreferences(storage, current, patch) {
    const next = { ...current, ...patch };
    for (const key of RETIRED_KEYS) delete next[key];
    storage.setItem('turnbit-preferences', JSON.stringify(next));
    storage.removeItem('dialpod-preferences');
    return next;
  }

  // App-wide settings live in General, so Window and Widget only reset what is theirs.
  const RESET_KEYS = {
    general: [
      'nowPlayingOpens',
      'keepOnTop',
      'visibility',
      'dialOnlyWake',
      'idlePinned',
      'gamingMode',
    ],
    playback: [
      'preferredDevice',
      'coldStart',
      'coldStartPlaylist',
      'autoLaunchSpotify',
    ],
    controls: [
      'reverseDial',
      'doublePress',
      'hoverBack',
      'mouseModeKey',
      'clicker',
    ],
    appearance: [
      'radialCurve',
      'radialSide',
      'primaryHue',
      'accentHue',
      'nowPlayingBackdrop',
      'backdropLayout',
    ],
    window: [
      'menuTimeout',
      'menuBackground',
      'windowBackground',
      'windowSmokeHue',
    ],
    widget: [
      'windowMode',
      'radialDisplay',
      'radialWidthPct',
      'radialHeight',
      'radialVertical',
      'mousePassthrough',
      'radialBackground',
      'widgetSmokeHue',
    ],
  };
  function resetPatch(group = 'all') {
    const defaults = loadPreferences({ getItem: () => null }, { demoCount: 0 });
    const keys =
      group === 'all'
        ? [...new Set(Object.values(RESET_KEYS).flat())]
        : RESET_KEYS[group] || [];
    return Object.fromEntries(keys.map((key) => [key, defaults[key]]));
  }

  const settings = {
    loadPreferences,
    resetPatch,
    persistPreferences,
    cleanVisibility,
    cleanLastSongList,
    MENU_BACKGROUNDS,
    NOW_PLAYING_OPENS,
    RETIRED_KEYS,
  };
  if (typeof module !== 'undefined') module.exports = settings;
  else window.TurnbitSettings = settings;
})();
