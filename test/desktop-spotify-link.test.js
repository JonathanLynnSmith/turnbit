const test = require('node:test');
const assert = require('node:assert/strict');
const {
  openSpotifyExternal,
  spotifyDesktopInstalled,
} = require('../src/desktop/ipc');

const track = 'https://open.spotify.com/track/' + 'a'.repeat(22);

test('desktop availability follows the registered Spotify URI handler', () => {
  assert.equal(
    spotifyDesktopInstalled(
      { getApplicationNameForProtocol: () => 'Spotify' },
      'win32',
    ),
    true,
  );
  assert.equal(
    spotifyDesktopInstalled({ getApplicationNameForProtocol: () => '' }, 'darwin'),
    false,
  );
});

test('installed Spotify opens its desktop URI on Windows and macOS', async () => {
  for (const platform of ['win32', 'darwin']) {
    const opened = [];
    const app = { getApplicationNameForProtocol: () => 'Spotify' };
    const shell = { openExternal: async (url) => opened.push(url) };
    await openSpotifyExternal(track, { app, shell, platform });
    await openSpotifyExternal('https://open.spotify.com/', {
      app,
      shell,
      platform,
    });
    assert.deepEqual(opened, [
      'spotify:track:' + 'a'.repeat(22),
      'spotify:',
    ]);
  }
});

test('missing or stale Spotify handlers open the installer', async () => {
  for (const handler of ['', 'Spotify']) {
    const opened = [];
    const app = { getApplicationNameForProtocol: () => handler };
    const shell = {
      openExternal: async (url) => {
        opened.push(url);
        if (url.startsWith('spotify:')) throw new Error('Handler unavailable');
      },
    };
    await openSpotifyExternal(track, { app, shell, platform: 'win32' });
    assert.equal(opened.at(-1), 'https://www.spotify.com/download/');
    assert.equal(opened.length, handler ? 2 : 1);
  }
});

test('external links retain the strict Spotify allowlist', async () => {
  const opened = [];
  const app = { getApplicationNameForProtocol: () => 'Spotify' };
  const shell = { openExternal: async (url) => opened.push(url) };
  await openSpotifyExternal('https://developer.spotify.com/dashboard', {
    app,
    shell,
    platform: 'darwin',
  });
  assert.deepEqual(opened, ['https://developer.spotify.com/dashboard']);
  await assert.rejects(
    openSpotifyExternal('https://open.spotify.com/evil', {
      app,
      shell,
      platform: 'darwin',
    }),
    /Unsupported external link/,
  );
});
