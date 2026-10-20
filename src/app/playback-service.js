const { createPlaybackDispatcher } = require('./playback-dispatcher');

// Provider contract: read() -> Turnbit snapshot, command(name, value),
// subscribe(listener) -> unsubscribe, and a capabilities object. Provider events
// are {type:'state', state}, {type:'notice', message}, {type:'device-recovered',
// device}, or {type:'error', message}. No provider payloads cross this boundary.
/** @param {import("./playback-model").PlaybackProvider} provider */
function createPlaybackService(
  provider,
  { clock = {}, commandRefreshMs = 600 } = {},
) {
  const now = clock.now || Date.now;
  const later = clock.setTimeout || setTimeout;
  const cancel = clock.clearTimeout || clearTimeout;
  const listeners = new Set();
  let state = null,
    connected = false,
    disposed = false,
    hidden = false;
  let lastActivity = now(),
    timer,
    pending,
    generation = 0,
    revision = 0,
    endChecked;
  const copy = (value) => structuredClone(value);
  const publish = (event) => {
    for (const listener of listeners) listener(copy(event));
  };
  function accept(event) {
    if (!connected || disposed) return;
    if (event.type === 'state') {
      state = copy(event.state);
      revision++;
    }
    publish(event);
  }
  const unsubscribe = provider.subscribe(accept);
  function position() {
    if (!state) return 0;
    return Math.min(
      state.track?.durationMs || 0,
      state.positionMs +
        (state.playing ? Math.max(0, now() - state.observedAt) : 0),
    );
  }
  function pollDelay() {
    if (hidden) return 30000;
    if (!state?.playing) return 15000;
    const base =
      state.transport === 'local' || now() - lastActivity < 30000
        ? 5000
        : 15000;
    const left = (state.track?.durationMs || 0) - position();
    return state.track?.durationMs > 0 &&
      state.track.id !== endChecked &&
      left + 500 < base
      ? Math.max(1000, left + 500)
      : base;
  }
  function schedule(delay = pollDelay()) {
    cancel(timer);
    timer = undefined;
    if (!connected || disposed) return;
    timer = later(() => {
      timer = undefined;
      refresh().catch(() => {});
    }, delay);
    timer?.unref?.();
  }
  function refresh() {
    if (disposed || !connected) return Promise.resolve(copy(state));
    if (pending) return pending;
    cancel(timer);
    timer = undefined;
    const session = generation,
      before = revision;
    if (
      state?.playing &&
      state.track?.durationMs > 0 &&
      state.track.durationMs - position() < 1500
    )
      endChecked = state.track.id;
    const request = Promise.resolve()
      .then(() => provider.read())
      .then((snapshot) => {
        if (session !== generation || disposed) return copy(state);
        // Providers may publish local/optimistic updates while a read is in flight.
        // Never replace a newer event with an older read result.
        if (before === revision) accept({ type: 'state', state: snapshot });
        return copy(state);
      })
      .catch((error) => {
        if (session === generation && !disposed)
          publish({ type: 'error', message: error.message });
        throw error;
      })
      .finally(() => {
        if (pending === request) pending = undefined;
        if (session === generation && !disposed) schedule();
      });
    pending = request;
    return request;
  }
  const dispatch = createPlaybackDispatcher(async (command, request) => {
    const { value, session } = request;
    try {
      if (disposed || !connected || session !== generation)
        throw new Error('Connect a playback provider to control playback.');
      const capability =
        command === 'toggle'
          ? state?.playing
            ? 'pause'
            : 'play'
          : command === 'play-item'
            ? 'playItem'
            : command;
      if (
        provider.capabilities[capability] !== true ||
        state?.capabilities?.[capability] === false
      ) {
        throw Object.assign(
          new Error(`This player does not support ${command} right now.`),
          { code: 'UNSUPPORTED_PLAYBACK_COMMAND' },
        );
      }
      const result = await provider.command(command, value);
      if (session === generation && command !== 'volume')
        schedule(commandRefreshMs);
      return result;
    } catch (error) {
      if (session === generation && !disposed)
        publish({ type: 'error', message: error.message });
      throw error;
    }
  });
  return {
    getState: () => copy(state),
    refresh,
    command: (command, value) =>
      dispatch(command, { value, session: generation }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setConnected(value) {
      if (disposed || connected === !!value) return;
      connected = !!value;
      generation++;
      pending = undefined;
      cancel(timer);
      timer = undefined;
      endChecked = undefined;
      if (connected) refresh().catch(() => {});
      else {
        state = null;
        revision++;
        publish({ type: 'state', state: null });
      }
    },
    noteActivity() {
      lastActivity = now();
    },
    setPresentation({ hidden: value }) {
      const wasHidden = hidden;
      hidden = value === true;
      if (hidden === wasHidden || !connected || disposed) return;
      if (!hidden) refresh().catch(() => {});
      else schedule();
    },
    dispose() {
      disposed = true;
      connected = false;
      generation++;
      cancel(timer);
      unsubscribe();
      listeners.clear();
    },
  };
}

module.exports = { createPlaybackService };
