// Composes the interface: state, navigation, input bindings, and the feature
// factories. bootstrap.mjs loads the classic helper scripts this reads from window.
import { createRadialView } from './features/radial-view.mjs';
import { createPlaybackView } from './features/playback-view.mjs';
import { createLibraryController } from './features/library-controller.mjs';
import { createSettingsController } from './features/settings-controller.mjs';

const $ = (selector) => document.querySelector(selector);
const { INPUT_STEPS } = window.TurnbitInput;
// A copy, because the preload object is frozen and harnesses wrap its methods to count calls.
const api = window.turnbit && { ...window.turnbit };
if (api?.spotifyDesktopInstalled)
  api.spotifyDesktopInstalled().then(
    (installed) => {
      document.body.dataset.spotifyInstalled = String(installed);
      render();
    },
    () => {
      document.body.dataset.spotifyInstalled = 'false';
      render();
    },
  );
const demos = [
  {
    name: 'Night Drive',
    artist: 'turnbit demo',
    album: 'After Hours',
    duration: 214000,
  },
  {
    name: 'A Little Further',
    artist: 'turnbit demo',
    album: 'Click wheel sessions',
    duration: 187000,
  },
  {
    name: 'Sunday Morning',
    artist: 'turnbit demo',
    album: 'Slow days',
    duration: 245000,
  },
];
// Demo songs in the same shape as a provider track, so every view reads one model.
const demoTrack = (i) =>
  demos[i] && {
    id: 'demo:' + i,
    linkedId: null,
    publisher: '',
    title: demos[i].name,
    artists: [demos[i].artist],
    album: {
      title: demos[i].album,
      artwork: demos[i].artwork ? [{ url: demos[i].artwork }] : [],
    },
    durationMs: demos[i].duration,
    local: false,
    kind: 'track',
  };
const currentTrack = () => (demo ? demoTrack(index) : playback?.track) || null;
// What the player shows for the current song, with its empty-state wording.
function trackView() {
  const track = currentTrack();
  return {
    title: track?.title || 'Nothing playing',
    artist: demo
      ? track?.artists?.[0]
      : track?.artists?.join(', ') || 'Open Spotify to start listening',
    album: track?.album?.title || '',
    artwork: track?.album?.artwork?.[0]?.url || '',
  };
}
let lastVisualActivity = Date.now();
const getPlaybackView = () => ({
  demo,
  index,
  playing,
  progress,
  volume,
  playback,
  likeRequests,
  lastVisualActivity,
  demoLikes,
  demoShuffle,
  demoRepeat,
  pinned,
  demoQueue,
  track: trackView(),
});
let demo = true,
  index = 0,
  playing = false,
  progress = 0,
  volume = 50,
  playback = null,
  updated = Date.now(),
  pinned = false;
let demoQueue = [0, 1, 2],
  volumeDeviceId = null;
const cleanLastSongList = (value) =>
  window.TurnbitSettings.cleanLastSongList(value, demos.length);
// Shortcut held for Keyboard & Mouse Mode. F13 suits a mouse side button or macro key mapped to it in the mouse's software.
const mouseModeKeys = {
  off: 'Off',
  'ctrl-alt-z': 'Ctrl+Alt+Z',
  'alt-shift-space': 'Alt+Shift+Space',
  'ctrl-alt-space': 'Ctrl+Alt+Space',
  f13: 'F13',
};
// Window Mode layout limits: the narrowest window Split View will take, the player column at or below
// which artwork stacks above the text, and how far the menu's smoke feathers past the divider. Split
// View starts where its one-third menu and two-thirds player both still have room, so a slimmer window
// falls back to the overlay. Declared up here because the first paint reads them.
const SPLIT_MIN_WIDTH = 960,
  PLAYER_STACK_WIDTH = 640,
  SPLIT_HAZE_SPILL = 96,
  WIDE_MENU_BOW = 340;
const preferences = window.TurnbitSettings.loadPreferences(localStorage, {
  demoCount: demos.length,
});
// Now Playing opens on Play, on choosing a song, and after idle, unless the user asked to stay put.
const nowPlayingAuto = () => preferences.nowPlayingOpens === 'auto';
let audioContext;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function clickSound() {
  if (!preferences.clicker) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
      return;
    }
    const oscillator = audioContext.createOscillator(),
      gain = audioContext.createGain(),
      start = audioContext.currentTime;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(950, start);
    oscillator.frequency.exponentialRampToValueAtTime(350, start + 0.012);
    gain.gain.setValueAtTime(0.035, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.012);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.014);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {}
}
// Home: playback, library, and Settings.
function homeRows() {
  const last = preferences.lastSongList ? [lastSongListRow()] : [];
  return [
    { label: 'Now Playing', action: 'now', icon: 'now', control: true },
    ...last,
    {
      label: 'Liked Songs',
      action: 'songs',
      icon: 'liked-songs',
      branch: true,
    },
    {
      label: 'Playlists',
      action: 'playlists',
      icon: 'playlists',
      branch: true,
    },
    { label: 'Settings', action: 'settings', icon: 'settings', branch: true },
  ];
}
const homeStart = () => 1;
const root = () => ({
  title: 'turnbit',
  rows: homeRows(),
  selected: homeStart(),
});
const nav = new window.WheelNavigation(root());
const idle = new window.IdleNowPlaying(nav);
const dialOverlay = new window.DialOverlay();
let dialRevealPress = false;
let silentHardwareActivity = false;
function noteActivity() {
  if (silentHardwareActivity) return;
  followIdleSong.last = null;
  lastVisualActivity = Date.now();
  idle.noteActivity();
  syncGamingMode();
  api?.activity();
}
// Asleep = faded out by Idle Fade (past its timeout) or fully transparent. Dial Only Wake only changes behavior while asleep.
function widgetAsleep() {
  return (
    visibilityState.invisible ||
    (preferences.visibility.mode === 'idle' &&
      !visibilityProtected() &&
      Date.now() - lastVisualActivity >= preferences.visibility.timeout * 1000)
  );
}
function visibilityProtected() {
  return (
    (preferences.idlePinned && preferences.visibility.mode === 'idle') ||
    !!nav.current.visibilitySettings ||
    $('#settings').open
  );
}
let visibilitySyncKey;
// Window Mode has to stay reachable with the mouse: the title bar buttons and the resize edges are
// the only way to minimize, full screen or close a normal window. So Mouse Click Through applies to
// the floating widget only, and transparency there never fades the frame away completely.
const WINDOW_MIN_OPACITY = 20;
function clickThroughActive() {
  return preferences.mousePassthrough && !preferences.windowMode;
}
function visibilityNow() {
  const value = preferences.visibility;
  if (!preferences.windowMode) return value;
  return {
    ...value,
    opacity: Math.max(WINDOW_MIN_OPACITY, value.opacity),
    idleOpacity: Math.max(WINDOW_MIN_OPACITY, value.idleOpacity),
  };
}
let applicationSettings;
function recoverySettingsNow() {
  return {
    preferredDevice: preferences.preferredDevice,
    autoLaunchSpotify: preferences.autoLaunchSpotify,
    coldStart: {
      mode: preferences.coldStart,
      playlist: preferences.coldStartPlaylist,
    },
  };
}
function syncRecovery(patch = {}) {
  if (!applicationSettings) return;
  const value = {};
  for (const key of ['preferredDevice', 'autoLaunchSpotify'])
    if (Object.hasOwn(patch, key)) value[key] = preferences[key];
  if (
    Object.hasOwn(patch, 'coldStart') ||
    Object.hasOwn(patch, 'coldStartPlaylist')
  )
    value.coldStart = {
      mode: preferences.coldStart,
      playlist: preferences.coldStartPlaylist,
    };
  if (Object.keys(value).length) applicationSettings.save(value);
}

function adoptApplicationSettings(value) {
  const patch = {
    preferredDevice: value.preferredDevice,
    autoLaunchSpotify: value.autoLaunchSpotify,
    coldStart: value.coldStart.mode,
    coldStartPlaylist: value.coldStart.playlist,
  };
  Object.assign(preferences, patch);
  syncRecovery.key = JSON.stringify(value);
  try {
    window.TurnbitSettings.persistPreferences(localStorage, preferences, patch);
  } catch {
    message('Could not update the local settings display.');
  }
  drawNavigation();
  render();
}

function syncVisibility() {
  const settings = visibilityNow(),
    passthrough = clickThroughActive();
  const key = JSON.stringify([
    settings,
    visibilityProtected(),
    preferences.dialOnlyWake,
    passthrough,
  ]);
  if (key === visibilitySyncKey) return;
  visibilitySyncKey = key;
  api
    ?.visibility(
      settings,
      visibilityProtected(),
      preferences.dialOnlyWake,
      passthrough,
    )
    ?.catch((error) => {
      visibilitySyncKey = null;
      message(error.message);
    });
}
const volumeControl = new window.VolumeControl(
  async (value) => {
    if (!demo) await api.playback.command('volume', value);
  },
  {
    interval: 600,
    settle: 1500,
    onValue: (value) => {
      volume = value;
      render();
    },
    onError: (error) => message(error.message),
  },
);
const seekControl = new window.VolumeControl(
  async (value) => {
    if (!demo) await api.playback.command('seek', value);
  },
  {
    max: 86400000,
    interval: 450,
    onValue: (value) => {
      progress = value;
      updated = Date.now();
      render();
    },
    onError: (error) => {
      transportHold.cancel();
      message(error.message);
    },
  },
);
seekControl.reset(0);
function wakeIdle() {
  const restored = idle.wake();
  if (restored) {
    drawNavigation();
    render();
  }
  return restored;
}
const time = (ms) => {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const duration = () => currentTrack()?.durationMs || 0;
function currentProgress() {
  return Math.min(duration(), progress + (playing ? Date.now() - updated : 0));
}
// A dial bridge failure does not fix itself, so say it once rather than on every report.
let shownHardwareError = null;
function hardwareError(text) {
  if (!text || text === shownHardwareError) return;
  shownHardwareError = text;
  message(text);
}
let noticeTimer;
function message(text = '') {
  let notice = $('#actionNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'actionNotice';
    notice.setAttribute('role', 'status');
    notice.hidden = true;
    document.body.append(notice);
  }
  clearTimeout(noticeTimer);
  notice.textContent = text;
  notice.hidden = !text;
  if (text)
    noticeTimer = setTimeout(() => {
      notice.hidden = true;
    }, 5000);
}
// Hover Shortcuts: resting on a shortcut row after turning onto it runs it after a
// short hold. Its icon turns into a ring that fills while it counts (driven by --back-hold, so it survives redraws).
const BACK_HOLD_MS = 1000;
let backHold = null;
function shortcutRow(page) {
  const row = page?.rows[page.selected];
  return row?.control ? row : null;
}
function cancelBackHold() {
  if (!backHold) return;
  cancelAnimationFrame(backHold.frame);
  backHold = null;
  document.body.dataset.backHold = 'false';
  document.documentElement.style.removeProperty('--back-hold');
}
function startBackHold() {
  cancelBackHold();
  const page = nav.current,
    row = shortcutRow(page);
  if (!preferences.hoverBack || !row) return;
  const start = performance.now();
  document.body.dataset.backHold = 'true';
  const step = (now) => {
    if (!backHold) return;
    if (
      nav.current !== page ||
      shortcutRow(page) !== row ||
      $('#settings').open
    ) {
      cancelBackHold();
      return;
    }
    const progress = Math.min(1, (now - start) / BACK_HOLD_MS);
    document.documentElement.style.setProperty(
      '--back-hold',
      progress.toFixed(3),
    );
    if (progress >= 1) {
      cancelBackHold();
      if (row.action === 'nav-back') {
        nav.back();
        drawNavigation();
      } else if (row.action === 'now') showNow();
      else if (row.action === 'more' && !page.loading)
        loadLibrary(page, row.offset);
      return;
    }
    backHold.frame = requestAnimationFrame(step);
  };
  backHold = { frame: requestAnimationFrame(step) };
}
// Keep Home matching homeRows() (Last Song List appearing), with the same item highlighted.
function ensureHomeLayout(page) {
  if (page !== nav.stack[0] || page === nav.idlePage) return;
  const want = homeRows(),
    key = (rows) => rows.map((row) => row.action).join();
  if (key(want) === key(page.rows)) return;
  const was = page.rows[page.selected]?.action;
  page.rows = want;
  const index = want.findIndex((row) => row.action === was);
  page.selected = index >= 0 ? index : homeStart();
}
// Lists below Home start with a Back row, so the dial alone can go back without a Menu button. Inserting it keeps
// the same item highlighted, so entering a list still lands on its first real item.
function ensureBackRow(page) {
  if (
    !page ||
    page.kind !== 'list' ||
    page === nav.stack[0] ||
    page === nav.idlePage
  )
    return;
  if (page.rows[0]?.action !== 'nav-back') {
    page.rows.unshift({
      label: 'Back',
      action: 'nav-back',
      icon: 'back',
      control: true,
    });
    page.selected = Math.min(page.rows.length - 1, page.selected + 1);
    if (page.rows.length < 2 || page.rows[1].disabled)
      page.awaitingFirst = true;
  }
  // Lists that load later (Liked Songs, devices) would otherwise open on Back: highlight the first item when it arrives.
  if (page.awaitingFirst && page.rows.length > 1 && !page.rows[1].disabled) {
    page.awaitingFirst = false;
    if (page.selected === 0) page.selected = 1;
  }
}
function drawNavigation() {
  syncInputContext();
  const page = nav.current;
  ensureBackRow(page);
  ensureHomeLayout(page);
  syncVisibility();
  drawRadial();
}

const radial = new window.RadialCarousel($('#radialLabels'), {
  activate: (i) => {
    nav.current.selected = i;
    drawNavigation();
    selectItem();
  },
  reducedMotion: () => reducedMotion.matches,
  curved: () => preferences.radialCurve,
  // The overlay has the whole window to itself, so its arc spreads wider than the docked widget's.
  bow: () => (wideMenu() ? WIDE_MENU_BOW : 270),
});
const trackTransition = new window.TrackTransition($('#radialNow'), {
  reducedMotion: () => reducedMotion.matches,
});
const visibilityState = { invisible: false, minimized: false };
const radialView = createRadialView({
  $,
  preferences,
  nav,
  api,
  radial,
  trackTransition,
  dialOverlay,
  visibilityState,
  getState: getPlaybackView,
  isCurrentSong: (...args) => isCurrentSong(...args),
  selectPlayingSong: (...args) => selectPlayingSong(...args),
  duration,
  currentProgress,
  time,
  drawNavigation,
  cancelBackHold,
  noteActivity,
  ensureBackRow,
  ensureHomeLayout,
  radialLayoutNow,
  valueText,
  playbackModes,
  SPLIT_MIN_WIDTH,
  PLAYER_STACK_WIDTH,
  SPLIT_HAZE_SPILL,
});
const {
  radialColor,
  radialColorName,
  radialMiniPlayer,
  backdropActive,
  wideMenu,
  backdropLayoutName,
  menuBackgroundName,
  syncPlayerColumn,
  syncDialOverlay,
  revealDialOverlay,
  dismissDialOverlay,
  rewindMenuToSource,
  browseFromPlayer,
  updateBackdropControls,
  drawRadial,
} = radialView;
function playbackModes() {
  return {
    liked: demo ? demoLikes.has(index) : playback?.liked,
    shuffle: demo ? demoShuffle : !!playback?.shuffle,
    repeat: demo ? demoRepeat : playback?.repeat || 'off',
  };
}

const playbackView = createPlaybackView({
  $,
  preferences,
  nav,
  radial,
  visibilityState,
  getState: getPlaybackView,
  duration,
  currentProgress,
  time,
  drawRadial,
  radialMiniPlayer,
  backdropActive,
  playbackModes,
  updateBackdropControls,
});
const { syncGamingMode, renderProgress } = playbackView;
function isCurrentSong(...args) {
  return playbackView.isCurrentSong(...args);
}

function render(...args) {
  syncInputContext();
  return playbackView.render(...args);
}
// A normalized playback snapshot from the backend (src/app/playback-model.js), or null.
function acceptPlayback(state) {
  if (
    playback?.track?.id &&
    state?.track?.id &&
    playback.track.id !== state.track.id
  ) {
    transportHold.cancel();
    seekControl.reset(0);
  }
  const wasLikePending = !!playback?.likedPending;
  playback = state;
  playing = !!state?.playing;
  // Keep cached Liked Songs current when the playing song's like flips (in turnbit or on another device).
  // Only a flip counts: an old liked song reporting liked:true must not jump to the top of the list.
  libraryController.acceptPlayback(state);
  if (state?.likeError) message(state.likeError);
  else if (
    wasLikePending &&
    !state?.likedPending &&
    typeof state?.liked === 'boolean'
  )
    message(
      state.liked
        ? 'Added to Liked Songs · confirmed by Spotify'
        : 'Removed from Liked Songs · confirmed by Spotify',
    );
  if (
    !transportHold.direction &&
    !seekControl.busy &&
    seekControl.pending === null &&
    Date.now() >= seekControl.protectedUntil
  ) {
    // The position was measured at observedAt; a playing song has moved on since.
    const elapsed = state?.playing
      ? Math.max(0, Date.now() - (state.observedAt ?? Date.now()))
      : 0;
    progress = Math.min(
      state?.track?.durationMs || 0,
      (state?.positionMs || 0) + elapsed,
    );
    updated = Date.now();
  }
  const deviceId = state?.device?.id;
  if (deviceId && volumeDeviceId && deviceId !== volumeDeviceId)
    volumeControl.reset(volume);
  if (deviceId) volumeDeviceId = deviceId;
  if (Number.isFinite(state?.device?.volume))
    volumeControl.acceptRemote(state.device.volume);
  followSkippedSong();
  render();
}
function playbackEvent(event) {
  if (event.type === 'state') acceptPlayback(event.state);
  else if (event.type === 'device-recovered') {
    if (preferences.preferredDevice?.id !== event.device.id)
      savePreferences({ preferredDevice: event.device });
  } else if (event.type === 'notice' || event.type === 'error')
    message(event.message);
}
// Backend owns refresh scheduling; screens request a snapshot on connection.
async function refresh() {
  if (demo || !api) return;
  try {
    await api.playback.refresh();
  } catch (e) {
    message(e.message);
  }
}
const demoLikes = new Set();
let likeRequests = 0;
let demoShuffle = false,
  demoRepeat = 'off';
async function command(cmd, value) {
  // While asleep with Dial Only Wake on, media commands act without waking turnbit or changing screens.
  // While visible, Play Opens Now Playing applies as usual.
  const quietPlay = preferences.dialOnlyWake && widgetAsleep();
  if (
    !quietPlay ||
    ![
      'toggle',
      'next',
      'previous',
      'seek',
      'like',
      'shuffle',
      'repeat',
      'volume',
    ].includes(cmd)
  )
    noteActivity();
  if (['next', 'previous'].includes(cmd)) libraryController.expectSkip();
  message();
  if (cmd === 'pin') {
    toggleIdlePin();
    return true;
  }
  if (
    cmd === 'toggle' &&
    !backdropActive() &&
    !quietPlay &&
    nowPlayingAuto() &&
    (nav.current.kind !== 'now' || $('#settings').open)
  ) {
    // From any menu/form, the first Play press only opens the player.
    if ($('#settings').open) $('#settings').close();
    showNow();
    return true;
  }
  if (['next', 'previous', 'play-item', 'device'].includes(cmd)) {
    transportHold.cancel();
    seekControl.reset(0);
  }
  if (demo) {
    if (['like', 'shuffle', 'repeat'].includes(cmd)) {
      if (cmd === 'like') {
        if (demoLikes.has(index)) demoLikes.delete(index);
        else demoLikes.add(index);
      }
      if (cmd === 'shuffle') demoShuffle = !demoShuffle;
      if (cmd === 'repeat')
        demoRepeat = { off: 'all', all: 'one', one: 'off' }[demoRepeat];
      message(
        cmd === 'like'
          ? demoLikes.has(index)
            ? 'Demo: saved to Liked Songs'
            : 'Demo: removed from Liked Songs'
          : cmd === 'shuffle'
            ? 'Shuffle ' + (demoShuffle ? 'on' : 'off')
            : 'Repeat: ' +
              { off: 'off', all: 'all', one: 'one song' }[demoRepeat],
      );
      render();
      return true;
    }
    progress = currentProgress();
    updated = Date.now();
    if (cmd === 'toggle') playing = !playing;
    if (cmd === 'next' || cmd === 'previous') {
      const position = Math.max(0, demoQueue.indexOf(index));
      index =
        demoQueue[
          (position + (cmd === 'next' ? 1 : demoQueue.length - 1)) %
            demoQueue.length
        ];
      progress = 0;
      followSkippedSong();
    }
    if (cmd === 'volume') volume = value;
    if (cmd === 'seek') progress = Math.max(0, Math.min(duration(), value));
    render();
    return true;
  }
  if (cmd === 'device') {
    volumeControl.reset(volume);
    volumeDeviceId = null;
  }
  if (cmd === 'like') {
    likeRequests++;
    message('Updating Liked Songs…');
    render();
  }
  try {
    const result = await api.playback.command(cmd, value);
    if (result?.message) message(result.message);
    return true;
  } catch (e) {
    message(e.message);
    return false;
  } finally {
    if (cmd === 'like') {
      likeRequests--;
      render();
    }
  }
}
function changeVolume(value) {
  noteActivity();
  message();
  volumeControl.set(value);
}
function seek(value) {
  if (!preferences.dialOnlyWake) noteActivity();
  seekControl.set(Math.max(0, Math.min(duration(), value)));
}
function openSettings() {
  wakeIdle();
  if (!$('#settings').open) $('#settings').showModal();
}
// Dial Double-Press set to Home: straight to Home from anywhere (closing the settings form first if it is open).
function dialHome() {
  noteActivity();
  revealDialOverlay();

  clickSound();
  if ($('#settings').open) {
    $('#settings').close();
    return;
  }
  nav.goHome();
  drawNavigation();
  message();
}
function menuBack() {
  noteActivity();
  if (backdropActive() && !$('#settings').open) {
    if (revealDialOverlay()) {
      drawNavigation();
      return;
    }
    if (nav.stack.length === 1) {
      dismissDialOverlay();
      return;
    }
  }

  clickSound();
  if ($('#settings').open) {
    $('#settings').close();
    return;
  }
  const fromNow = nav.current.kind === 'now';
  nav.back();
  drawNavigation();
  message();
  if (fromNow) selectPlayingSong();
}
function dialogControls() {
  return [
    ...$('#settings').querySelectorAll('button:not(:disabled),input,a,summary'),
  ];
}
function rotate(delta) {
  revealDialOverlay();

  noteActivity();
  if ($('#settings').open) {
    const controls = dialogControls();
    const i = controls.indexOf(document.activeElement);
    controls[Math.max(0, Math.min(controls.length - 1, i + delta))]?.focus();
    return;
  }
  if (nav.current.kind === 'color') {
    const { stepThrough, colorStops } = window.TurnbitValueSteps;
    nav.current.value = stepThrough(
      colorStops(nav.current.key),
      nav.current.value,
      delta,
      true,
    );
    drawNavigation();
    return;
  }
  if (nav.current.kind === 'visibility') {
    const page = nav.current,
      spec = valueSpec(page.key),
      { stepThrough, stepEvenly } = window.TurnbitValueSteps;
    page.value = spec.stops
      ? stepThrough(spec.stops, page.value, delta)
      : stepEvenly(spec, page.value, delta);
    drawNavigation();
    return;
  }
  if (nav.current.kind === 'volume' || nav.current.kind === 'now')
    return changeVolume(volume + delta * INPUT_STEPS.volumeDial);
  nav.current.awaitingFirst = false;
  const previous = nav.current.selected;
  nav.move(delta);
  if (nav.current.selected !== previous) clickSound();
  drawNavigation();
  // Extra up-turns at the top of the list are normal when turning all the way up: keep counting (or start) instead of cancelling.
  if (!shortcutRow(nav.current)) cancelBackHold();
  else if (!backHold) startBackHold();
}
function push(page) {
  noteActivity();
  if (page.kind !== 'now') revealDialOverlay();
  const result = nav.push(page);
  drawNavigation();
  return result;
}
function showNow() {
  if (backdropActive()) dismissDialOverlay();
  if (nav.current.kind !== 'now') push({ title: 'Now Playing', kind: 'now' });
  render();
}
function returnToSongList() {
  noteActivity();
  if (nav.returnToMusic()) {
    drawNavigation();
    selectPlayingSong();
    return;
  }
  const uri = playback?.context?.id;
  nav.goHome();
  if (/^spotify:playlist:[a-zA-Z0-9]{22}$/.test(uri || ''))
    showLibrary('playlist', {
      id: uri.split(':')[2],
      uri,
      name: 'Current Playlist',
    });
  else showLibrary('songs');
  selectPlayingSong();
}
// Value pickers: each key carries its own range, step, and unit.
function valueSpec(key) {
  return ['timeout', 'menuTimeout'].includes(key)
    ? {
        min: 1,
        max: 600,
        stops: window.TurnbitValueSteps.TIMEOUT_STOPS,
        unit: ' sec',
      }
    : key === 'radialWidthPct'
      ? { min: 15, max: 70, step: 5, unit: '%' }
      : key === 'radialHeight'
        ? { min: 30, max: 100, step: 5, unit: '%' }
        : {
            min:
              preferences.windowMode && ['opacity', 'idleOpacity'].includes(key)
                ? WINDOW_MIN_OPACITY
                : 0,
            max: 100,
            step: 5,
            unit: '%',
          };
}
function valueText(key, value) {
  return value + valueSpec(key).unit;
}
// Size & Position: while Width or Height is being adjusted, preview the unsaved value.
function radialLayoutNow() {
  let page = null;
  try {
    page = nav.current;
  } catch {
    /* Before navigation exists (startup). */
  }
  const editing =
    page?.kind === 'visibility' &&
    ['radialWidthPct', 'radialHeight'].includes(page.key);
  return {
    width:
      editing && page.key === 'radialWidthPct'
        ? page.value
        : preferences.radialWidthPct,
    height:
      editing && page.key === 'radialHeight'
        ? page.value
        : preferences.radialHeight,
    vertical: preferences.radialVertical,
    display: preferences.radialDisplay,
  };
}

// Menu text aligns to the same side as the menu.
function textAlign() {
  return preferences.radialSide;
}

const settingsController = createSettingsController({
  resetSettings,
  $,
  preferences,
  nav,
  api,
  push,
  drawNavigation,
  render,
  message,
  noteActivity,
  getState: getPlaybackView,
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
  toggleIdlePin,
  syncMouseMode,
  command,
  menuBack,
  openSettings,
});
const {
  settingsRows,
  showSettings,
  showSettingsGroup,
  showSetting,
  showTransparency,
  showDevices,
} = settingsController;
const settingsGroups = settingsController.settingsGroups;

function savePreferences(patch) {
  try {
    const next = window.TurnbitSettings.persistPreferences(
      localStorage,
      preferences,
      patch,
    );
    Object.assign(preferences, next);
    document.body.dataset.windowMode = String(preferences.windowMode);
    document.body.dataset.menuBackground = preferences.menuBackground;
    document.body.dataset.edge = preferences.radialSide;
    document.body.dataset.align = textAlign();
    api
      ?.setInterface?.('radial', preferences.radialSide, radialLayoutNow())
      ?.catch((error) => message(error.message));
    syncVisibility();
    syncRecovery(patch);
    return true;
  } catch {
    message('Could not save this setting. Please try again.');
    return false;
  }
}
let pinQueue = Promise.resolve();
function togglePin() {
  pinQueue = pinQueue.then(performPinToggle);
  return pinQueue;
}
function toggleIdlePin() {
  if (!savePreferences({ idlePinned: !preferences.idlePinned })) return;
  if (backdropActive() && preferences.idlePinned) revealDialOverlay();
  for (const page of nav.stack) {
    const row = page.rows?.find((item) => item.action === 'idle-pin');
    if (row) row.detail = preferences.idlePinned ? 'On' : 'Off';
  }
  noteActivity();
  drawNavigation();
  message(
    backdropActive()
      ? preferences.idlePinned
        ? 'Dial menu pinned'
        : 'Dial menu unpinned'
      : preferences.idlePinned
        ? 'Widget pinned · idle paused'
        : 'Widget unpinned · idle resumed',
  );
}
async function performPinToggle() {
  if (!api) return;
  try {
    const next = await api.pin(!pinned);
    if (!savePreferences({ keepOnTop: next })) {
      await api.pin(pinned);
      return;
    }
    pinned = next;
    const row = nav.current.rows.find((r) => r.action === 'pin');
    if (row) row.detail = pinned ? 'On' : 'Off';
    drawNavigation();
    message(pinned ? 'Always on Top enabled' : 'Always on Top disabled');
  } catch (e) {
    message(e.message);
  }
}
// Save the renderer's preference before requesting its replacement. Ignore duplicate input
// while switching, and restore the preference if main cannot persist the mode.
async function resetSettings(group) {
  const patch = window.TurnbitSettings.resetPatch(group);
  const mode = patch.windowMode;
  delete patch.windowMode;
  if (Object.hasOwn(patch, 'keepOnTop') && pinned !== patch.keepOnTop) {
    await togglePin();
    if (pinned !== patch.keepOnTop) return false;
  }
  if (!savePreferences(patch)) return false;
  syncMouseMode();
  if (applicationSettings && ['all', 'playback'].includes(group))
    await applicationSettings.save(recoverySettingsNow());
  if (typeof mode === 'boolean' && mode !== preferences.windowMode)
    return toggleWindowMode();
  return true;
}

let windowModeChanging = false;
async function toggleWindowMode() {
  if (!api || windowModeChanging) return false;
  const previous = preferences.windowMode;
  windowModeChanging = true;
  if (!savePreferences({ windowMode: !previous })) {
    windowModeChanging = false;
    return false;
  }
  try {
    await api.windowMode(!previous);
    return true;
  } catch (error) {
    savePreferences({ windowMode: previous });
    windowModeChanging = false;
    drawNavigation();
    message(error.message);
    return false;
  }
}

function lastSongListRow() {
  return {
    label: 'Last Song List',
    action: 'last-song-list',
    icon: 'playlists',
    detail: preferences.lastSongList?.name || '',
    branch: true,
    showDetail: true,
  };
}

const libraryController = createLibraryController({
  $,
  preferences,
  nav,
  api,
  getState: getPlaybackView,
  demos,
  demoTrack,
  time,
  drawNavigation,
  push,
  message,
  cleanLastSongList,
  savePreferences,
  isCurrentSong,
  radial,
  visibilityState,
  backdropActive,
  dialOverlay,
  lastSongListRow,
  createCache: () => new window.LikedSongsCache(),
});
const {
  moreRow,
  loadLibrary,
  openLastSongList,
  selectPlayingSong,
  followSkippedSong,
  followIdleSong,
  showLibrary,
} = libraryController;

function finishSongSelection() {
  if (nowPlayingAuto()) showNow();
  else {
    drawNavigation();
    render();
  }
}
async function playRow(row) {
  const sourcePath = nav.rememberMusic();
  // Choosing the song that is already playing opens it instead of restarting it.
  if (isCurrentSong(row)) {
    if (sourcePath) nav.musicPath = sourcePath;
    finishSongSelection();
    return;
  }
  if (demo) {
    demoQueue =
      row.playlist?.demoIndexes || row.queue || demos.map((_, i) => i);
    index = row.demoIndex ?? demoQueue[0];
    progress = 0;
    updated = Date.now();
    playing = true;
    if (sourcePath) nav.musicPath = sourcePath;
    finishSongSelection();
    return;
  }
  const value =
    row.action === 'play-playlist'
      ? { contextId: row.playlist.uri }
      : row.contextUri
        ? { contextId: row.contextUri, position: row.position }
        : { trackId: row.track.id };
  // A known song is shown at once; the main process reverts it if Spotify rejects the request.
  if (row.action === 'song' && row.track) {
    value.track = row.track;
    const request = command('play-item', value);
    if (sourcePath) nav.musicPath = sourcePath;
    finishSongSelection();
    await request;
    return;
  }
  if (await command('play-item', value)) {
    if (sourcePath) nav.musicPath = sourcePath;
    finishSongSelection();
  }
}
async function selectItem(fromDial = false) {
  if (backdropActive() && revealDialOverlay()) {
    noteActivity();
    drawNavigation();
    return;
  }

  noteActivity();
  clickSound();
  if ($('#settings').open) {
    const focused = document.activeElement;
    if (focused?.matches('button,a,summary')) focused.click();
    return;
  }
  // Saving the window haze selects Matching, so Menu Background's Style row follows it.
  function syncMenuBackgroundRow() {
    const style = nav.current.rows?.find(
      (item) => item.action === 'menu-background',
    );
    if (style) style.detail = menuBackgroundName();
  }
  if (nav.current.kind === 'color') {
    const page = nav.current;
    if (
      savePreferences({
        [page.key]: page.value,
        ...(page.key === 'windowSmokeHue' ? { menuBackground: 'match' } : {}),
      })
    ) {
      nav.back();
      const row = nav.current.rows.find((item) => item.key === page.key);
      if (row) row.detail = radialColorName(page.value);
      syncMenuBackgroundRow();
      drawNavigation();
    }
    return;
  }
  if (nav.current.kind === 'visibility') {
    const page = nav.current;
    if (
      savePreferences(
        [
          'radialBackground',
          'windowBackground',
          'radialWidthPct',
          'radialHeight',
          'menuTimeout',
        ].includes(page.key)
          ? {
              [page.key]: page.value,
              ...(page.key === 'windowBackground'
                ? { menuBackground: 'match' }
                : {}),
            }
          : {
              visibility: { ...preferences.visibility, [page.key]: page.value },
            },
      )
    ) {
      nav.back();
      const row = nav.current.rows.find(
        (item) =>
          item.key === page.key ||
          (page.key === 'radialBackground' &&
            item.action === 'radial-background'),
      );
      if (row) row.detail = valueText(page.key, page.value);
      syncMenuBackgroundRow();
      drawNavigation();
    }
    return;
  }
  if (nav.current.kind === 'now') {
    returnToSongList();
    return;
  }
  if (nav.current.kind !== 'list') {
    menuBack();
    return;
  }
  const row = nav.select();
  if (!row) return;
  message();
  switch (row.action) {
    case 'nav-back':
      nav.back();
      drawNavigation();
      break;
    case 'last-song-list':
      openLastSongList();
      break;
    case 'now':
      showNow();
      break;
    case 'playlists':
      showLibrary('playlists');
      break;
    case 'songs':
      showLibrary('songs');
      break;
    case 'playlist':
      showLibrary('playlist', row.playlist);
      break;
    case 'song':
    case 'play-playlist':
      await playRow(row);
      break;
    case 'more':
    case 'retry':
      await loadLibrary(nav.current, row.offset);
      break;
    default:
      // Local navigation above runs immediately; only settings that actually
      // need native/provider work enter the asynchronous settings dispatcher.
      await settingsController.select(row);
      break;
  }
}
// The dial double-press is a navigation gesture: Back, or Home. It only belongs on rows that
// navigate or start playback. Settings rows change a value and stay put, so a second press there is
// another press, not a gesture - otherwise hyper-clicking a toggle threw you out to the home screen.
const GESTURE_ROWS = new Set([
  'song',
  'playlist',
  'play-playlist',
  'nav-back',
  'now',
]);
function gestureArmed() {
  if ($('#settings').open) return false;
  if (nav.current.kind !== 'list') return true;
  const row = nav.select();
  if (!row) return true;
  if (row.action === 'more') return false;
  return (
    row.branch === true || row.control === true || GESTURE_ROWS.has(row.action)
  );
}
const centerClick = new window.CenterClick(
  () => selectItem(true),
  () => (preferences.doublePress === 'home' ? dialHome() : menuBack()),
  { armed: gestureArmed },
);
const transportHold = new window.TransportHold(
  (direction) => command(direction > 0 ? 'next' : 'previous'),
  (delta) => {
    if (!preferences.dialOnlyWake) noteActivity();
    seek(currentProgress() + delta);
  },
);
// What the main process needs to know to handle hardware keys without this view.
function syncInputContext() {
  const value = {
    demo,
    dialOnlyWake: preferences.dialOnlyWake,
    openPlayerOnToggle:
      !backdropActive() &&
      nowPlayingAuto() &&
      (nav.current.kind !== 'now' || $('#settings').open),
  };
  const key = JSON.stringify(value);
  if (syncInputContext.key === key) return;
  syncInputContext.key = key;
  api?.inputContext(value);
}
// Keyboard & Mouse Mode (main process overlay): scroll moves, left click selects, right click goes back, middle click plays or pauses.
function syncMouseMode() {
  api
    ?.mouseMode?.(preferences.mouseModeKey)
    ?.then((result) => {
      if (result && !result.ok) message(result.error);
    })
    .catch((error) => message(error.message));
}
function mouseModeEvent(event) {
  if (event.type === 'active') {
    document.body.dataset.mouseMode = String(event.active);
    if (event.active) {
      centerClick.cancel();
      noteActivity();
    }
    return;
  }
  centerClick.flush();
  if (event.type === 'rotate') return rotate(event.delta);
  if (event.type === 'select') return selectItem(true);
  if (event.type === 'back') return menuBack();
  if (event.type === 'toggle') return command('toggle');
}
function hardwareEvent(event) {
  const previous = silentHardwareActivity;
  silentHardwareActivity =
    preferences.dialOnlyWake &&
    widgetAsleep() &&
    event.type !== 'dial' &&
    !['center-down', 'center-up', 'center-click', 'select'].includes(
      event.command,
    ) &&
    event.type !== 'wake';
  try {
    return handleHardwareEvent(event);
  } finally {
    silentHardwareActivity = previous;
  }
}
function handleHardwareEvent(event) {
  if (event.type === 'command-complete') {
    if (event.command === 'like') {
      likeRequests = Math.max(0, likeRequests - 1);
      render();
    }
    if (event.message) message(event.message);
    return;
  }
  if (event.type === 'open-player') {
    noteActivity();
    if ($('#settings').open) $('#settings').close();
    showNow();
    return;
  }
  if (event.handled) {
    message();
    if (event.command === 'like') {
      likeRequests++;
      message('Updating Liked Songs…');
      render();
    }
    if (!event.quiet) noteActivity();
    if (['next', 'previous'].includes(event.command)) {
      libraryController.expectSkip();
      transportHold.cancel();
      seekControl.reset(0);
    }
    if (event.command === 'volume' && Number.isFinite(event.value)) {
      volumeControl.reset(event.value);
      volume = event.value;
      render();
    }
    if (event.command === 'seek' && Number.isFinite(event.value)) {
      seekControl.reset(event.value);
      seekControl.protectedUntil = Date.now() + 1500;
      progress = event.value;
      updated = Date.now();
      render();
    }

    return;
  }
  if (event.type === 'heartbeat') return;
  if (event.type === 'wake') {
    centerClick.cancel();
    noteActivity();
    return;
  }
  if (event.type === 'command' && event.command === 'center-down') {
    dialRevealPress = revealDialOverlay();
    if (dialRevealPress) drawNavigation();

    noteActivity();
    return;
  }
  if (event.type === 'command' && event.command === 'center-click') {
    noteActivity();
    if (dialRevealPress) {
      dialRevealPress = false;
      return;
    }
    if (revealDialOverlay()) {
      drawNavigation();
      return;
    }
    centerClick.click();
    return;
  }
  if (!(event.type === 'command' && event.command === 'touch'))
    centerClick.flush();
  if (event.type === 'dial')
    return rotate(preferences.reverseDial ? -event.delta : event.delta);
  if (event.type !== 'command') return;
  const cmd = event.command;
  if (['next-down', 'previous-down', 'next-up', 'previous-up'].includes(cmd)) {
    noteActivity();
    const direction = cmd.startsWith('next') ? 1 : -1;
    return cmd.endsWith('-down')
      ? transportHold.down(direction)
      : transportHold.up(direction);
  }
  if (cmd === 'menu-down') {
    menuBack();
    return;
  }
  if (cmd === 'menu-up') {
    return;
  }
  if (cmd === 'touch') {
    noteActivity();
    return;
  }
  if (cmd === 'select') return selectItem(true);
  if (cmd === 'menu') return menuBack();
  if (cmd === 'back') {
    noteActivity();

    clickSound();
    if ($('#settings').open) {
      $('#settings').close();
      return;
    }
    nav.back();
    drawNavigation();
    message();
    return;
  }
  if (cmd === 'volume-up' || cmd === 'volume-down')
    return changeVolume(
      volume + (cmd === 'volume-up' ? 1 : -1) * INPUT_STEPS.volumeKey,
    );
  if (cmd === 'seek-forward' || cmd === 'seek-back')
    return seek(
      currentProgress() +
        (cmd === 'seek-forward' ? 1 : -1) * INPUT_STEPS.seekMs,
    );
  command(cmd);
}
document.querySelectorAll('[data-command]').forEach((b) => {
  const direction =
    b.dataset.command === 'next'
      ? 1
      : b.dataset.command === 'previous'
        ? -1
        : 0;
  if (!direction) {
    b.addEventListener('click', () => command(b.dataset.command));
    return;
  }
  b.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    noteActivity();
    b.setPointerCapture(event.pointerId);
    transportHold.down(direction);
  });
  b.addEventListener('pointerup', () => transportHold.up(direction));
  b.addEventListener('pointercancel', () => transportHold.cancel());
  b.addEventListener('lostpointercapture', () => {
    if (transportHold.direction === direction) transportHold.cancel();
  });
  b.addEventListener('click', (event) => {
    if (event.detail === 0) command(b.dataset.command);
  });
});
$('.dismiss').onclick = () => $('#settings').close();
document.addEventListener('keydown', (e) => {
  if (
    e.target.closest('dialog') ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
  )
    return;
  if (e.target.closest('button') && [' ', 'Enter'].includes(e.key)) return;
  if (
    [
      ' ',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Backspace',
      'Escape',
    ].includes(e.key)
  )
    e.preventDefault();
  if (e.key === ' ' && !e.repeat) command('toggle');
  if (e.key === 'Enter' && !e.repeat) selectItem();
  if (e.key === 'ArrowUp') rotate(-1);
  if (e.key === 'ArrowDown') rotate(1);
  if (e.key === 'ArrowLeft')
    e.shiftKey
      ? seek(currentProgress() - INPUT_STEPS.seekMs)
      : command('previous');
  if (e.key === 'ArrowRight')
    e.shiftKey ? seek(currentProgress() + INPUT_STEPS.seekMs) : command('next');
  if (e.key === 'Escape' || e.key === 'Backspace') menuBack();
});
$('#settings').addEventListener('toggle', syncVisibility);
let lastMouseActivity = 0;
document.addEventListener(
  'pointermove',
  () => {
    if (clickThroughActive()) return;
    if (Date.now() - lastMouseActivity > 250) {
      lastMouseActivity = Date.now();
      lastVisualActivity = Date.now();
      syncGamingMode();
      api?.activity();
    }
  },
  { passive: true },
);
document.addEventListener('pointerdown', () => noteActivity(), {
  passive: true,
  capture: true,
});
document.addEventListener('keydown', () => noteActivity(), { capture: true });
$('#dashboard').onclick = (e) => {
  if (api) {
    e.preventDefault();
    api
      .openExternal(e.currentTarget.href)
      .catch((error) => message(error.message));
  }
};
async function openSpotify(href) {
  try {
    await api.openExternal(href);
  } catch (error) {
    message(error.message);
  }
}
for (const link of document.querySelectorAll('.spotify-link'))
  link.addEventListener('click', (event) => {
    if (!api) return;
    event.preventDefault();
    void openSpotify(link.href);
  });
$('#connectionForm').onsubmit = async (e) => {
  e.preventDefault();
  if (!api)
    return ($('#settingsMessage').textContent =
      'Run npm start to connect Spotify.');
  $('#login').disabled = true;
  $('#settingsMessage').textContent = 'Opening Spotify authorization…';
  try {
    await api.configure($('#clientId').value);
    await api.login();
  } catch (error) {
    $('#settingsMessage').textContent = error.message;
  } finally {
    $('#login').disabled = false;
  }
};
$('#logout').onclick = async () => {
  try {
    libraryController.clear();
    transportHold.cancel();
    seekControl.reset(0);
    volumeControl.reset(volume);
    volumeDeviceId = null;
    await api?.logout();
    demo = true;
    playing = false;
    progress = 0;
    updated = Date.now();
    playback = null;
    nav.reset(root());
    drawNavigation();
    $('#settingsMessage').textContent = 'Disconnected.';
    render();
  } catch (e) {
    $('#settingsMessage').textContent = e.message;
  }
};
if (api) {
  applicationSettings = window.createApplicationSettingsClient(api.settings, {
    onValue: adoptApplicationSettings,
    onError: (error) => {
      syncRecovery.key = null;
      message(error.message);
    },
  });
  applicationSettings
    .initialize(recoverySettingsNow())
    .catch((error) => message(error.message));
  api
    .pin(preferences.keepOnTop)
    .then((value) => {
      pinned = value;
      const row = nav.current.rows.find((item) => item.action === 'pin');
      if (row) row.detail = pinned ? 'On' : 'Off';
      drawNavigation();
    })
    .catch((error) => message(error.message));
  // Main owns the authoritative windowMode (it decides frame/transparent at window creation); resync in case it drifted from this copy.
  api
    .windowMode()
    .then((value) => {
      if (typeof value === 'boolean' && value !== preferences.windowMode) {
        savePreferences({ windowMode: value });
        drawNavigation();
        render();
      }
    })
    .catch(() => {});
  api.playback.onEvent((event) => {
    if (!demo) playbackEvent(event);
  });
  api.onAuth((auth) => {
    if (auth.error) {
      message(auth.error);
      $('#settingsMessage').textContent = auth.error;
      return;
    }
    if (auth.connected) {
      demo = false;
      $('#settingsMessage').textContent = 'Connected.';
      $('#settings').close();
      nav.reset(root());
      drawNavigation();
      refresh();
    } else if (!auth.authorizing) {
      demo = true;
      playing = false;
      nav.reset(root());
      drawNavigation();
      render();
    }
  });
  api.onDeviceEvent(hardwareEvent);
  api.onBridgeError(hardwareError);
  api.onMouseMode?.(mouseModeEvent);
  syncMouseMode();
  api
    .status()
    .then((auth) => {
      $('#clientId').value = auth.clientId;
      if (auth.connected) {
        demo = false;
        refresh();
      }
      drawNavigation();
      render();
    })
    .catch((e) => message(e.message));
  // The bridge reports a failure once as it happens (onBridgeError). That can be
  // before this view exists, so ask once on load as well.
  api
    .hardware()
    .then((status) => hardwareError(status.error))
    .catch((error) => hardwareError(error.message));
  api.onVisibility?.((state) => {
    const wasHidden = visibilityState.invisible || visibilityState.minimized;
    Object.assign(visibilityState, state);
    const hidden = visibilityState.invisible || visibilityState.minimized;
    document.body.dataset.renderSuspended = String(hidden);
    if (hidden) {
      if (state.invisible && preferences.visibility.mode === 'idle')
        followIdleSong(true);
      radial.stop();
      trackTransition.reset();
    } else if (wasHidden) {
      playbackView.invalidate();
      drawNavigation();
      render();
    }
  });
  api.playback.presentation(document.hidden);
  document.addEventListener('visibilitychange', () =>
    api.playback.presentation(document.hidden),
  );
} else message('Preview only. Run npm start for Spotify and D100H.');
setInterval(() => {
  if (
    demo &&
    playing &&
    !transportHold.direction &&
    currentProgress() >= duration()
  )
    command('next');
  if (backdropActive()) {
    const protectedView =
      preferences.idlePinned ||
      $('#settings').open ||
      nav.current.loading ||
      nav.current.visibilitySettings ||
      nav.current.kind === 'color' ||
      !!backHold ||
      centerClick.pending ||
      ($('#radial').contains(document.activeElement) &&
        document.activeElement.matches('input'));
    // Dial Menu Timeout, read each tick so a new value takes effect straight away.
    dialOverlay.timeout = preferences.menuTimeout * 1000;
    if (dialOverlay.tick(protectedView, () => rewindMenuToSource(true))) {
      cancelBackHold();
      syncDialOverlay();
    }
  } else if (
    idle.tick(
      !preferences.idlePinned &&
        nowPlayingAuto() &&
        !$('#settings').open &&
        !nav.current.loading &&
        !nav.current.visibilitySettings,
    )
  )
    drawNavigation();
  followIdleSong();
  syncGamingMode();
  renderProgress();
}, 250);
document.body.dataset.windowMode = String(preferences.windowMode);
document.body.dataset.interface = 'radial';
document.body.dataset.edge = preferences.radialSide;
document.body.dataset.align = textAlign();
syncPlayerColumn();
api
  ?.setInterface?.('radial', preferences.radialSide, radialLayoutNow())
  ?.catch((error) => message(error.message));
drawNavigation();
render();

$('#radial').addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    rotate(event.deltaY > 0 ? 1 : -1);
  },
  { passive: false },
);
$('#radial').addEventListener('click', (event) => {
  if (nav.current.kind !== 'list' && event.target.closest('.radial-label'))
    selectItem();
});

$('#radialVolume').oninput = (event) =>
  changeVolume(Number(event.target.value));
$('#radialSeek').onchange = (event) => {
  seek(Number(event.target.value));
  event.target.blur();
};
$('#radialBackdropBrowse').onclick = () => {
  if (dialOverlay.visible) dismissDialOverlay();
  else browseFromPlayer();
};
$('#radialBackdropDismiss').onclick = dismissDialOverlay;
$('#radialBackdropDevice').onclick = () => {
  if (demo) openSettings();
  else showDevices();
};
$('#radialBackdrop').addEventListener(
  'wheel',
  (event) => {
    if (event.target.matches('input')) return;
    event.preventDefault();
    rotate(event.deltaY > 0 ? 1 : -1);
  },
  { passive: false },
);
for (const button of document.querySelectorAll('[data-backdrop-command]'))
  button.onclick = () => command(button.dataset.backdropCommand);
$('#radialBackdropVolume').oninput = (event) =>
  changeVolume(Number(event.target.value));
// The progress bar previews the time under the pointer before a click seeks there.
$('#radialBackdropSeek').addEventListener('pointermove', (event) => {
  const bar = event.currentTarget.getBoundingClientRect(),
    ratio = Math.max(0, Math.min(1, (event.clientX - bar.left) / bar.width)),
    preview = $('.seek-preview');
  preview.textContent = duration() ? time(ratio * duration()) : '';
  preview.style.left = ratio * 100 + '%';
});
$('#radialBackdropSeek').onchange = (event) => {
  seek(Number(event.target.value));
  event.target.blur();
};
$('#radialSongList').onclick = returnToSongList;

$('#radialColorSave').onclick = () => selectItem();
$('#radialColorCancel').onclick = menuBack;

// Harness surface. The scripts/verify-*.js harnesses and smoke.js drive the app
// by evaluating code in this window, and this is the complete list of what they
// may reach. A module keeps everything else private, so a harness that needs
// something new adds it here.
Object.assign(window, {
  $,
  api,
  demos,
  preferences,
  reducedMotion,
  root,
  nav,
  idle,
  dialOverlay,
  radial,
  trackTransition,
  visibilityState,
  volumeControl,
  demoLikes,
  settingsGroups,
  WINDOW_MIN_OPACITY,
  noteActivity,
  time,
  duration,
  currentProgress,
  message,
  drawNavigation,
  acceptPlayback,
  refresh,
  command,
  seek,
  rotate,
  push,
  selectItem,
  menuBack,
  openSettings,
  showNow,
  showLibrary,
  openLastSongList,
  followIdleSong,
  moreRow,
  valueSpec,
  settingsRows,
  showSettings,
  showSettingsGroup,
  showSetting,
  showTransparency,
  savePreferences,
  syncMouseMode,
  hardwareEvent,
  radialColor,
  backdropActive,
  dismissDialOverlay,
  browseFromPlayer,
});
// State the harnesses read and set directly.
for (const [name, get, set] of [
  // verify-gaming wraps render to count full redraws, so internal calls must see the wrapper.
  ['render', () => render, (value) => (render = value)],
  ['demo', () => demo, (value) => (demo = value)],
  ['index', () => index, (value) => (index = value)],
  ['playing', () => playing, (value) => (playing = value)],
  ['progress', () => progress, (value) => (progress = value)],
  ['volume', () => volume, (value) => (volume = value)],
  ['playback', () => playback, (value) => (playback = value)],
  ['updated', () => updated, (value) => (updated = value)],
  ['pinned', () => pinned, (value) => (pinned = value)],
  ['demoQueue', () => demoQueue, (value) => (demoQueue = value)],
  ['demoShuffle', () => demoShuffle, (value) => (demoShuffle = value)],
  ['demoRepeat', () => demoRepeat, (value) => (demoRepeat = value)],
  [
    'lastVisualActivity',
    () => lastVisualActivity,
    (value) => (lastVisualActivity = value),
  ],
])
  Object.defineProperty(window, name, { get, set, configurable: true });
