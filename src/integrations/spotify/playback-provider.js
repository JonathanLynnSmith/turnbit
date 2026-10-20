const { normalizeTrack, spotifyTrack } = require('./track');
const capabilities = Object.freeze({
  play: true,
  pause: true,
  next: true,
  previous: true,
  seek: true,
  volume: true,
  like: true,
  shuffle: true,
  repeat: true,
  device: true,
});

function normalizePlayback(raw, observedAt = Date.now()) {
  if (!raw) return null;
  const disallows = raw.actions?.disallows || {};
  return {
    track: normalizeTrack(raw.item),
    playing: !!raw.is_playing,
    positionMs: raw.progress_ms || 0,
    observedAt,
    device: raw.device
      ? {
          id: raw.device.id,
          name: raw.device.name,
          type: raw.device.type,
          volume: raw.device.volume_percent ?? null,
          restricted: !!raw.device.is_restricted,
        }
      : null,
    context: raw.context?.uri ? { id: raw.context.uri } : null,
    liked: typeof raw.liked === 'boolean' ? raw.liked : null,
    likedPending: !!raw.likedPending,
    likeError: raw.likeError || null,
    shuffle: !!raw.shuffle_state,
    repeat:
      { off: 'off', context: 'all', track: 'one' }[raw.repeat_state] || 'off',
    provisional: !!raw.provisional,
    transport: raw.localSession ? 'local' : 'remote',
    capabilities: {
      ...capabilities,
      play: !disallows.resuming,
      pause: !disallows.pausing,
      next: !disallows.skipping_next,
      previous: !disallows.skipping_prev,
      seek: !disallows.seeking,
      volume:
        !raw.device?.is_restricted && raw.device?.supports_volume !== false,
      like:
        !raw.item?.is_local &&
        /^spotify:track:[a-zA-Z0-9]{22}$/.test(raw.item?.uri || ''),
      shuffle: !disallows.toggling_shuffle,
      repeat: !(
        disallows.toggling_repeat_context && disallows.toggling_repeat_track
      ),
      device: !disallows.transferring_playback,
    },
  };
}

// Spotify payloads and local-media reconciliation stop here. IDs are opaque to
// application code; only this integration interprets Spotify URIs and commands.
function createSpotifyPlaybackProvider(client, { now = Date.now } = {}) {
  const snapshot = (raw) =>
    normalizePlayback(
      raw,
      raw?.provisional || raw?.localSession
        ? now()
        : client.playbackRead || now(),
    );
  return {
    capabilities,
    async read() {
      return snapshot(client.merge(await client.getPlaybackState()));
    },
    async command(command, value) {
      if (command === 'play-item') {
        value = {
          uri: value?.trackId,
          contextUri: value?.contextId,
          position: value?.position,
          item: spotifyTrack(value?.track),
        };
      }
      const result = await client.command(command, value);
      // Volume already updates the provider cache. Publish the accepted value
      // without adding a Web API read for each dial movement.
      if (command === 'volume' && client.playbackState)
        client.emit(client.playbackState);
      return result;
    },
    subscribe(listener) {
      return client.subscribe((raw) => {
        if (raw?.error) listener({ type: 'error', message: raw.error });
        else if (raw?.recoveryMessage)
          listener({ type: 'notice', message: raw.recoveryMessage });
        else if (raw?.recoveredDevice)
          listener({ type: 'device-recovered', device: raw.recoveredDevice });
        else listener({ type: 'state', state: snapshot(raw) });
      });
    },
  };
}
module.exports = {
  createSpotifyPlaybackProvider,
  normalizePlayback,
  normalizeTrack,
};
