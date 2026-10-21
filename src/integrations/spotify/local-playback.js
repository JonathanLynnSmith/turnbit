const sameTrack = (item, local) =>
  !!item?.name &&
  !!local?.title &&
  item.name.trim().toLowerCase() === local.title.trim().toLowerCase();
function createLocalPlayback({
  getMedia,
  getState,
  getPending,
  connected,
  scheduleRefresh,
  publish,
}) {
  let lastLocal = null;
  // Local state is trusted only when Spotify reports playback on a computer, so phone or speaker playback stays on the Web API.
  function localTrusted(web = getState()) {
    return !!(getMedia()?.state?.available && web?.device?.type === 'Computer');
  }
  function localMismatch(web = getState()) {
    return (
      localTrusted(web) &&
      !!getMedia().state.title &&
      !sameTrack(web?.item, getMedia().state)
    );
  }
  // A song picked in TurnBit is shown right away; Spotify's own state replaces it once it reports the new track.
  function pendingActive() {
    return !!getPending() && Date.now() < getPending().until;
  }
  function switching(web = getState()) {
    return pendingActive() || localMismatch(web);
  }
  function merge(web) {
    let merged = web;
    const local = localTrusted(web) ? getMedia().current() : null;
    if (local) {
      merged = { ...web, is_playing: !!local.playing, localSession: true };
      if (local.durationMs > 0) merged.progress_ms = local.positionMs;
      // The Web API lags a song change; show the local title until it catches up.
      if (local.title && !sameTrack(web.item, local)) {
        merged.item = {
          name: local.title,
          artists: local.artist ? [{ name: local.artist }] : [],
          album: { name: local.album || '', images: [] },
          duration_ms: local.durationMs,
          uri: `local-session:${local.title}|${local.artist || ''}`,
        };
        merged.liked = null;
        merged.likedPending = false;
        merged.provisional = true;
      }
    }
    if (pendingActive()) {
      const item = getPending().item,
        started = !!local && sameTrack(item, local);
      merged = {
        ...(merged || {}),
        item,
        is_playing: started ? !!local.playing : true,
        progress_ms: started && local.durationMs > 0 ? local.positionMs : 0,
        liked: null,
        likedPending: false,
        provisional: true,
      };
    }
    // Spotify's resuming/pausing disallows describe the Web API snapshot's play state. Once the local
    // session or a picked song says otherwise, they are stale and would block Play or Pause.
    if (
      merged &&
      merged.is_playing !== web?.is_playing &&
      merged.actions?.disallows
    ) {
      const { resuming, pausing, ...disallows } = merged.actions.disallows;
      merged = { ...merged, actions: { ...merged.actions, disallows } };
    }
    return merged;
  }
  function localChanged(local) {
    const previous = lastLocal;
    lastLocal = local;
    if (!connected()) return;
    const trackChanged =
      !!previous &&
      (previous.title !== local.title || previous.artist !== local.artist);
    const appeared = !previous?.available && local.available;
    if (
      trackChanged ||
      appeared ||
      (previous && previous.playing !== local.playing && !localTrusted())
    )
      scheduleRefresh(800);
    if (getState()) publish(getState());
  }

  return {
    localTrusted,
    localMismatch,
    pendingActive,
    switching,
    merge,
    localChanged,
    clear() {
      lastLocal = null;
    },
  };
}
module.exports = { createLocalPlayback };
