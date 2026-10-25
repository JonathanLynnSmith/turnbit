// Migration adapter for the existing screens. New views can consume
// turnbit.playback directly; only these older views need the old field names.
(() => {
  function legacyTrack(track) {
    if (!track) return null;
    return {
      uri: track.id,
      ...(track.linkedId ? { linked_from: { uri: track.linkedId } } : {}),
      ...(track.publisher ? { publisher: track.publisher } : {}),
      name: track.title,
      artists: track.artists.map((name) => ({ name })),
      album: { name: track.album.title, images: track.album.artwork },
      duration_ms: track.durationMs,
      is_local: track.local,
      type: track.kind,
    };
  }
  function legacyPlayback(state) {
    if (!state) return null;
    return {
      item: legacyTrack(state.track),
      is_playing: state.playing,
      progress_ms: Math.min(
        state.track?.durationMs || 0,
        state.positionMs +
          (state.playing ? Math.max(0, Date.now() - state.observedAt) : 0),
      ),
      device: state.device
        ? {
            id: state.device.id,
            name: state.device.name,
            type: state.device.type,
            volume_percent: state.device.volume,
            is_restricted: state.device.restricted,
          }
        : null,
      context: state.context ? { uri: state.context.id } : null,
      liked: state.liked,
      likedPending: state.likedPending,
      likeError: state.likeError,
      shuffle_state: state.shuffle,
      repeat_state: { off: 'off', all: 'context', one: 'track' }[state.repeat],
      provisional: state.provisional,
      localSession: state.transport === 'local',
    };
  }
  function playItem(value) {
    const item = value?.item;
    return {
      trackId: value?.uri,
      contextId: value?.contextUri,
      position: value?.position,
      track: item
        ? {
            id: item.uri,
            linkedId: item.linked_from?.uri || null,
            publisher: item.publisher || '',
            title: item.name,
            artists: (item.artists || []).map((artist) => artist.name),
            album: {
              title: item.album?.name || '',
              artwork: item.album?.images || [],
            },
            durationMs: item.duration_ms || 0,
            local: !!item.is_local,
            kind: item.type || 'track',
          }
        : undefined,
    };
  }
  function createPlaybackClient(api) {
    if (!api) return undefined;
    return {
      ...api,
      state: () => api.playback.refresh(),
      library: async (kind, id, offset = 0) => {
        const page = await api.library.page({ kind, id, offset });
        return {
          items: page.items.map((entry) =>
            entry.kind === 'collection'
              ? {
                  id: entry.id,
                  uri: entry.playbackId,
                  name: entry.title,
                  artwork: entry.artwork,
                }
              : {
                  item: {
                    ...legacyTrack(entry.track),
                    is_playable: entry.playable,
                  },
                },
          ),
          total: page.total,
          next: page.nextOffset !== null,
        };
      },
      command: (command, value) =>
        api.playback.command(
          command,
          command === 'play-item' ? playItem(value) : value,
        ),
      onState: (callback) =>
        api.playback.onEvent((event) => {
          if (event.type === 'state') callback(legacyPlayback(event.state));
          else if (event.type === 'device-recovered')
            callback({ recoveredDevice: event.device });
          else if (event.type === 'notice')
            callback({ recoveryMessage: event.message });
          else if (event.type === 'error') callback({ error: event.message });
        }),
    };
  }
  if (typeof module !== 'undefined')
    module.exports = { createPlaybackClient, legacyPlayback };
  else window.createPlaybackClient = createPlaybackClient;
})();
