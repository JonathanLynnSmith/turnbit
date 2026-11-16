export function createLibraryController({
  $,
  preferences,
  nav,
  api,
  getState,
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
  createCache,
}) {
  const likedSongs = createCache();
  let lastLiked = null,
    lastSongListPage = null,
    pendingSkipFollow = null;
  // Pages use the library contract: {items, total, nextOffset}. Demo pages add
  // the demo index each entry plays.
  function demoLibrary(kind, playlist) {
    if (kind === 'playlists')
      return {
        items: [
          { id: 'demo-night', name: 'After Hours', demoIndexes: [0, 1] },
          { id: 'demo-sunday', name: 'Slow Days', demoIndexes: [2] },
        ],
        nextOffset: null,
      };
    const indexes = playlist?.demoIndexes || demos.map((_, i) => i);
    return {
      items: indexes.map((i) => ({
        kind: 'track',
        track: demoTrack(i),
        demoIndex: i,
      })),
      nextOffset: null,
    };
  }
  // The playlist a row opens or plays. Saved preferences keep this shape.
  function playlistReference(entry) {
    return entry.kind === 'collection'
      ? {
          id: entry.id,
          uri: entry.playbackId,
          name: entry.title,
          artwork: entry.artwork,
        }
      : entry;
  }
  function moreRow(offset) {
    return {
      label: 'Load more',
      action: 'more',
      offset,
      icon: 'more',
      control: true,
    };
  }
  function libraryRows(page, items, offset) {
    const { demo } = getState();
    return items.map((entry, i) => {
      if (page.libraryKind === 'playlists') {
        const playlist = playlistReference(entry);
        return {
          label: playlist.name || 'Untitled playlist',
          action: 'playlist',
          playlist,
          branch: true,
        };
      }
      const track = entry.track;
      return {
        label: track?.title || 'Unavailable item',
        action: 'song',
        track,
        position: offset + i,
        contextUri: page.playlist?.uri,
        demoIndex: entry.demoIndex,
        queue: page.playlist?.demoIndexes,
        disabled: !demo && (!track || entry.playable === false),
        detail: time(track?.durationMs || 0),
      };
    });
  }
  function showCachedSongs(page, data) {
    const selectedId = page.rows[page.selected]?.track?.id,
      items = data.items || [];
    page.total = data.total;
    page.rows = libraryRows(page, items, 0);
    if (data.next) page.rows.push(moreRow(items.length));
    if (!page.rows.length)
      page.rows = [{ label: 'No items found', disabled: true }];
    const index = selectedId
      ? page.rows.findIndex((row) => row.track?.id === selectedId)
      : -1;
    page.selected =
      index >= 0 ? index : Math.min(page.selected, page.rows.length - 1);
    if (nav.current === page) drawNavigation();
  }
  function likedSongPages() {
    return [
      ...new Set(
        [
          ...nav.stack,
          ...(Array.isArray(nav.musicPath) ? nav.musicPath : []),
          lastSongListPage,
        ].filter((page) => page?.libraryKind === 'songs' && !page.loading),
      ),
    ];
  }
  function syncLikedSongPages() {
    const data = likedSongs.snapshot();
    if (data) for (const page of likedSongPages()) showCachedSongs(page, data);
  }
  async function refreshLikedSongs(page) {
    if (likedSongs.isFresh() || page.refreshing) return;
    page.refreshing = true;
    try {
      if (
        likedSongs.applyFirstPage(
          await api.library.page({ kind: 'songs', offset: 0 }),
        )
      )
        syncLikedSongPages();
    } catch (e) {
      if (nav.current === page) message(e.message);
    } finally {
      page.refreshing = false;
    }
  }
  async function loadLibrary(page, offset = 0) {
    const { demo } = getState();

    if (!demo && page.libraryKind === 'songs' && !offset) {
      const cached = likedSongs.snapshot();
      if (cached) {
        showCachedSongs(page, cached);
        refreshLikedSongs(page);
        return;
      }
    }
    if (page.loading) return;
    page.loading = true;
    const baseRows = page.rows.filter((row) =>
      offset
        ? !['more', 'retry', 'placeholder'].includes(row.action)
        : ['nav-back', 'play-playlist'].includes(row.action),
    );
    if (!offset)
      page.rows = [
        ...baseRows,
        { label: 'Loading…', action: 'placeholder', disabled: true },
      ];
    else {
      const more = page.rows.find(
        (row) => row.action === 'more' && row.offset === offset,
      );
      if (more) more.label = 'Loading…';
    }
    if (nav.current === page) drawNavigation();
    try {
      const data = demo
        ? demoLibrary(page.libraryKind, page.playlist)
        : await api.library.page({
            kind: page.libraryKind,
            id: page.playlist?.id,
            offset,
          });
      page.total = data.total;
      if (!demo && page.libraryKind === 'songs') {
        if (offset) likedSongs.appendPage(offset, data);
        else likedSongs.applyFirstPage(data);
      }
      const rows = libraryRows(page, data.items || [], offset);
      page.rows = [...baseRows, ...rows];
      if (data.nextOffset != null) page.rows.push(moreRow(data.nextOffset));
      if (offset && rows.length) page.selected = baseRows.length;
      // The Back row is not an item: an empty list still says so.
      if (!page.rows.some((row) => row.action !== 'nav-back'))
        page.rows = [...page.rows, { label: 'No items found', disabled: true }];
    } catch (e) {
      page.rows = [
        ...baseRows,
        { label: 'Retry loading', action: 'retry', offset, branch: true },
      ];
      if (nav.current === page)
        message(
          e.status === 403
            ? 'Spotify denied browsing. Reconnect for library permissions; playlist contents require ownership or collaboration.'
            : e.message,
        );
    } finally {
      page.loading = false;
      page.selected = Math.min(
        page.selected,
        Math.max(0, page.rows.length - 1),
      );
      if (nav.current === page) drawNavigation();
      if (page.selectPlayingOnLoad) {
        page.selectPlayingOnLoad = false;
        selectPlayingSong(page);
      }
    }
  }
  function rememberSongList(page) {
    if (!['songs', 'playlist'].includes(page.libraryKind)) return;
    lastSongListPage = page;
    const source = cleanLastSongList({
      kind: page.libraryKind,
      name: page.playlist?.name || 'Liked Songs',
      playlist: page.playlist,
    });
    if (JSON.stringify(source) !== JSON.stringify(preferences.lastSongList))
      savePreferences({ lastSongList: source });
    const home = nav.stack[0],
      row = home.rows.find((row) => row.action === 'last-song-list');
    if (row) Object.assign(row, lastSongListRow());
    else home.rows.push(lastSongListRow());
  }
  function openLastSongList() {
    if (lastSongListPage && !lastSongListPage.loading) {
      const page = push(lastSongListPage);
      lastSongListPage = page;
      nav.rememberMusic();
      return;
    }
    const source = preferences.lastSongList;
    if (source) showLibrary(source.kind, source.playlist);
  }
  function selectPlayingSong(page = nav.current) {
    if (!['songs', 'playlist'].includes(page?.libraryKind)) return false;
    if (page.loading) {
      page.selectPlayingOnLoad = true;
      return false;
    }
    const current = page.rows.findIndex(isCurrentSong);
    if (current < 0 || current === page.selected) return false;
    page.selected = current;
    if (nav.current !== page) return true;
    radial.animateTo(current);
    drawNavigation();
    return true;
  }
  function followSkippedSong() {
    const { demo, index, playback } = getState();

    const pending = pendingSkipFollow,
      key = demo ? 'demo:' + index : playback?.track?.id;
    if (!pending) return;
    if (Date.now() > pending.until || pending.page !== nav.current) {
      pendingSkipFollow = null;
      return;
    }
    if (!key || key === pending.key) return;
    pendingSkipFollow = null;
    const page = nav.current;
    if (!['songs', 'playlist'].includes(page.libraryKind)) return;
    const current = page.rows.findIndex(isCurrentSong);
    if (current < 0) return;
    page.selected = current;
    if (visibilityState.invisible || visibilityState.minimized)
      radial.snapTo(current);
    drawNavigation();
  }
  function followIdleSong(faded = false) {
    const { demo, index, playing, progress, playback, lastVisualActivity } =
      getState();

    if (backdropActive() && !dialOverlay.visible) return;
    const page = nav.current,
      fade = preferences.visibility;
    // Fully hidden widgets follow the native fade completion, before their next reveal.
    const wait = fade.mode === 'idle' ? fade.timeout * 1000 + 650 : 10000;
    const ready =
      faded ||
      (fade.mode === 'idle' && fade.idleOpacity === 0
        ? visibilityState.invisible
        : Date.now() - lastVisualActivity >= wait);
    if (
      preferences.idlePinned ||
      page.kind !== 'list' ||
      !['songs', 'playlist'].includes(page.libraryKind) ||
      page.loading ||
      $('#settings').open ||
      !ready ||
      !(demo ? playing || progress > 0 : playback?.track)
    )
      return;
    const key = demo ? 'demo:' + index : playback?.track?.id,
      last = followIdleSong.last;
    if (last?.page === page && last.rows === page.rows && last.key === key)
      return;
    followIdleSong.last = { page, rows: page.rows, key };
    const current = page.rows.findIndex(isCurrentSong);
    if (current < 0 || current === page.selected) return;
    page.selected = current;
    radial.animateTo(current);
    drawNavigation();
  }
  function showLibrary(kind, playlist) {
    const { demo } = getState();

    const page = push({
      title:
        playlist?.name || (kind === 'playlists' ? 'Playlists' : 'Liked Songs'),
      libraryKind: kind,
      playlist,
      rows: playlist
        ? [{ label: 'Play this playlist', action: 'play-playlist', playlist }]
        : [],
      hint:
        kind === 'playlists'
          ? 'Select a playlist to see its songs'
          : demo
            ? 'Demo songs · press to play'
            : 'Press to play · MENU goes back',
    });
    nav.rememberMusic();
    rememberSongList(page);
    loadLibrary(page);
  }
  return {
    demoLibrary,
    moreRow,
    libraryRows,
    showCachedSongs,
    likedSongPages,
    syncLikedSongPages,
    refreshLikedSongs,
    loadLibrary,
    rememberSongList,
    openLastSongList,
    selectPlayingSong,
    followSkippedSong,
    followIdleSong,
    showLibrary,
    expectSkip() {
      const { demo, index, playback } = getState();
      pendingSkipFollow = {
        page: nav.current,
        key: demo ? 'demo:' + index : playback?.track?.id,
        until: Date.now() + 20000,
      };
    },
    acceptPlayback(state) {
      const { demo } = getState();
      if (
        !demo &&
        state?.track?.id &&
        !state.provisional &&
        !state.likedPending &&
        typeof state.liked === 'boolean'
      ) {
        if (
          lastLiked?.id === state.track.id &&
          lastLiked.liked !== state.liked &&
          likedSongs.setLiked(state.track, state.liked)
        )
          syncLikedSongPages();
        lastLiked = { id: state.track.id, liked: state.liked };
      }
    },
    clear() {
      likedSongs.clear();
      lastLiked = null;
      lastSongListPage = null;
      pendingSkipFollow = null;
    },
    get followStamp() {
      return followIdleSong.last;
    },
    set followStamp(value) {
      followIdleSong.last = value;
    },
  };
}
