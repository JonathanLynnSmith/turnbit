const test = require('node:test');
const assert = require('node:assert/strict');
const { SpotifyClient } = require('../src/spotify');
const {
  createSpotifyPlaybackProvider,
} = require('../src/integrations/spotify/playback-provider');
const { createPlaybackClient } = require('../renderer/client/playback-client');
const playlist = {
  id: 'b'.repeat(22),
  uri: 'spotify:playlist:' + 'b'.repeat(22),
};
const item = {
  uri: 'spotify:track:' + 'a'.repeat(22),
  name: 'Song',
  artists: [],
  album: { images: [] },
  duration_ms: 240000,
};

test('radio starts randomly within the middle 70 percent in a single Spotify play request', async () => {
  const { createRadioStationPlayer, radioStartPosition } = await import(
    '../renderer/features/radio-playback.mjs'
  );
  assert.equal(
    radioStartPosition(240000, () => 0),
    36000,
  );
  assert.equal(
    radioStartPosition(240000, () => 1),
    204000,
  );
  assert.equal(
    radioStartPosition(240000, () => 0.25),
    78000,
  );
  assert.equal(radioStartPosition(0), 0);
  const bodies = [];
  const client = {
    startPlayback: async (body) => bodies.push(body),
    emit: () => {},
    scheduleRefresh: () => {},
    subscribe: () => () => {},
  };
  client.command = (...args) =>
    SpotifyClient.prototype.command.call(client, ...args);
  const provider = createSpotifyPlaybackProvider(client);
  const adapter = createPlaybackClient({
    playback: { command: (...args) => provider.command(...args) },
  });
  const play = createRadioStationPlayer({
    library: async () => ({
      items: [{ item: { ...item, is_local: true } }, { item }],
    }),
    command: adapter.command,
    random: () => 0.5,
  });
  await play(playlist);
  assert.deepEqual(bodies, [
    { context_uri: playlist.uri, offset: { position: 1 }, position_ms: 120000 },
  ]);
  assert.equal(client.pendingPlay.startPositionMs, 120000);
  await assert.rejects(
    client.command('play-item', { uri: item.uri, startPositionMs: -1 }),
    /start position/,
  );
  await assert.rejects(
    client.command('play-item', {
      uri: item.uri,
      item,
      startPositionMs: item.duration_ms,
    }),
    /start position/,
  );
});

test('late playlist reads cannot start a station after tuning away', async () => {
  const { createRadioStationPlayer } = await import(
    '../renderer/features/radio-playback.mjs'
  );
  let cancelled = false,
    played = false;
  const play = createRadioStationPlayer({
    library: async () => {
      cancelled = true;
      return { items: [{ item }] };
    },
    command: () => {
      played = true;
    },
  });
  assert.equal(await play(playlist, { cancelled: () => cancelled }), false);
  assert.equal(played, false);
});
