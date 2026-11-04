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
  function renderPlaybackIndicators() {
    const { likeRequests, demo, playback } = getState();

    const { liked, shuffle, repeat } = playbackModes();
    updateBackdropControls();
    const paths = {
      shuffle:
        '<path d="M3 5h3c5 0 7 14 12 14h3m-4-4 4 4-4 4M3 19h3c2 0 4-3 6-7s4-7 6-7h3m-4-4 4 4-4 4"/>',
      repeat:
        '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/><text class="repeat-one" x="12" y="15" text-anchor="middle">1</text>',
    };
    for (const host of [document.querySelector('#radialNow .radial-track')]) {
      let bar = host.querySelector('.playback-indicators');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'playback-indicators';
        for (const key of ['like', 'shuffle', 'repeat']) {
          const icon = document.createElement('span');
          icon.dataset.mode = key;
          icon.setAttribute('role', 'img');
          icon.innerHTML =
            key === 'like'
              ? '<span class="spotify-like-off" aria-hidden="true"></span><span class="spotify-like-on" aria-hidden="true"></span>'
              : '<svg viewBox="0 0 24 24" aria-hidden="true">' +
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
              ? 'Saved to Liked Songs'
              : liked === false
                ? 'Not saved to Liked Songs'
                : 'Save status unavailable'
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
    drawRadial();
  }
  return {
    isCurrentSong,
    renderPlaybackIndicators,
    syncGamingMode,
    renderProgress,
    render,
    invalidate() {
      renderStamp = null;
    },
  };
}
