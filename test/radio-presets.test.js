const test = require('node:test');
const assert = require('node:assert/strict');
const { SpotifyClient } = require('../src/spotify');
const {
  createSpotifyLibraryProvider,
} = require('../src/integrations/spotify/library-provider');
const { createLibraryService } = require('../src/app/library-service');
const { createPlaybackClient } = require('../renderer/client/playback-client');
const playlist = (i, extra = {}) => ({
  id: String(i).padStart(22, '0'),
  uri: 'spotify:playlist:' + String(i).padStart(22, '0'),
  name: 'Playlist ' + i,
  radioEligible: true,
  ...extra,
});

test('radio eligibility uses actual ownership and excludes empty and followed playlists', async () => {
  const owned = { ...playlist(1), owner: { id: 'me' }, items: { total: 5 } };
  const followed = { ...playlist(2), owner: { id: 'other' } };
  const empty = { ...playlist(3), owner: { id: 'me' }, tracks: { total: 0 } };
  const spotify = { ...playlist(4), owner: { id: 'spotify' } };
  const client = {
    api: async (url) =>
      url === '/me'
        ? { id: 'me' }
        : { items: [owned, followed, empty, spotify, null], next: 'next-page' },
  };
  const library = createLibraryService(
    createSpotifyLibraryProvider({
      library: (...args) =>
        SpotifyClient.prototype.library.call(client, ...args),
    }),
  );
  const adapter = createPlaybackClient({ library });
  const page = await adapter.library('radio-playlists', undefined, 20);
  assert.deepEqual(
    page.items.map((item) => item.radioEligible),
    [true, false, false, false],
  );
  assert.equal(
    page.nextOffset,
    25,
    'pagination counts raw entries, including unavailable entries',
  );
});

test('random presets sample the entire library and preserve existing channels', async () => {
  const { pickRadioPlaylists } = await import(
    '../renderer/features/radio-presets.mjs'
  );
  const calls = [];
  const result = await pickRadioPlaylists({
    existing: [playlist(1)],
    count: 10,
    random: () => 0,
    library: async (offset, ownedOnly) => {
      calls.push([offset, ownedOnly]);
      return offset === 0
        ? {
            items: Array.from({ length: 20 }, (_, i) => playlist(i + 1)),
            next: true,
            nextOffset: 20,
          }
        : {
            items: [
              playlist(21),
              playlist(22, { radioEligible: false }),
              playlist(1),
            ],
            next: false,
          };
    },
  });
  assert.deepEqual(calls, [
    [0, true],
    [20, true],
  ]);
  assert.equal(result.length, 10);
  assert.equal(new Set(result.map((item) => item.id)).size, 10);
  assert.ok(
    result.some((item) => item.id === playlist(21).id),
    'later pages can be sampled',
  );
  assert.ok(
    !result.some(
      (item) => item.id === playlist(1).id || item.id === playlist(22).id,
    ),
  );
});

test('small libraries, cancellation, and failed pagination do not produce partial saved selections', async () => {
  const { pickRadioPlaylists } = await import(
    '../renderer/features/radio-presets.mjs'
  );
  assert.equal(
    (
      await pickRadioPlaylists({
        library: async () => ({
          items: [playlist(1), playlist(1), playlist(2)],
          next: false,
        }),
      })
    ).length,
    2,
  );
  let cancelled = false;
  assert.equal(
    await pickRadioPlaylists({
      cancelled: () => cancelled,
      library: async () => {
        cancelled = true;
        return { items: [playlist(1)] };
      },
    }),
    null,
  );
  await assert.rejects(
    pickRadioPlaylists({ library: async () => ({ items: [], next: true }) }),
    /finish loading/,
  );
});
