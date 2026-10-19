// Spotify device selection, reconnect, and empty-player startup policy.
function createSpotifyRecovery({
  api,
  getDevices,
  library,
  getSettings,
  getLastDevice,
  getPlayback,
  getDeviceId,
  selectDevice,
  publish,
  scheduleRefresh,
  extendPending,
  launch,
  wait,
  webCacheMs,
  cacheMs,
}) {
  let cache = null;
  // Spotify hands out a new id for the same device on every launch, so fall back to a name and type
  // that only one device answers to.
  function matchDevice(available, wanted) {
    if (!wanted) return null;
    const exact = available.find((device) => device.id === wanted.id);
    if (exact) return exact;
    const matches = available.filter(
      (device) =>
        device.name === wanted.name &&
        device.type?.toLowerCase() === wanted.type?.toLowerCase(),
    );
    return matches.length === 1 ? matches[0] : null;
  }
  function recoveryDevice(devices = []) {
    const available = (Array.isArray(devices) ? devices : []).filter(
      (device) => device.id && !device.is_restricted,
    );
    // A chosen Preferred Device is the only one allowed; silence is better than music somewhere else.
    if (getSettings().preferredDevice)
      return matchDevice(available, getSettings().preferredDevice);
    const computers = available.filter(
      (device) => device.type?.toLowerCase() === 'computer',
    );
    // Automatic: the device last used, then whatever Spotify still calls active, then the only
    // computer, then the only device at all.
    return (
      matchDevice(available, getLastDevice()) ||
      available.find((device) => device.is_active) ||
      (computers.length === 1
        ? computers[0]
        : available.length === 1
          ? available[0]
          : null)
    );
  }
  async function recoverDevice() {
    publish({ recoveryMessage: 'Connecting to Spotify…' });
    extendPending(30000);
    let device = recoveryDevice((await getDevices())?.devices);
    if (!device && getSettings().autoLaunchSpotify) {
      await launch();
      for (const delay of [500, 1500, 3000]) {
        await wait(delay);
        device = recoveryDevice((await getDevices())?.devices);
        if (device) break;
      }
    }
    if (!device)
      throw new Error(
        getSettings().preferredDevice
          ? 'Preferred Spotify device is unavailable. Open Spotify on that device or choose another preferred device.'
          : 'No Spotify device is available. Open Spotify or select a preferred device in Settings.',
      );
    await api('/me/player', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_ids: [device.id], play: false }),
    });
    selectDevice(device);
    if (getSettings().preferredDevice) {
      getSettings().preferredDevice = {
        id: device.id,
        name: device.name,
        type: device.type,
      };
      publish({ recoveredDevice: getSettings().preferredDevice });
    }
    await wait(300);
  }
  // A play call with no body can only resume, so an empty Spotify player has nothing to start and
  // keeps failing however healthy the device is. These seeds give it something to play instead.
  // Only the Liked Songs seed costs a read, it is cached, and nothing here runs on a healthy start.
  function lastSessionBody() {
    // Reuse the state turnbit already holds; a cold start is never worth a fetch of its own here.
    if (!getPlayback().state || Date.now() - getPlayback().readAt >= webCacheMs)
      return null;
    const context = getPlayback().state.context?.uri,
      item = getPlayback().state.item?.uri;
    if (!/^spotify:(playlist|album|artist|show):/.test(context || ''))
      return null;
    return /^spotify:(track|episode):[a-zA-Z0-9]{22}$/.test(item || '')
      ? { context_uri: context, offset: { uri: item } }
      : { context_uri: context };
  }
  async function likedSongsBody() {
    if (cache && Date.now() - cache.at < cacheMs) return cache.body;
    // Liked Songs has no playable context URI, so Spotify's own answer is to play the track URIs.
    const uris = ((await library('songs'))?.items || [])
      .map((entry) => entry?.track?.uri)
      .filter((uri) => /^spotify:track:[a-zA-Z0-9]{22}$/.test(uri || ''));
    if (!uris.length) return null;
    const body = { uris };
    cache = { body, at: Date.now() };
    return body;
  }
  async function coldStartPlay() {
    const { mode, playlist } = getSettings().coldStart || {};
    if (mode === 'off') return null;
    if (mode === 'playlist')
      return playlist
        ? {
            body: { context_uri: playlist.uri },
            message: `Nothing was playing · started ${playlist.name || 'your playlist'}`,
          }
        : null;
    if (mode === 'last') {
      const body = lastSessionBody();
      if (body) return { body, message: 'Resumed your last Spotify session' };
    }
    const liked = await likedSongsBody();
    return liked
      ? {
          body: liked,
          message: 'Nothing was playing · started your Liked Songs',
        }
      : null;
  }
  async function startPlayback(body) {
    const send = (payload) =>
      api(
        `/me/player/play${getDeviceId() ? `?device_id=${encodeURIComponent(getDeviceId())}` : ''}`,
        {
          method: 'PUT',
          ...(payload
            ? {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              }
            : {}),
        },
      );
    let cold = null;
    // Spotify already reporting a device with nothing loaded means the resume is doomed; seed instead
    // of spending the call, and skip device recovery that has nothing to recover.
    if (
      !body &&
      getPlayback().state &&
      getPlayback().state.device &&
      !getPlayback().state.item &&
      Date.now() - getPlayback().readAt < webCacheMs
    ) {
      cold = await coldStartPlay().catch(() => null);
      if (cold) body = cold.body;
    }
    const started = (result) => {
      if (cold) {
        publish({ recoveryMessage: cold.message });
        scheduleRefresh(1500);
      }
      return result;
    };
    try {
      return started(await send(body));
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    await recoverDevice();
    try {
      const result = await send(body);
      publish({
        recoveryMessage: cold
          ? cold.message
          : 'Spotify reconnected · playback request sent',
      });
      if (cold) scheduleRefresh(1500);
      return result;
    } catch (error) {
      if (error.status !== 404) throw error;
      // The device answers now, so the only thing still missing is something to play.
      if (body)
        throw new Error(
          'Spotify is still starting. Try Play again in a moment.',
        );
      cold = await coldStartPlay();
      if (!cold)
        throw new Error(
          'Nothing was playing. Start a song in Spotify, or choose what Play should start in Settings → Playback.',
        );
      try {
        return started(await send(cold.body));
      } catch (retry) {
        if (retry.status === 404)
          throw new Error(
            'Spotify is still starting. Try Play again in a moment.',
          );
        throw retry;
      }
    }
  }

  return {
    matchDevice,
    recoveryDevice,
    recoverDevice,
    lastSessionBody,
    likedSongsBody,
    coldStartPlay,
    startPlayback,
    get cache() {
      return cache;
    },
    set cache(value) {
      cache = value;
    },
  };
}
module.exports = { createSpotifyRecovery };
