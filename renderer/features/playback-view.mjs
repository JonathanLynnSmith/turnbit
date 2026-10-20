export function createPlaybackView({
  $,
  preferences,
  nav,
  radial,
  visibilityState,
  getState,
  demos,
  duration,
  currentProgress,
  time,
  setMarquee,
  drawRadial,
  radialMiniPlayer,
  backdropActive,
  playbackModes,
  updateBackdropControls,
}) {
  let renderStamp = null;
  function isCurrentSong(row) {
    const { demo, index, playback } = getState();

    if (row.action !== 'song') return false;
    if (demo) return row.demoIndex === index;
    const current = playback?.item;
    const uris = [current?.uri, current?.linked_from?.uri].filter(Boolean);
    return [row.item?.uri, row.item?.linked_from?.uri].some(
      (uri) => uri && uris.includes(uri),
    );
  }
  function updateTrackIndicators() {
    const { playing } = getState();

    if (preferences.interfaceStyle === 'radial' || nav.current.kind !== 'list')
      return;
    nav.current.rows.forEach((row, i) => {
      const button = $('#menuList').children[i];
      if (!button) return;
      const matches = isCurrentSong(row);
      button.classList.toggle('current-track', matches);
      const marker = button.querySelector('.track-indicator');
      if (marker) {
        marker.textContent = matches ? (playing ? '▶' : 'Ⅱ') : '';
        marker.title = matches
          ? playing
            ? 'Currently playing'
            : 'Current song · paused'
          : '';
      }
      button.setAttribute(
        'aria-label',
        `${row.label}${matches ? (playing ? ', currently playing' : ', current song, paused') : ''}`,
      );
    });
  }
  function renderPlaybackIndicators() {
    const { likeRequests, demo, playback } = getState();

    const { liked, shuffle, repeat } = playbackModes();
    updateBackdropControls();
    const paths = {
      like: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
      shuffle:
        '<path d="M3 5h3c5 0 7 14 12 14h3m-4-4 4 4-4 4M3 19h3c2 0 4-3 6-7s4-7 6-7h3m-4-4 4 4-4 4"/>',
      repeat:
        '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/><text class="repeat-one" x="12" y="15" text-anchor="middle">1</text>',
    };
    for (const host of [
      document.querySelector('#radialNow .radial-track'),
      document.querySelector('#nowView .now-meta'),
    ]) {
      let bar = host.querySelector('.playback-indicators');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'playback-indicators';
        for (const key of ['like', 'shuffle', 'repeat']) {
          const icon = document.createElement('span');
          icon.dataset.mode = key;
          icon.setAttribute('role', 'img');
          icon.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            paths[key] +
            '</svg>';
          bar.append(icon);
        }
        host.append(bar);
      }
      for (const icon of bar.children) {
        const key = icon.dataset.mode,
          active =
            key === 'like'
              ? liked === true
              : key === 'shuffle'
                ? shuffle
                : repeat !== 'off';
        const label =
          key === 'like'
            ? liked === true
              ? 'Liked song'
              : liked === false
                ? 'Not liked'
                : 'Like status unavailable'
            : key === 'shuffle'
              ? 'Shuffle ' + (shuffle ? 'on' : 'off')
              : 'Repeat ' +
                ({ off: 'off', context: 'all', track: 'one song' }[repeat] ||
                  'off');
        icon.dataset.pending = String(
          key === 'like' &&
            (likeRequests > 0 || (!demo && !!playback?.likedPending)),
        );
        icon.dataset.active = String(active);
        icon.dataset.repeat = repeat;
        icon.title = label;
        icon.setAttribute('aria-label', label);
      }
    }
  }
  function syncGamingMode() {
    const { lastVisualActivity } = getState();
    document.body.dataset.gamingIdle = String(
      preferences.gamingMode && Date.now() - lastVisualActivity > 1500,
    );
  }
  function renderProgress(force = false) {
    const { playing } = getState();

    if (
      (!playing && !force) ||
      visibilityState.invisible ||
      visibilityState.minimized
    )
      return;
    const position = currentProgress(),
      length = Math.max(1, duration());
    const text = (selector, value) => {
      const node = $(selector);
      if (node.textContent !== value) node.textContent = value;
    };
    if (preferences.interfaceStyle !== 'radial' && nav.current.kind === 'now') {
      $('#seek').value = position;
      $('#seek').style.setProperty('--fill', (position / length) * 100 + '%');
      text('#elapsed', time(position));
      text('#duration', '−' + time(Math.max(0, length - position)));
    }
    if (preferences.interfaceStyle === 'radial') {
      if (nav.current.kind === 'now') {
        const input = $('#radialSeek');
        if (document.activeElement !== input) {
          input.value = position;
          input.style.setProperty('--fill', (position / length) * 100 + '%');
        }
        text('#radialElapsed', time(position));
      } else if (nav.current.kind === 'list') {
        for (const [i, node] of radial.nodes) {
          if (node.classList.contains('has-mini'))
            radial.renderMini(node, radialMiniPlayer(nav.current.rows[i]));
        }
      }
      if (backdropActive()) {
        const input = $('#radialBackdropSeek');
        if (document.activeElement !== input) {
          input.value = position;
          input.style.setProperty('--fill', (position / length) * 100 + '%');
        }
        text('#radialBackdropElapsed', time(position));
      }
    }
  }
  function render() {
    const {
      demo,
      index,
      playing,
      volume,
      playback,
      demoLikes,
      demoShuffle,
      demoRepeat,
      likeRequests,
      demoQueue,
    } = getState();

    if (visibilityState.invisible || visibilityState.minimized) return;
    const stamp = [
      demo,
      index,
      demos[index]?.name,
      demos[index]?.artist,
      demos[index]?.album,
      playing,
      volume,
      playback?.item?.uri,
      playback?.item?.name,
      playback?.item?.album?.name,
      playback?.item?.album?.images?.[0]?.url,
      playback?.item?.artists?.map((a) => a.name).join(', '),
      playback?.item?.duration_ms,
      playback?.device?.name,
      playback?.liked,
      playback?.likedPending,
      playback?.shuffle_state,
      playback?.repeat_state,
      demoShuffle,
      demoRepeat,
      demoLikes.has(index),
      likeRequests,
      nav.current,
      nav.current.rows,
      nav.current.selected,
      nav.current.value,
      preferences.interfaceStyle,
      preferences.primaryHue,
      preferences.accentHue,
      innerWidth,
      innerHeight,
    ];
    if (renderStamp && stamp.every((value, i) => value === renderStamp[i])) {
      renderProgress(true);
      return;
    }
    renderStamp = stamp;
    renderPlaybackIndicators();
    const track = demo ? demos[index] : playback?.item;
    const name = track?.name || 'Nothing playing',
      artist = demo
        ? track.artist
        : track?.artists?.map((a) => a.name).join(', ') ||
          'Open Spotify to start listening';
    $('#source').textContent = demo ? 'DEMO' : 'SPOTIFY';
    $('#playing').textContent = playing ? 'Playing' : 'Paused';
    $('#playing').dataset.symbol = playing ? '▶' : 'Ⅱ';
    $('#playing').title = playing ? 'Playing' : 'Paused';
    setMarquee($('#title'), name);
    setMarquee($('#artist'), artist);
    setMarquee($('#album'), demo ? track.album : track?.album?.name || '');
    const artwork = !demo && track?.album?.images?.[0]?.url;
    $('#art').hidden = !artwork;
    $('#artFallback').hidden = !!artwork;
    if (artwork && $('#art').src !== artwork) $('#art').src = artwork;
    $('#previewArt').hidden = !artwork;
    $('#previewFallback').hidden = !!artwork;
    if (artwork && $('#previewArt').src !== artwork)
      $('#previewArt').src = artwork;
    $('#previewTitle').textContent = name;
    $('#previewTitle').title = name;
    $('#previewArtist').textContent = artist;
    $('#previewArtist').title = artist;
    $('#trackNumber').textContent = demo
      ? `${Math.max(0, demoQueue.indexOf(index)) + 1} of ${demoQueue.length}`
      : '';
    const playlistPage = nav.stack.findLast(
      (page) =>
        page.libraryKind === 'playlist' &&
        page.playlist?.uri &&
        page.playlist.uri === playback?.context?.uri,
    );
    const playlistRow = playlistPage?.rows.find(isCurrentSong);
    if (!demo && playlistRow && playlistPage.total)
      $('#trackNumber').textContent =
        `${playlistRow.position + 1} of ${playlistPage.total}`;
    $('#seek').max = Math.max(1, duration());
    $('#seek').value = currentProgress();
    $('#elapsed').textContent = time(currentProgress());
    $('#duration').textContent = `−${time(duration() - currentProgress())}`;
    $('#volume').value = volume;
    $('#volumeValue').textContent = `${volume}%`;
    $('#adjustVolume').value = volume;
    $('#adjustValue').textContent = `${volume}%`;
    for (const slider of [$('#seek'), $('#volume'), $('#adjustVolume')])
      slider.style.setProperty(
        '--fill',
        `${(Number(slider.value) / Math.max(1, Number(slider.max))) * 100}%`,
      );
    $('#deviceBtn').textContent = demo
      ? 'Demo playback · no audio'
      : `Playing on ${playback?.device?.name || 'select a device'}`;
    $('#connect').textContent = demo ? 'Connect Spotify' : 'Spotify settings';
    updateTrackIndicators();
    drawRadial();
  }
  return {
    isCurrentSong,
    updateTrackIndicators,
    renderPlaybackIndicators,
    syncGamingMode,
    renderProgress,
    render,
    invalidate() {
      renderStamp = null;
    },
  };
}
