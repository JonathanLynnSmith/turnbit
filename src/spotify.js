const { SpotifyAuth, REDIRECT_URI } = require('./integrations/spotify/auth');
const { SpotifyHttp } = require('./integrations/spotify/http');
const { createSpotifyRecovery } = require('./integrations/spotify/recovery');
const {
  createLocalPlayback,
} = require('./integrations/spotify/local-playback');
const {
  normalizeRecoverySettings,
} = require('./integrations/spotify/recovery-settings');
const cleanDevice = (device) =>
  device &&
  typeof device.id === 'string' &&
  device.id &&
  device.id.length <= 256 &&
  typeof (device.name ?? '') === 'string' &&
  String(device.name ?? '').length <= 256
    ? {
        id: device.id,
        name: String(device.name ?? ''),
        type: String(device.type || '').slice(0, 64),
      }
    : null;
class SpotifyClient {
  constructor(onState, options = {}) {
    this.stateListeners = new Set(onState ? [onState] : []);
    this.onState = (state) => {
      for (const listener of this.stateListeners) listener(state);
    };
    this.openExternal =
      options.openExternal ||
      (() => Promise.reject(new Error('Browser opening is not configured.')));
    this.persist = options.persist || (() => {});
    this.lastDevice = cleanDevice(options.session?.lastDevice);
    this.deviceId = '';
    this.auth = new SpotifyAuth({
      session: options.session,
      request: (url, settings) => this.http.request(url, settings),
      openExternal: this.openExternal,
      persist: () => this.save(),
      onAuth: options.onAuth || (() => {}),
      onConnected:
        options.onConnected ||
        (() =>
          this.getPlaybackState().catch((error) =>
            this.onState({ error: error.message }),
          )),
      onInvalidSession: () => this.logout(),
    });
    this.http = new SpotifyHttp({ ...options, auth: this.auth });
    this.likeStates = new Map();
    this.playbackRead = 0;
    this.playbackState = null;
    this.stateRevision = 0;
    this.likeDelays = options.likeDelays || [1000, 3000, 8000];
    // Liked status only changes on a new track or a Like press; recheck occasionally for changes made in other Spotify apps.
    this.likedCache = null;
    this.likedRecheck = options.likedRecheck ?? 60000;
    // Optional local session for the Spotify desktop app (Windows media session or macOS AppleScript): local state and transport without Web API calls.
    this.media = options.media || null;
    this.webCacheMs = options.webCacheMs ?? 25000;
    this.mismatchRetries = 0;
    this.waitForLike =
      options.waitForLike ||
      ((ms) =>
        new Promise((resolve) => {
          const timer = setTimeout(resolve, ms);
          timer.unref();
        }));
    this.recovery = {
      preferredDevice: null,
      autoLaunchSpotify: false,
      coldStart: { mode: 'last', playlist: null },
    };
    // The Liked Songs seed shares Spotify's throttled library limit with likes, so hold it between cold starts.
    this.coldStartCacheMs = options.coldStartCacheMs ?? 600000;
    this.launchSpotify =
      options.launchSpotify || (() => this.openExternal('spotify:'));
    this.waitForDevice =
      options.waitForDevice ||
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.recoveryControl = createSpotifyRecovery({
      api: (...args) => this.api(...args),
      getDevices: () => this.getDevices(),
      library: (...args) => this.library(...args),
      getSettings: () => this.recovery,
      getLastDevice: () => this.lastDevice,
      getPlayback: () => ({
        state: this.playbackState,
        readAt: this.playbackRead,
      }),
      getDeviceId: () => this.deviceId,
      selectDevice: (device) => {
        this.deviceId = device.id;
        this.rememberDevice(device);
      },
      publish: (event) => this.onState(event),
      scheduleRefresh: (ms) => this.scheduleRefresh(ms),
      extendPending: (ms) => {
        if (this.pendingPlay) this.pendingPlay.until = Date.now() + ms;
      },
      launch: () => this.launchSpotify(),
      wait: (ms) => this.waitForDevice(ms),
      webCacheMs: this.webCacheMs,
      cacheMs: this.coldStartCacheMs,
    });
    this.localPlayback = createLocalPlayback({
      getMedia: () => this.media,
      getState: () => this.playbackState,
      getPending: () => this.pendingPlay,
      connected: () => !!this.refreshToken,
      scheduleRefresh: (ms) => this.scheduleRefresh(ms),
      publish: (state) => this.emit(state),
    });
    this.configureRecovery(options.recovery || {});
  }
  get coldStartCache() {
    return this.recoveryControl.cache;
  }
  set coldStartCache(value) {
    this.recoveryControl.cache = value;
  }
  subscribe(listener) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }
  status() {
    return this.auth.status();
  }
  get clientId() {
    return this.auth.clientId;
  }
  get refreshToken() {
    return this.auth.refreshToken;
  }
  get server() {
    return this.auth.server;
  }
  get cooldowns() {
    return this.http.cooldowns;
  }
  get fetch() {
    return this.http.fetch;
  }
  set fetch(value) {
    this.http.fetch = value;
  }
  login() {
    return this.auth.login();
  }
  cancelLogin() {
    return this.auth.cancelLogin();
  }
  setTokens(data) {
    return this.auth.setTokens(data);
  }
  ensureToken() {
    return this.auth.ensureToken();
  }
  saveCooldowns() {
    return this.http.saveCooldowns();
  }
  api(path, options) {
    return this.http.api(path, options);
  }
  configure(clientId) {
    const id = String(clientId || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(id))
      throw new Error(
        'Enter the 32-character Spotify Client ID from your dashboard.',
      );
    // Rate limits belong to the Spotify app (Client ID), so a different app starts with none.
    if (id !== this.clientId) {
      this.logout();
      this.cooldowns.clear();
      this.saveCooldowns();
    }
    this.auth.clientId = id;
    this.save();
    return this.status();
  }
  save() {
    this.persist({
      clientId: this.clientId,
      refreshToken: this.refreshToken,
      lastDevice: this.lastDevice,
    });
  }
  rememberDevice(device) {
    const next = cleanDevice(device);
    if (!next || JSON.stringify(next) === JSON.stringify(this.lastDevice))
      return;
    this.lastDevice = next;
    this.save();
  }
  localTrusted(...args) {
    return this.localPlayback.localTrusted(...args);
  }
  localMismatch(...args) {
    return this.localPlayback.localMismatch(...args);
  }
  pendingActive(...args) {
    return this.localPlayback.pendingActive(...args);
  }
  switching(...args) {
    return this.localPlayback.switching(...args);
  }
  merge(...args) {
    return this.localPlayback.merge(...args);
  }
  localChanged(...args) {
    return this.localPlayback.localChanged(...args);
  }
  emit(state) {
    this.onState(this.merge(state));
  }
  scheduleRefresh(ms) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(
      () => this.getPlaybackState({ force: true }).catch(() => {}),
      ms,
    );
    this.refreshTimer.unref?.();
  }
  async getPlaybackState({ force = false } = {}) {
    if (
      !force &&
      this.playbackState &&
      this.localTrusted() &&
      !this.switching() &&
      Date.now() - this.playbackRead < this.webCacheMs
    ) {
      this.emit(this.playbackState);
      return this.playbackState;
    }
    const revision = this.stateRevision;
    const state = await this.api('/me/player');
    if (state) {
      state.liked = null;
      if (
        !state.item?.is_local &&
        /^spotify:track:[a-zA-Z0-9]{22}$/.test(state.item?.uri || '')
      ) {
        const cached = this.likeStates.get(state.item.uri);
        if (cached && Date.now() < cached.until) state.liked = cached.liked;
        else if (
          this.likedCache?.uri === state.item.uri &&
          Date.now() - this.likedCache.at < this.likedRecheck
        )
          state.liked = this.likedCache.liked;
        else
          try {
            const saved = await this.api(
              `/me/library/contains?${new URLSearchParams({ uris: state.item.uri })}`,
            );
            if (typeof saved?.[0] === 'boolean') {
              state.liked = saved[0];
              this.likedCache = {
                uri: state.item.uri,
                liked: saved[0],
                at: Date.now(),
              };
            }
          } catch {
            /* Library lookup must not interrupt playback. */
          }
        const latest = this.likeStates.get(state.item.uri);
        if (latest && Date.now() < latest.until) {
          state.liked = latest.liked;
          state.likedPending = !latest.confirmed;
        }
      }
    }
    // Spotify's reads lag volume writes; keep the value TurnBit just set so the dial does not snap back.
    if (
      state?.device &&
      this.volumeWrite &&
      Date.now() - this.volumeWrite.at < 5000
    )
      state.device = {
        ...state.device,
        volume_percent: this.volumeWrite.value,
      };
    if (revision !== this.stateRevision) return this.playbackState;
    this.playbackState = state;
    this.playbackRead = Date.now();
    this.rememberDevice(state?.device);
    if (this.pendingPlay && state?.item?.uri === this.pendingPlay.item.uri)
      this.pendingPlay = null;
    if (this.localMismatch(state)) {
      if (this.mismatchRetries++ < 3) this.scheduleRefresh(1500);
    } else this.mismatchRetries = 0;
    this.emit(state);
    return state;
  }
  getDevices() {
    return this.api('/me/player/devices');
  }
  configureRecovery(value = {}) {
    const next = normalizeRecoverySettings(value, this.recovery);
    if (
      JSON.stringify(next.preferredDevice) !==
      JSON.stringify(this.recovery.preferredDevice)
    )
      this.deviceId = next.preferredDevice?.id || '';
    if (next.coldStart.playlist?.uri !== this.recovery.coldStart.playlist?.uri)
      this.coldStartCache = null;
    this.recovery = next;
    return structuredClone(next);
  }
  matchDevice(...args) {
    return this.recoveryControl.matchDevice(...args);
  }
  recoveryDevice(...args) {
    return this.recoveryControl.recoveryDevice(...args);
  }
  recoverDevice(...args) {
    return this.recoveryControl.recoverDevice(...args);
  }
  lastSessionBody(...args) {
    return this.recoveryControl.lastSessionBody(...args);
  }
  likedSongsBody(...args) {
    return this.recoveryControl.likedSongsBody(...args);
  }
  coldStartPlay(...args) {
    return this.recoveryControl.coldStartPlay(...args);
  }
  startPlayback(...args) {
    return this.recoveryControl.startPlayback(...args);
  }
  publishLike(uri, entry, error) {
    if (this.likeStates.get(uri) !== entry) return;
    this.stateRevision++;
    if (this.playbackState?.item?.uri === uri) {
      this.playbackState = {
        ...this.playbackState,
        liked: entry.liked,
        likedPending: !entry.confirmed,
        likeError: error,
      };
      this.emit(this.playbackState);
    }
  }
  async verifyLike(uri, entry) {
    let observed = null;
    for (const delay of this.likeDelays) {
      const blocked = (this.cooldowns.get('library') || 0) - Date.now();
      if (blocked > 30000) break;
      await this.waitForLike(Math.max(delay, blocked));
      if (this.likeStates.get(uri) !== entry) return;
      try {
        const saved = await this.api(
          `/me/library/contains?${new URLSearchParams({ uris: uri })}`,
        );
        if (this.likeStates.get(uri) !== entry) return;
        if (typeof saved?.[0] === 'boolean') observed = saved[0];
        if (observed === entry.liked) {
          this.likedCache = { uri, liked: observed, at: Date.now() };
          entry.confirmed = true;
          entry.until = Date.now() + 4000;
          this.publishLike(uri, entry);
          return;
        }
      } catch {
        /* Retry confirmation reads, never blindly replay a toggle. */
      }
    }
    if (this.likeStates.get(uri) !== entry) return;
    entry.confirmed = true;
    entry.until = 0;
    entry.liked = observed;
    this.likedCache =
      typeof observed === 'boolean'
        ? { uri, liked: observed, at: Date.now() }
        : null;
    this.publishLike(
      uri,
      entry,
      'Spotify has not confirmed the save change. Its latest state is shown; use Save to Liked Songs to retry.',
    );
  }
  library(kind, id, offset = 0) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
      throw new Error('Invalid library page.');
    const paging = `limit=20&offset=${offset}`;
    if (kind === 'playlists') return this.api(`/me/playlists?${paging}`);
    if (kind === 'songs') return this.api(`/me/tracks?${paging}`);
    if (
      kind === 'playlist' &&
      typeof id === 'string' &&
      /^[a-zA-Z0-9]{22}$/.test(id)
    )
      return this.api(`/playlists/${id}/items?${paging}`);
    throw new Error('Invalid library request.');
  }
  async command(command, value) {
    if (['like', 'shuffle', 'repeat'].includes(command)) {
      const state =
        command === 'like' &&
        this.playbackState &&
        Date.now() - this.playbackRead < 6000 &&
        !this.switching()
          ? this.playbackState
          : await this.getPlaybackState({ force: true });
      if (!state) throw new Error('Open Spotify and start a song first.');
      if (command === 'like' && this.switching(state))
        throw new Error(
          'Spotify is still switching songs. Try again in a moment.',
        );
      if (command === 'like') {
        const item = state.item;
        if (
          item?.is_local ||
          !/^spotify:track:[a-zA-Z0-9]{22}$/.test(item?.uri || '')
        )
          throw new Error(
            'The current item is not a Spotify song that can be liked.',
          );
        if (typeof state.liked !== 'boolean')
          throw new Error(
            'Could not check whether this song is liked. Try again.',
          );
        const liked = !state.liked;
        // The write is queued by the main process. Preserve its acknowledged
        // result across delayed polls and Spotify's briefly stale library reads.
        try {
          await this.api(
            `/me/library?${new URLSearchParams({ uris: item.uri })}`,
            { method: liked ? 'PUT' : 'DELETE' },
          );
        } catch (error) {
          if (error.status === 403)
            throw new Error(
              'Reconnect Spotify in Settings to grant permission to save Liked Songs.',
            );
          throw error;
        }
        const entry = { liked, confirmed: false, until: Date.now() + 60000 };
        this.likeStates.set(item.uri, entry);
        this.publishLike(item.uri, entry);
        entry.verification = this.verifyLike(item.uri, entry);
        return {
          message: liked
            ? 'Adding to Liked Songs…'
            : 'Removing from Liked Songs…',
        };
      }
      const next =
        command === 'shuffle'
          ? !state.shuffle_state
          : { off: 'context', context: 'track', track: 'off' }[
              state.repeat_state
            ] || 'context';
      const params = new URLSearchParams({ state: String(next) });
      if (state.device?.id) params.set('device_id', state.device.id);
      await this.api(`/me/player/${command}?${params}`, { method: 'PUT' });
      this.emit({
        ...state,
        [command === 'shuffle' ? 'shuffle_state' : 'repeat_state']: next,
      });
      return {
        message:
          command === 'shuffle'
            ? `Shuffle ${next ? 'on' : 'off'}`
            : `Repeat: ${{ off: 'off', context: 'all', track: 'one song' }[next]}`,
      };
    }
    if (command === 'play-item') {
      const valid = (uri) =>
        typeof uri === 'string' &&
        /^spotify:(track|episode):[a-zA-Z0-9]{22}$/.test(uri);
      let body;
      if (
        value?.contextUri &&
        /^spotify:playlist:[a-zA-Z0-9]{22}$/.test(value.contextUri)
      ) {
        body = { context_uri: value.contextUri };
        if (value.position !== undefined) {
          if (!Number.isInteger(value.position) || value.position < 0)
            throw new Error('Invalid playlist position.');
          body.offset = { position: value.position };
        }
      } else if (valid(value?.uri)) body = { uris: [value.uri] };
      else throw new Error('This item cannot be played through Spotify.');
      const pending = valid(value?.item?.uri)
        ? { item: value.item, until: Date.now() + 8000 }
        : null;
      if (pending) {
        this.pendingPlay = pending;
        this.emit(this.playbackState);
      }
      try {
        await this.startPlayback(body);
      } catch (error) {
        if (this.pendingPlay === pending && pending) {
          this.pendingPlay = null;
          this.emit(this.playbackState);
        }
        throw error;
      }
      if (pending) this.scheduleRefresh(1500);
      return;
    }
    if (command === 'device') {
      // The renderer sends the whole device it listed, so picking one costs no extra read.
      const picked =
        typeof value === 'string'
          ? { id: value, name: '', type: '' }
          : cleanDevice(value);
      const id = picked?.id;
      if (typeof id !== 'string' || !id || id.length > 256)
        throw new Error('Select a playback device.');
      await this.api('/me/player', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [id], play: false }),
      });
      this.deviceId = id;
      this.rememberDevice(picked);
      return;
    }
    // Transport goes to the Spotify desktop app's own controls when it is the active player; the Web API is the fallback.
    const localReady = {
      play: true,
      pause: true,
      toggle: true,
      next: this.media?.state?.canNext,
      previous: this.media?.state?.canPrevious,
      seek: this.media?.state?.canSeek && Number.isFinite(value),
    };
    if (
      ['play', 'toggle'].includes(command) &&
      !this.playbackState?.device &&
      !this.deviceId &&
      !this.recovery.preferredDevice &&
      this.media?.state?.available &&
      (await this.media.command('play'))
    )
      return;
    if (
      localReady[command] &&
      this.localTrusted() &&
      (await this.media.command(command, value))
    )
      return;
    if (command === 'toggle') {
      let state;
      try {
        state = await this.getPlaybackState();
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      command = state?.is_playing ? 'pause' : 'play';
    }
    if (command === 'play') {
      await this.startPlayback();
      return;
    }
    const methods = {
      play: 'PUT',
      pause: 'PUT',
      next: 'POST',
      previous: 'POST',
      seek: 'PUT',
      volume: 'PUT',
    };
    if (!methods[command])
      throw new Error(`Unknown playback command: ${command}`);
    if ((command === 'seek' || command === 'volume') && !Number.isFinite(value))
      throw new Error('Playback value must be a finite number.');
    const query = () => {
      const params = new URLSearchParams();
      if (this.deviceId) params.set('device_id', this.deviceId);
      if (command === 'seek' || command === 'volume')
        params.set(
          command === 'seek' ? 'position_ms' : 'volume_percent',
          Math.round(
            Math.max(0, Math.min(command === 'volume' ? 100 : 86400000, value)),
          ),
        );
      return params;
    };
    let params = query();
    const run = () =>
      this.api(`/me/player/${command}${params.size ? `?${params}` : ''}`, {
        method: methods[command],
      });
    // Spotify going idle used to leave every button broken: the device it named is gone, and its id
    // poisons each later command. Recover once, exactly as Play does, instead of failing.
    try {
      await run();
    } catch (error) {
      if (error.status !== 404) throw error;
      this.deviceId = '';
      // Nothing is playing anywhere, which is what pause asked for.
      if (command === 'pause') return;
      await this.recoverDevice();
      params = query();
      // The device is back but empty: saying "no device" here is what made this feel broken.
      try {
        await run();
      } catch (retry) {
        if (retry.status === 404)
          throw new Error(
            'Spotify reconnected, but nothing is queued. Press Play to start something.',
          );
        throw retry;
      }
    }
    // Update the cached state too; while the desktop session is trusted it is reused instead of re-read.
    if (command === 'volume') {
      const volume = Number(params.get('volume_percent'));
      this.volumeWrite = { value: volume, at: Date.now() };
      if (this.playbackState?.device)
        this.playbackState = {
          ...this.playbackState,
          device: { ...this.playbackState.device, volume_percent: volume },
        };
    }
  }
  logout() {
    this.auth.clear();
    this.deviceId = '';
    this.lastDevice = null;
    this.playbackState = null;
    this.playbackRead = 0;
    this.likeStates.clear();
    this.likedCache = null;
    this.coldStartCache = null;
    clearTimeout(this.refreshTimer);
    this.localPlayback.clear();
    this.mismatchRetries = 0;
    this.pendingPlay = null;
    this.volumeWrite = null;
    this.stateRevision++;
    this.save();
    this.auth.notify();
    return { ok: true };
  }
}
module.exports = { SpotifyClient, REDIRECT_URI };
