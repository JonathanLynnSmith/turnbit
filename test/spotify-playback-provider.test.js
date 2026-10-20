const test = require("node:test");
const assert = require("node:assert/strict");
const { SpotifyClient } = require("../src/spotify");
const {
  normalizePlayback,
  createSpotifyPlaybackProvider,
} = require("../src/integrations/spotify/playback-provider");
const { createPlaybackService } = require("../src/app/playback-service");
const {
  createPlaybackClient,
  legacyPlayback,
} = require("../renderer/client/playback-client");
const raw = () => ({
  item: {
    uri: `spotify:track:${"a".repeat(22)}`,
    name: "Song",
    artists: [{ name: "Artist" }],
    album: {
      name: "Album",
      images: [
        { url: "https://example.com/cover.png", width: 300, height: 300 },
      ],
    },
    duration_ms: 60000,
  },
  is_playing: true,
  progress_ms: 10000,
  // Spotify always disallows resuming while a track is already playing.
  actions: { disallows: { resuming: true } },
  liked: false,
  shuffle_state: true,
  repeat_state: "context",
  context: { uri: `spotify:playlist:${"b".repeat(22)}` },
  device: {
    id: "speaker",
    name: "Speaker",
    type: "Speaker",
    volume_percent: 45,
  },
});

test("Spotify payloads normalize into a provider-independent model with capability restrictions", () => {
  const data = raw();
  assert.equal(normalizePlayback(data).capabilities.play, false);
  assert.equal(normalizePlayback(data).capabilities.playItem, true);
  data.actions = { disallows: { seeking: true, skipping_next: true } };
  data.device.supports_volume = false;
  const state = normalizePlayback(data, 123);
  assert.equal(state.track.title, "Song");
  assert.deepEqual(state.track.artists, ["Artist"]);
  assert.equal(state.repeat, "all");
  assert.equal(state.observedAt, 123);
  assert.equal(state.capabilities.seek, false);
  assert.equal(state.capabilities.next, false);
  assert.equal(state.capabilities.volume, false);
  assert.equal(state.capabilities.like, true);
  assert.equal(state.item, undefined);
  data.item.is_local = true;
  assert.equal(normalizePlayback(data).capabilities.like, false);
  assert.equal(normalizePlayback(null), null);
  const oldView = legacyPlayback({ ...state, playing: false });
  assert.deepEqual(oldView.item, {
    ...data.item,
    is_local: false,
    type: "track",
  });
  assert.equal(oldView.repeat_state, "context");
  assert.equal(oldView.device.volume_percent, 45);
});

test("Spotify provider connects actual client state and normalized commands to the service", async (t) => {
  const requests = [];
  const client = new SpotifyClient(null, {
    fetch: async (url, options) => {
      requests.push({ url, options });
      return options.method
        ? new Response(null, { status: 204 })
        : new Response(
            JSON.stringify(url.includes("/contains") ? [false] : raw()),
          );
    },
  });
  client.setTokens({
    access_token: "test",
    refresh_token: "refresh",
    expires_in: 3600,
  });
  const service = createPlaybackService(createSpotifyPlaybackProvider(client));
  t.after(() => {
    service.dispose();
    client.logout();
  });
  const events = [];
  service.subscribe((event) => events.push(event));
  service.setConnected(true);
  const state = await service.refresh();
  assert.equal(state.track.title, "Song");
  assert.equal(events.at(-1).state.item, undefined);
  const beforeVolume = requests.length;
  await service.command("volume", 65);
  assert.equal(requests.length, beforeVolume + 1);
  assert.equal(service.getState().device.volume, 65);
  await service.command("play-item", {
    trackId: state.track.id,
    track: state.track,
  });
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
    uris: [state.track.id],
  });
  assert.equal(service.getState().provisional, true);
  client.onState({ recoveryMessage: "Connecting" });
  assert.deepEqual(events.at(-1), { type: "notice", message: "Connecting" });
  assert.equal(service.getState().track.title, "Song");
  client.onState({
    recoveredDevice: { id: "new", name: "Speaker", type: "Speaker" },
  });
  assert.equal(events.at(-1).type, "device-recovered");
  assert.equal(client.stateListeners.size, 1);
  service.dispose();
  assert.equal(client.stateListeners.size, 0);
});

test("provider preserves remote position timestamps for later like notifications", () => {
  let listener;
  const client = {
    playbackRead: 1000,
    subscribe(fn) {
      listener = fn;
      return () => {};
    },
  };
  const provider = createSpotifyPlaybackProvider(client, { now: () => 5000 });
  const events = [];
  provider.subscribe((event) => events.push(event));
  listener({ ...raw(), liked: true });
  assert.equal(events[0].state.observedAt, 1000);
  listener({ ...raw(), localSession: true });
  assert.equal(events[1].state.observedAt, 5000);
});

test("existing views translate selected track metadata and service events through one adapter", async () => {
  let selected,
    listener,
    unsubscribed = false;
  const api = createPlaybackClient({
    playback: {
      command: async (name, value) => {
        selected = { name, value };
      },
      onEvent(fn) {
        listener = fn;
        return () => {
          unsubscribed = true;
        };
      },
    },
  });
  const data = raw();
  await api.command("play-item", { uri: data.item.uri, item: data.item });
  assert.equal(selected.value.trackId, data.item.uri);
  assert.equal(selected.value.track.title, "Song");
  assert.equal(selected.value.item, undefined);
  const events = [];
  const off = api.onState((event) => events.push(event));
  listener({
    type: "state",
    state: { ...normalizePlayback(data), playing: false },
  });
  listener({ type: "notice", message: "Connecting" });
  listener({ type: "device-recovered", device: { id: "new" } });
  listener({ type: "error", message: "offline" });
  assert.equal(events[0].item.name, "Song");
  assert.deepEqual(events.slice(1), [
    { recoveryMessage: "Connecting" },
    { recoveredDevice: { id: "new" } },
    { error: "offline" },
  ]);
  off();
  assert.equal(unsubscribed, true);
});

test("service playback delegates device recovery and carries recovery notices without replacing state", async (t) => {
  let attempts = 0,
    transfers = 0;
  const client = new SpotifyClient(null, {
    waitForDevice: async () => {},
    fetch: async (url, options) => {
      const route = new URL(url).pathname;
      if (route.endsWith("/play")) {
        attempts++;
        return new Response(null, { status: attempts === 1 ? 404 : 204 });
      }
      if (route.endsWith("/devices"))
        return new Response(
          JSON.stringify({
            devices: [
              {
                id: "speaker",
                name: "Speaker",
                type: "Speaker",
                is_active: true,
              },
            ],
          }),
        );
      if (options.method === "PUT") {
        transfers++;
        return new Response(null, { status: 204 });
      }
      if (route.endsWith("/contains")) return new Response("[false]");
      return new Response(
        JSON.stringify({ ...raw(), is_playing: false, actions: {} }),
      );
    },
  });
  client.setTokens({
    access_token: "test",
    refresh_token: "refresh",
    expires_in: 3600,
  });
  const service = createPlaybackService(createSpotifyPlaybackProvider(client));
  t.after(() => {
    service.dispose();
    client.logout();
  });
  const events = [];
  service.subscribe((event) => events.push(event));
  service.setConnected(true);
  await service.refresh();
  await service.command("play");
  assert.equal(attempts, 2);
  assert.equal(transfers, 1);
  assert.ok(
    events.some(
      (event) =>
        event.type === "notice" && event.message.includes("reconnected"),
    ),
  );
  assert.equal(service.getState().track.title, "Song");
});
