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
  SPLIT_HAZE_SPILL,
}) {
  function radialColor(hue, accent = false) {
    return hue === 360 ? '#eef7f5' : `hsl(${hue} 75% ${accent ? 68 : 79}%)`;
  }
  function radialColorName(hue) {
    return hue === 360
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
  function applyRadialColors() {
    const page = nav.current;
    for (const key of ['primaryHue', 'accentHue']) {
      const hue =
        page.kind === 'color' && page.key === key
          ? page.value
          : preferences[key];
      $('#radial').style.setProperty(
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
  // Ambient glow behind the middle of the menu, tinted by whatever is playing: the artwork is reused as
  // the source rather than sampled, so it needs no pixel access, and the CSS mask does the fading. It
  // belongs to the window player's artwork atmosphere; the floating widget keeps its plain dark haze.
  const GLOW_STRENGTH = 0.3;
  function syncRadialGlow() {
    const glow = $('#radialGlow'),
      source = backdropActive() ? getState().track.artwork : '';
    if (syncRadialGlow.source !== source) {
      syncRadialGlow.source = source;
      glow.style.backgroundImage = source
        ? `url(${JSON.stringify(source)})`
        : 'none';
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
  function updateSmokeShape(
    opacity = updateSmokeShape.opacity ?? preferences.radialBackground / 100,
  ) {
    updateSmokeShape.opacity = opacity;
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
    const context = canvas.getContext('2d'),
      image = context.createImageData(w, h),
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
  // window. Two columns need room, so a window narrower than SPLIT_MIN_WIDTH uses the overlay instead.
  function splitActive() {
    return (
      backdropActive() &&
      preferences.backdropLayout === 'split' &&
      innerWidth >= SPLIT_MIN_WIDTH
    );
  }
  // Overlay: the menu is alone on screen while browsing, so it reaches in from its docked edge to put
  // the selected row near the middle of the window, and its labels bow further out along the way.
  function wideMenu() {
    return backdropActive() && !splitActive();
  }
  function backdropLayoutName() {
    return preferences.backdropLayout === 'split' ? 'Split View' : 'Overlay';
  }
  // The player stacks artwork above its text when its column is too narrow to hold both side by side:
  // the whole window, or the half left over while Split View has the menu up beside it.
  function syncPlayerColumn(sharing = false) {
    const column = sharing
      ? Math.max(0, innerWidth - ($('#radial')?.clientWidth || 0))
      : innerWidth;
    document.body.dataset.playerColumn =
      column <= SPLIT_MIN_WIDTH ? 'narrow' : 'wide';
  }
  function syncDialOverlay() {
    const active = backdropActive(),
      split = splitActive();
    const visible = active && dialOverlay.visible && nav.current.kind !== 'now';
    // Overlay covers the player with the menu; Split View sets it beside the menu instead.
    const covered = visible && !split;
    document.body.dataset.dialOverlay = String(visible);
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
    $('#windowViewLabel').textContent = visible
      ? nav.current.title === 'turnbit'
        ? 'BROWSE'
        : nav.current.title.toUpperCase()
      : 'NOW PLAYING';
    // The full-window dismiss target would sit on top of the player's own controls in Split View.
    $('#radialBackdropDismiss').hidden = !visible || split;
    syncPlayerColumn(visible && split);
  }
  function revealDialOverlay() {
    if (!backdropActive()) return false;
    const opened = dialOverlay.show();
    if (nav.current.kind === 'now') {
      nav.dismissIdle();
      if (nav.current.kind === 'now') nav.back();
    }
    syncDialOverlay();
    return opened;
  }
  function dismissDialOverlay() {
    dialOverlay.hide();
    cancelBackHold();
    syncDialOverlay();
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
  function updateBackdropInfo() {
    const { demo, playing, playback, volume } = getState();

    updateBackdropControls();
    $('#radialBackdropState').textContent = demo
      ? 'DEMO · NO AUDIO'
      : playing
        ? 'PLAYING'
        : 'PAUSED';
    $('#radialBackdropDevice').textContent = demo
      ? 'Connect Spotify'
      : playback?.device?.name || 'Choose a device';
    const track = getState().track;
    for (const key of ['Title', 'Artist', 'Album']) {
      const node = $('#radialBackdrop' + key);
      node.textContent = track[key.toLowerCase()];
      node.title = node.textContent;
    }
    const artwork = track.artwork;
    $('#radialBackdropArtImg').hidden = !artwork;
    $('#radialBackdropArtImg').nextElementSibling.hidden = !!artwork;
    if (artwork) {
      if ($('#radialBackdropArtImg').src !== artwork)
        $('#radialBackdropArtImg').src = artwork;
      $('#radialBackdropArt').style.backgroundImage =
        `url(${JSON.stringify(artwork)})`;
    } else $('#radialBackdropArt').style.backgroundImage = 'none';
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
    const haze =
      page.kind === 'visibility' && page.key === 'radialBackground'
        ? page.value
        : preferences.radialBackground;
    const smoke = haze / 100;
    $('#radial').style.setProperty('--smoke-opacity', smoke);
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
      $('#radialColorLabel').textContent = page.title;
      $('#radialHue').value = page.value;
      $('#radialColorValue').textContent = radialColorName(page.value);
      $('#radialColorSwatch').style.background = radialColor(
        page.value,
        page.key === 'accentHue',
      );
    } else if (page.kind === 'list')
      radial.update(page, page.rows, page.selected, {
        resolve: (row) => ({
          label: row.label,
          icon: row.icon,
          control: row.control,
          detail: radialRowDetail(row),
          disabled: row.disabled,
          mini: radialMiniPlayer(row),
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
      $('#radialTitle').textContent = track.title;
      $('#radialArtist').textContent = track.artist;
      $('#radialAlbum').textContent = track.album;
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
                : page.key === 'timeout'
                  ? page.value + ' seconds'
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
    syncPlayerColumn,
    syncDialOverlay,
    revealDialOverlay,
    dismissDialOverlay,
    browseFromPlayer,
    updateBackdropControls,
    updateBackdropInfo,
    drawRadial,
  };
}
