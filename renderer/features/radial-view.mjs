import { renderSongTitle } from './song-title.mjs';

export function createRadialView({
  $,
  preferences,
  nav,
  api,
  radial,
  trackTransition,
  dialOverlay,
  visibilityState,
  getState,
  isCurrentSong,
  selectPlayingSong,
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
}) {
  function radialColor(hue, accent = false) {
    return hue === -1
      ? '#000000'
      : hue === 360
        ? '#eef7f5'
        : hue === 141 && accent
          ? '#1db954'
          : `hsl(${hue} 75% ${accent ? 68 : 79}%)`;
  }
  function radialColorName(hue) {
    return hue === -1
      ? 'Black'
      : hue === 141
        ? 'Spotify Green'
        : hue === 360
          ? 'White'
          : [
              'Red',
              'Orange',
              'Amber',
              'Lime',
              'Green',
              'Mint',
              'Cyan',
              'Azure',
              'Blue',
              'Violet',
              'Magenta',
              'Rose',
            ][Math.floor(((hue + 15) % 360) / 30)];
  }
  function syncColorPalette(page) {
    const palette = $('#radialColorPalette');
    const stops = window.TurnbitValueSteps.colorStops(page.key);
    if (palette.dataset.key !== page.key) {
      palette.replaceChildren();
      palette.dataset.key = page.key;
      palette.onkeydown = (event) => {
        const delta = {
          ArrowLeft: -1,
          ArrowRight: 1,
          ArrowUp: -7,
          ArrowDown: 7,
        }[event.key];
        if (
          !delta ||
          !event.target.matches('button') ||
          nav.current.kind !== 'color'
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const buttons = [...palette.children];
        const next =
          buttons[
            (buttons.indexOf(event.target) + delta + buttons.length) %
              buttons.length
          ];
        next.click();
        next.focus({ preventScroll: true });
      };
      for (const hue of stops) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.hue = hue;
        button.title = radialColorName(hue);
        button.setAttribute('aria-label', radialColorName(hue));
        button.onclick = () => {
          if (nav.current.kind !== 'color') return;
          noteActivity();
          nav.current.value = hue;
          drawNavigation();
        };
        palette.append(button);
      }
    }
    for (const button of palette.children) {
      const hue = Number(button.dataset.hue);
      button.style.setProperty(
        '--swatch',
        radialColor(hue, page.key !== 'primaryHue'),
      );
      button.setAttribute('aria-pressed', String(hue === page.value));
      button.tabIndex =
        hue === page.value || (hue === stops[0] && !stops.includes(page.value))
          ? 0
          : -1;
    }
  }
  function applyRadialColors() {
    const page = nav.current;
    for (const key of ['primaryHue', 'accentHue']) {
      const hue =
        page.kind === 'color' && page.key === key
          ? page.value
          : preferences[key];
      // The menu and the window player share Text Color and Accent Color.
      for (const host of [$('#radial'), $('#radialBackdrop')])
        host.style.setProperty(
          key === 'primaryHue' ? '--radial-primary' : '--radial-accent',
          radialColor(hue, key === 'accentHue'),
        );
    }
  }
  function radialRowDetail(row) {
    const { demo, playing, progress, playback } = getState();

    if (row.action !== 'song') return row.detail;
    const artist =
      row.item?.artists
        ?.map((artist) => artist.name)
        .filter(Boolean)
        .join(', ') ||
      row.item?.artist ||
      row.item?.publisher ||
      'Unknown artist';
    const active =
      isCurrentSong(row) && (demo ? playing || progress > 0 : playback?.item);
    const status = active ? '' : row.detail;
    return [artist, status].filter(Boolean).join(' · ');
  }
  function radialMiniPlayer(row) {
    const { demo, playing, progress, playback } = getState();

    if (
      !isCurrentSong(row) ||
      !(demo ? playing || progress > 0 : playback?.item)
    )
      return null;
    return {
      title: row.label,
      artist:
        row.item?.artists
          ?.map((artist) => artist.name)
          .filter(Boolean)
          .join(', ') ||
        row.item?.artist ||
        playback?.item?.publisher ||
        'Unknown artist',
      art:
        !demo &&
        (playback?.item?.album?.images?.[0]?.url ||
          row.item?.album?.images?.[0]?.url),
      playing,
      ratio: duration() ? currentProgress() / duration() : 0,
      elapsed: time(currentProgress()),
      total: time(duration()),
    };
  }
  // Sample a small copy of the cover for ambient color. The displayed cover stays untouched.
  const artworkColors = new Map();
  function sampleArtworkColor(source) {
    if (artworkColors.has(source)) return artworkColors.get(source);
    const result = (async () => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = source;
      const decoded = await image.decode().then(
        () => true,
        () => false,
      );
      if (!decoded) return null;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 24;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        context.drawImage(image, 0, 0, 24, 24);
        const pixels = context.getImageData(0, 0, 24, 24).data;
        const totals = [0, 0, 0];
        let weightSum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] < 128) continue;
          const high = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
          const low = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
          const weight = 1 + (high - low) / 255;
          for (let channel = 0; channel < 3; channel++)
            totals[channel] += pixels[i + channel] * weight;
          weightSum += weight;
        }
        return weightSum
          ? `rgb(${totals.map((total) => Math.round(total / weightSum)).join(' ')})`
          : null;
      } catch {
        // Some artwork hosts do not permit canvas reads; retain the neutral wash.
        return null;
      }
    })();
    artworkColors.set(source, result);
    if (artworkColors.size > 48)
      artworkColors.delete(artworkColors.keys().next().value);
    return result;
  }
  const GLOW_STRENGTH = 0.3;
  function syncRadialGlow() {
    const backdrop = $('#radialBackdrop'),
      glow = $('#radialGlow'),
      // The artwork the player is showing, which can briefly trail the song during a crossfade.
      source = backdropActive() ? shownArtwork : '';
    if (syncRadialGlow.source !== source) {
      syncRadialGlow.source = source;
      backdrop.dataset.hasArtwork = String(!!source);
      if (source)
        sampleArtworkColor(source).then((color) => {
          if (syncRadialGlow.source === source)
            backdrop.style.setProperty('--artwork-color', color || '#191414');
        });
      else backdrop.style.setProperty('--artwork-color', '#191414');
    }
    glow.style.opacity = source ? GLOW_STRENGTH : 0;
  }
  // Backdrop behind the turnbit menu: one smooth alpha field, so it never shows a hard line. It is solid behind the labels
  // (text stays readable), then eases to exactly zero at the window's inner edge and, when the window is shorter than the
  // screen, at the top and/or bottom. The two directions multiply, so corners blend. Drawn at half resolution with a
  // light ordered dither (against banding on dark gradients) and scaled up smoothly by the browser.
  const HAZE_DITHER = [
    0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
  ].map((v) => v / 16 - 0.47);
  function smokeSettings() {
    const page = nav.current;
    const opacityKey = preferences.windowMode
      ? 'windowBackground'
      : 'radialBackground';
    const colorKey = preferences.windowMode
      ? 'windowSmokeHue'
      : 'widgetSmokeHue';
    return {
      opacity:
        (page.kind === 'visibility' && page.key === opacityKey
          ? page.value
          : preferences[opacityKey]) / 100,
      color: radialColor(
        page.kind === 'color' && page.key === colorKey
          ? page.value
          : preferences[colorKey],
        true,
      ),
    };
  }
  function updateSmokeShape(opacity = smokeSettings().opacity) {
    const smokeColor = smokeSettings().color;
    const host = $('#radial'),
      canvas = $('#radialHaze');
    if (!canvas) return;
    // Split View keeps the smoke over the menu's own half, feathering out just past the divider.
    const split = splitActive(),
      menu = host.clientWidth;
    const width = split ? menu + SPLIT_HAZE_SPILL : innerWidth,
      height = host.clientHeight,
      radiusX = Math.min(radial.bow(), menu * 0.52),
      radiusY = Math.max(100, height / 2 - 70);
    const short = preferences.radialHeight < 100,
      vertical = preferences.radialVertical,
      fadeTop = short && vertical !== 'top',
      fadeBottom = short && vertical !== 'bottom',
      curved = preferences.radialCurve;
    const key = [
      width,
      height,
      menu,
      curved,
      fadeTop,
      fadeBottom,
      opacity,
      smokeColor,
    ].join(':');
    if (!height || !width || updateSmokeShape.key === key) return;
    updateSmokeShape.key = key;
    canvas.style.width = split ? width + 'px' : '';
    const scale = 2,
      w = Math.ceil(width / scale),
      h = Math.ceil(height / scale),
      pad = 24,
      vfade = Math.max(48, Math.min(160, height * 0.16));
    const ease = (t) =>
      t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10);
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    context.fillStyle = smokeColor;
    context.fillRect(0, 0, w, h);
    const image = context.getImageData(0, 0, w, h),
      data = image.data;
    for (let j = 0; j < h; j++) {
      // The solid edge follows the label curve (bending less, so labels near the ends stay on solid).
      const y = (j + 0.5) * scale,
        normal = Math.min(1, Math.abs(y - height / 2) / radiusY),
        bow = curved ? radiusX * (1 - Math.sqrt(1 - normal * normal)) : 0;
      const solid = Math.min(width - 24, menu - 30 - bow * 0.6 + pad),
        span = width - solid;
      const across =
        Math.min(
          fadeTop ? ease(y / vfade) : 1,
          fadeBottom ? ease((height - y) / vfade) : 1,
        ) *
        opacity *
        255;
      for (let i = 0; i < w; i++) {
        const x = (i + 0.5) * scale,
          value = (1 - ease((x - solid) / span)) * across;
        data[(j * w + i) * 4 + 3] =
          value <= 0
            ? 0
            : Math.max(
                0,
                Math.min(
                  255,
                  Math.round(value + HAZE_DITHER[(j & 3) * 4 + (i & 3)]),
                ),
              );
      }
    }
    context.putImageData(image, 0, 0);
  }
  // Resizing (Size & Position, moving displays) changes the free space for the fade and the label path: redraw both.
  window.addEventListener('resize', () => {
    if (preferences.interfaceStyle === 'radial') {
      drawNavigation();
      updateSmokeShape();
    }
  });

  let miniIndexCache = {};
  function currentMiniIndices(page) {
    const { demo, index, playback, playing, progress } = getState();
    const key = [
      demo,
      index,
      playback?.item?.uri,
      demo ? playing || progress > 0 : !!playback?.item,
    ].join(':');
    if (miniIndexCache.rows !== page.rows || miniIndexCache.key !== key)
      miniIndexCache = {
        rows: page.rows,
        key,
        indices: page.rows.flatMap((row, i) =>
          radialMiniPlayer(row) ? [i] : [],
        ),
      };
    return miniIndexCache.indices;
  }
  // Window Mode alternates between the large player and a dedicated dial browsing screen.
  function backdropActive() {
    return (
      preferences.windowMode &&
      preferences.nowPlayingBackdrop &&
      preferences.interfaceStyle === 'radial'
    );
  }
  // Split View changes how the two views share the window while the menu is up: instead of covering the
  // player, the menu takes its docked half and the player keeps the other, both live. The menu still
  // comes and goes the same way, so the idle timeout collapses it and the player expands to fill the
  // window. Two columns need room, so a window narrower than SPLIT_MIN_WIDTH at its design size (the
  // window's width before the large-display scale) uses the overlay instead.
  // A window clearly taller than it is wide stacks the artwork above the song, whatever its size.
  function portraitWindow() {
    return innerHeight > innerWidth * 1.2;
  }
  // Each arrangement has a design size: side by side about 1440×880, stacked about 720×1000.
  // Bigger windows scale the whole player and menu up together, to at most three times, so a large
  // or 4K display is filled rather than left mostly empty. The scale follows the window, not the
  // space beside the menu, so opening Split View never resizes anything.
  function uiScale() {
    const [designWidth, designHeight] = portraitWindow()
      ? [720, 1000]
      : [1440, 880];
    return Math.max(
      1,
      Math.min(3, innerWidth / designWidth, innerHeight / designHeight),
    );
  }
  function splitActive() {
    return (
      backdropActive() &&
      preferences.backdropLayout === 'split' &&
      innerWidth / uiScale() >= SPLIT_MIN_WIDTH
    );
  }
  // Overlay: the menu is alone on screen while browsing, so it reaches in from its docked edge to put
  // the selected row near the middle of the window, and its labels bow further out along the way.
  function wideMenu() {
    return backdropActive() && !splitActive();
  }
  function menuBackgroundName() {
    return {
      match: 'Matching',
      black: 'Black',
      glass: 'Glass',
      artwork: 'Cover Color',
    }[preferences.menuBackground];
  }
  function backdropLayoutName() {
    return preferences.backdropLayout === 'split' ? 'Split View' : 'Overlay';
  }
  // The player stacks artwork above its text when its column is too narrow to hold both side by side:
  // the whole window, or the half left over while Split View has the menu up beside it.
  function syncPlayerColumn(sharing = false) {
    const portrait = portraitWindow(),
      scale = uiScale();
    document.body.style.setProperty('--ui-scale', scale.toFixed(3));
    // Split View leaves the player what the menu does not cover, measured on screen (the menu is scaled)
    // and compared at design size.
    const column =
      (sharing
        ? Math.max(
            0,
            innerWidth -
              Math.round($('#radial')?.getBoundingClientRect().width || 0),
          )
        : innerWidth) / scale;
    document.body.dataset.playerColumn =
      portrait || column <= PLAYER_STACK_WIDTH ? 'narrow' : 'wide';
  }
  // The player is as wide as its artwork and the current song's text, so Split View's divider (radial.css)
  // reads that width to stay midway between the menu and the player. offsetWidth ignores the scale.
  const playerInfo = $('.radial-backdrop-info');
  if (playerInfo && typeof ResizeObserver === 'function')
    new ResizeObserver(() =>
      document.body.style.setProperty(
        '--player-live',
        playerInfo.offsetWidth + 'px',
      ),
    ).observe(playerInfo);
  function syncDialOverlay() {
    const active = backdropActive(),
      split = splitActive();
    const visible = active && dialOverlay.visible && nav.current.kind !== 'now';
    // Overlay covers the player with the menu; Split View sets it beside the menu instead.
    const covered = visible && !split;
    document.body.dataset.dialOverlay = String(visible);
    $('#windowDialPinned').hidden = !visible || !preferences.idlePinned;
    document.body.dataset.backdropSplit = String(split);
    document.body.dataset.splitDivider = String(preferences.splitDivider);
    const radialHost = $('#radial');
    const player = $('.radial-backdrop-info'),
      browseButton = $('#radialBackdropBrowse');
    $('#radialBackdrop').setAttribute(
      'aria-label',
      visible && split
        ? 'Now playing and music browsing'
        : visible
          ? 'Music browsing'
          : 'Now playing',
    );
    if (active && !visible && radialHost.contains(document.activeElement))
      browseButton.focus({ preventScroll: true });
    // Only a covered player has to hand focus back; beside the menu it stays usable.
    if (covered && player.contains(document.activeElement))
      browseButton.focus({ preventScroll: true });
    radialHost.inert = active && !visible;
    if (active && !visible) radialHost.setAttribute('aria-hidden', 'true');
    else radialHost.removeAttribute('aria-hidden');
    player.inert = covered;
    if (covered) player.setAttribute('aria-hidden', 'true');
    else player.removeAttribute('aria-hidden');
    browseButton.setAttribute('aria-expanded', String(visible));
    $('#radialBackdropBrowse span').textContent = visible
      ? 'Now Playing'
      : 'Browse';
    browseButton.setAttribute('aria-label', visible ? 'Now Playing' : 'Browse');
    $('#windowViewLabel').hidden = !visible;
    $('.brand-divider').hidden = !visible;
    $('#windowViewLabel').textContent = visible
      ? nav.current.title === 'turnbit'
        ? 'BROWSE'
        : nav.current.title.toUpperCase()
      : '';
    // The full-window dismiss target would sit on top of the player's own controls in Split View.
    $('#radialBackdropDismiss').hidden = !visible || split;
    syncPlayerColumn(visible && split);
  }
  function revealDialOverlay() {
    if (!backdropActive()) return false;
    cancelMenuRewind();
    const opened = dialOverlay.show();
    if (nav.current.kind === 'now') {
      nav.dismissIdle();
      if (nav.current.kind === 'now') nav.back();
      // Like pressing from the widget's Now Playing, land on the song that is playing now.
      selectPlayingSong();
    }
    syncDialOverlay();
    return opened;
  }
  // Dial Menu Returns to Playlist: the menu rewinds to the list the playing song was chosen from, so
  // browsing elsewhere never costs you your place in the music. On the idle timeout the rewind is a
  // step to watch: the list flows in while the menu is still up, and the menu goes once it has been
  // seen. A close you asked for puts the player back at once and rewinds behind the fade instead,
  // where catching the switch halfway out would only look like a glitch.
  const MENU_FADE = 240;
  let rewindTimer = null;
  function cancelMenuRewind() {
    if (rewindTimer) clearTimeout(rewindTimer);
    rewindTimer = null;
    delete $('#radialLabels').dataset.rewind;
  }
  // The path is only worth rewinding to while the menu is somewhere else.
  function menuRewindPath() {
    const path = nav.musicPath;
    return preferences.menuReturnsToSource &&
      path?.length &&
      nav.current !== path[path.length - 1]
      ? path
      : null;
  }
  function rewindMenuToSource(animate = false) {
    const path = menuRewindPath();
    if (!path) return false;
    cancelMenuRewind();
    nav.stack = [...path];
    nav.dismissIdle();
    // A page change snaps the carousel onto its selected row, so the list arrives on the playing song.
    selectPlayingSong();
    drawNavigation();
    if (animate) {
      const labels = $('#radialLabels');
      // Clearing and reading back restarts the entrance even if the last rewind's attribute is still on.
      delete labels.dataset.rewind;
      void labels.offsetWidth;
      labels.dataset.rewind = 'true';
      syncDialOverlay();
    }
    return true;
  }
  function dismissDialOverlay() {
    dialOverlay.hide();
    cancelBackHold();
    syncDialOverlay();
    if (!menuRewindPath()) return;
    cancelMenuRewind();
    rewindTimer = setTimeout(() => {
      rewindTimer = null;
      // Reopening inside the fade means browsing again: leave the page where it was.
      if (!dialOverlay.visible) rewindMenuToSource();
    }, MENU_FADE);
  }
  function browseFromPlayer() {
    noteActivity();
    revealDialOverlay();
    drawNavigation();
  }

  function updateBackdropControls() {
    const { playing, demo, playback, likeRequests } = getState();

    const modes = playbackModes(),
      play = $('#radialBackdropPlay');
    play.dataset.playing = String(playing);
    play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    for (const key of ['like', 'shuffle', 'repeat']) {
      const button = document.querySelector(`[data-backdrop-command="${key}"]`);
      const active =
        key === 'like'
          ? modes.liked === true
          : key === 'shuffle'
            ? modes.shuffle
            : modes.repeat !== 'off';
      button.setAttribute('aria-pressed', String(active));
      button.dataset.repeat = modes.repeat;
      const label =
        key === 'like'
          ? active
            ? 'Remove from Liked Songs'
            : 'Save to Liked Songs'
          : key === 'shuffle'
            ? 'Shuffle ' + (active ? 'on' : 'off')
            : 'Repeat ' +
              ({ off: 'off', context: 'all', track: 'one song' }[
                modes.repeat
              ] || 'off');
      button.setAttribute('aria-label', label);
      button.title = label;
      if (key === 'like') {
        button.disabled =
          !demo &&
          !/^spotify:track:[A-Za-z0-9]{22}$/.test(playback?.item?.uri || '');
        button.setAttribute(
          'aria-busy',
          String(likeRequests > 0 || (!demo && !!playback?.likedPending)),
        );
      }
    }
  }
  function syncSpotifyLinks(demo, playback) {
    document.body.dataset.spotifyConnected = String(!demo);
    const selected =
      nav.current.kind === 'list' && (!backdropActive() || dialOverlay.visible)
        ? nav.current.rows[nav.current.selected]
        : null;
    const selectedUri = selected?.item?.uri || selected?.playlist?.uri;
    const match = /^spotify:(track|episode|playlist):([A-Za-z0-9]{22})$/.exec(
      selectedUri || playback?.item?.uri || '',
    );
    const href = match
      ? `https://open.spotify.com/${match[1]}/${match[2]}`
      : 'https://open.spotify.com/';
    const installed = document.body.dataset.spotifyInstalled !== 'false';
    const label = !installed
      ? 'GET SPOTIFY FREE'
      : selectedUri && match
        ? 'Open selected item in Spotify'
        : match
          ? 'Open current item in Spotify'
          : 'Open Spotify';
    for (const link of [$('#windowSpotifyLink'), $('#widgetSpotifyLink')]) {
      link.href = href;
      link.setAttribute('aria-label', label);
      link.title = label;
      link.querySelector('span').textContent = installed
        ? '↗'
        : 'GET SPOTIFY FREE';
    }
  }
  // A song change in the window player: decode the next cover first, then replace it
  // without animating the artwork. Text and ambient color may fade. Spotify can
  // report a new song before its cover arrives; hold the old song briefly then.
  const HOLD_FOR_ART_MS = 1200;
  let shownTrackKey = null,
    shownArtwork = '',
    trackGeneration = 0,
    holdingTitle = null,
    holdingSince = 0;
  function applyBackdropTrack(track, decoded = null) {
    renderSongTitle(
      $('#radialBackdropTitle'),
      $('#radialBackdropTitleDetail'),
      track.title,
    );
    for (const key of ['Artist', 'Album']) {
      const node = $('#radialBackdrop' + key);
      node.textContent = track[key.toLowerCase()];
      node.title = node.textContent;
    }
    const artwork = track.artwork;
    shownArtwork = artwork;
    // Swap in the image that was already decoded off screen, so the cover is ready the frame it appears.
    if (decoded) {
      const current = $('#radialBackdropArtImg');
      decoded.id = current.id;
      decoded.alt = current.alt;
      current.replaceWith(decoded);
    }
    $('#radialBackdropArtImg').hidden = !artwork;
    $('#radialBackdropArtImg').nextElementSibling.hidden = !!artwork;
    if (
      artwork &&
      $('#radialBackdropArtImg').src !== new URL(artwork, location.href).href
    )
      $('#radialBackdropArtImg').src = artwork;
    syncRadialGlow();
  }
  // Resolves with the decoded image, or null when there is none or it takes too long.
  function decodeArtwork(url) {
    if (!url) return Promise.resolve(null);
    const image = new Image();
    image.src = url;
    return Promise.race([
      image.decode().then(
        () => image,
        () => null,
      ),
      new Promise((resolve) => setTimeout(() => resolve(null), 900)),
    ]);
  }
  function syncBackdropTrack() {
    const { demo, playback } = getState(),
      track = { ...getState().track },
      key = [track.title, track.artist, track.album, track.artwork].join('|');
    if (key === shownTrackKey) return;
    if (shownTrackKey === null || radial.reducedMotion?.()) {
      trackGeneration++;
      shownTrackKey = key;
      applyBackdropTrack(track);
      return;
    }
    if (!demo && playback?.provisional && !track.artwork && shownArtwork) {
      if (holdingTitle !== track.title) {
        holdingTitle = track.title;
        holdingSince = Date.now();
      }
      if (Date.now() - holdingSince < HOLD_FOR_ART_MS) return;
    }
    holdingTitle = null;
    shownTrackKey = key;
    const generation = ++trackGeneration,
      sameSong = $('#radialBackdropTitle').title === track.title,
      parts = [
        $('.radial-backdrop-song'),
        $('#radialBackdropArt'),
        $('#radialGlow'),
      ];
    decodeArtwork(track.artwork).then(async (decoded) => {
      if (generation !== trackGeneration) return;
      // Only the artwork changes when Spotify fills in the cover for the song already shown.
      const moving = sameSong ? parts.slice(1) : parts;
      // The cover swaps as a static image; only metadata and ambient light animate.
      const out = moving.map((element) =>
        element.animate([{ opacity: 0 }], {
          duration: 200,
          easing: 'cubic-bezier(.4,0,.6,1)',
          fill: 'forwards',
        }),
      );
      await Promise.all(
        out.map((animation) => animation.finished.catch(() => {})),
      );
      if (generation !== trackGeneration) {
        out.forEach((animation) => animation.cancel());
        return;
      }
      applyBackdropTrack(track, decoded);
      out.forEach((animation) => animation.cancel());
      moving.forEach((element) =>
        element.animate([{ offset: 0, opacity: 0 }], {
          duration: 560,
          // The song text follows the cover by a beat.
          delay: element === parts[0] ? 60 : 0,
          easing: 'cubic-bezier(.25,.1,.25,1)',
          fill: 'backwards',
        }),
      );
    });
  }
  function updateBackdropInfo() {
    const { demo, playing, playback, volume } = getState();

    updateBackdropControls();
    $('.radial-backdrop-state .eq').dataset.playing = String(playing);
    const empty = !demo && !playback?.item;
    document.body.dataset.playerEmpty = String(empty);
    $('#radialBackdropState').textContent = demo
      ? 'DEMO · NO AUDIO'
      : empty
        ? 'NOT PLAYING'
        : playing
          ? 'PLAYING'
          : 'PAUSED';
    $('#radialBackdropDevice').textContent = demo
      ? 'Connect Spotify'
      : playback?.device?.name || 'Choose a device';
    syncBackdropTrack();
    $('#radialBackdropElapsed').textContent = time(currentProgress());
    $('#radialBackdropDuration').textContent = time(duration());
    const seekInput = $('#radialBackdropSeek');
    seekInput.max = Math.max(1, duration());
    if (document.activeElement !== seekInput)
      seekInput.value = currentProgress();
    $('#radialBackdropVolume').value = volume;
    $('#radialBackdropVolumeValue').textContent = volume + '%';
    for (const slider of [seekInput, $('#radialBackdropVolume')])
      slider.style.setProperty(
        '--fill',
        (Number(slider.value) / Number(slider.max)) * 100 + '%',
      );
  }
  let nativeLayoutKey = null;
  function syncNativeLayout() {
    if (preferences.interfaceStyle !== 'radial') {
      nativeLayoutKey = null;
      return;
    }
    const layout = radialLayoutNow();
    const key = JSON.stringify([preferences.radialSide, layout]);
    if (key === nativeLayoutKey) return;
    nativeLayoutKey = key;
    api?.setInterface?.('radial', preferences.radialSide, layout)?.catch(() => {
      if (nativeLayoutKey === key) nativeLayoutKey = null;
    });
  }
  function drawRadial() {
    const { demo, index, playback, playing, volume } = getState();
    syncSpotifyLinks(demo, playback);

    // Selection changes do not require a round trip to native window management.
    // Picker previews still update immediately when the actual geometry changes.
    syncNativeLayout();
    ensureBackRow(nav.current);
    ensureHomeLayout(nav.current);
    if (visibilityState.invisible || visibilityState.minimized) return;
    if (preferences.interfaceStyle !== 'radial') {
      radial.stop();
      trackTransition.reset();
      $('#radialBackdrop').hidden = true;
      document.body.dataset.backdropActive = 'false';
      syncDialOverlay();
      return;
    }
    const page = nav.current;
    const previewingSmoke =
      ['windowBackground', 'windowSmokeHue'].includes(page.key) &&
      ['color', 'visibility'].includes(page.kind);
    document.body.dataset.menuBackground = previewingSmoke
      ? 'match'
      : preferences.menuBackground;
    if (page.kind !== 'now') trackTransition.reset();
    // The backdrop already shows everything the compact Now Playing panel would, so that panel stays hidden while it's active.
    // Settle this first: the smoke and the label path below are measured against the menu's column width.
    const backdrop = backdropActive();
    $('#radialBackdrop').hidden = !backdrop;
    document.body.dataset.backdropActive = String(backdrop);
    syncDialOverlay();
    if (backdrop) updateBackdropInfo();
    $('#radial').dataset.page = page.kind;
    applyRadialColors();
    $('#radialColor').hidden = page.kind !== 'color';
    const { opacity: smoke, color: smokeColor } = smokeSettings();
    $('#radial').style.setProperty('--smoke-opacity', smoke);
    $('#radial').style.setProperty('--smoke-color', smokeColor);
    updateSmokeShape(smoke);
    syncRadialGlow();
    // Height under 100% leaves the window's top and/or bottom inside the screen: fade the backdrop there too.
    const short = preferences.radialHeight < 100,
      v = preferences.radialVertical;
    $('#radial').dataset.fadeTop = String(short && v !== 'top');
    $('#radial').dataset.fadeBottom = String(short && v !== 'bottom');
    $('#radialStatus').dataset.playing = String(page.kind === 'now' && playing);
    $('#radialNow').hidden = page.kind !== 'now' || backdrop;
    $('#radialLabels').hidden = ['now', 'color'].includes(page.kind);
    $('#radialContext').hidden = page.kind === 'now';
    $('#radialContext').textContent =
      page.title === 'turnbit' ? 'SPOTIFY / TURNBIT' : page.title.toUpperCase();
    $('#radialStatus').textContent =
      page.kind === 'list'
        ? page.rows.length
          ? `${String(page.selected + 1).padStart(2, '0')} / ${String(page.rows.length).padStart(2, '0')}`
          : ''
        : page.kind === 'now'
          ? `${playing ? 'PLAYING' : 'PAUSED'}  ·  ${time(currentProgress())} / ${time(duration())}  ·  VOL ${volume}`
          : 'TURN TO ADJUST · PRESS TO SAVE';
    if ($('#actionNotice')?.textContent || '')
      $('#radialStatus').textContent = $('#actionNotice')?.textContent || '';
    if (page.kind === 'color') {
      radial.stop();
      $('#radialColor').setAttribute('aria-label', page.title);
      syncColorPalette(page);
      $('#radialColorValue').textContent = radialColorName(page.value);
      $('#radialColorSample').style.webkitTextStroke =
        page.value === -1 ? '1px #ffffff60' : '';
      $('#radialColorSample').style.color = radialColor(
        page.value,
        page.key !== 'primaryHue',
      );
    } else if (page.kind === 'list')
      radial.update(page, page.rows, page.selected, {
        resolve: (row, i) => ({
          label: row.label,
          icon: row.action === 'now' && playing ? 'playing' : row.icon,
          control: row.control,
          detail: radialRowDetail(row),
          disabled: row.disabled,
          mini: radialMiniPlayer(row),
          playlistArt:
            row.action === 'playlist' && i === page.selected
              ? row.playlist?.artwork
              : '',
        }),
        miniIndices: currentMiniIndices(page),
      });
    else if (page.kind === 'now') {
      radial.stop();
      if (backdrop) trackTransition.reset();
      else
        trackTransition.update(
          [
            demo ? 'demo:' + index : playback?.item?.uri,
            getState().track.title,
            getState().track.artist,
            getState().track.album,
            getState().track.artwork,
          ].join('|'),
        );
      const track = getState().track;
      $('#radialNow .eq').dataset.playing = String(playing);
      renderSongTitle($('#radialTitle'), $('#radialTitleDetail'), track.title);
      for (const key of ['Artist', 'Album']) {
        const node = $('#radial' + key);
        node.textContent = track[key.toLowerCase()];
        node.title = node.textContent;
      }
      const artwork = track.artwork;
      $('#radialArt').hidden = !artwork;
      $('#radialArtFallback').hidden = !!artwork;
      if (artwork && $('#radialArt').src !== artwork)
        $('#radialArt').src = artwork;
      $('#radialElapsed').textContent = time(currentProgress());
      $('#radialDuration').textContent = time(duration());
      const seekInput = $('#radialSeek');
      seekInput.max = Math.max(1, duration());
      if (document.activeElement !== seekInput)
        seekInput.value = currentProgress();
      $('#radialVolume').value = volume;
      $('#radialVolumeValue').textContent = volume + '%';
      for (const slider of [seekInput, $('#radialVolume')])
        slider.style.setProperty(
          '--fill',
          (Number(slider.value) / Number(slider.max)) * 100 + '%',
        );
      $('#radialStatus').textContent =
        $('#actionNotice')?.textContent ||
        '' ||
        (playing ? 'PLAYING' : 'PAUSED');
    } else
      radial.update(
        page,
        [
          { label: page.title },
          {
            label:
              page.kind === 'volume'
                ? volume + '%'
                : valueText(page.key, page.value),
          },
          { label: 'Press to save' },
        ],
        1,
      );
  }

  return {
    radialColor,
    radialColorName,
    applyRadialColors,
    radialRowDetail,
    radialMiniPlayer,
    syncRadialGlow,
    updateSmokeShape,
    currentMiniIndices,
    backdropActive,
    splitActive,
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
    updateBackdropInfo,
    drawRadial,
  };
}
