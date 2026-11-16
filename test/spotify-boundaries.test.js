const test = require("node:test");
const assert = require("node:assert/strict");
const { SpotifyAuth } = require("../src/integrations/spotify/auth");
const { SpotifyHttp } = require("../src/integrations/spotify/http");

test("HTTP policy works against an auth contract and refreshes an unauthorized request once", async () => {
  let token = "expired",
    invalidations = 0;
  const requests = [];
  const http = new SpotifyHttp({
    auth: {
      refreshToken: "refresh",
      ensureToken: async () => token,
      invalidateAccessToken: () => {
        invalidations++;
        token = "fresh";
      },
    },
    fetch: async (_, options) => {
      requests.push(options.headers.Authorization);
      return requests.length === 1
        ? new Response("{}", { status: 401 })
        : new Response('{"devices":[]}');
    },
  });
  assert.deepEqual(await http.api("/me/player/devices"), { devices: [] });
  assert.deepEqual(requests, ["Bearer expired", "Bearer fresh"]);
  assert.equal(invalidations, 1);
});

test("auth owns refresh deduplication and rotated token persistence independently of playback", async () => {
  let calls = 0,
    saves = 0;
  const auth = new SpotifyAuth({
    session: { clientId: "client", refreshToken: "old" },
    request: async (_, options) => {
      calls++;
      assert.equal(options.body.get("refresh_token"), "old");
      return {
        access_token: "access",
        refresh_token: "rotated",
        expires_in: 3600,
      };
    },
    persist: () => {
      saves++;
    },
    onInvalidSession: () => assert.fail("valid refresh should retain session"),
  });
  assert.deepEqual(
    await Promise.all([auth.ensureToken(), auth.ensureToken()]),
    ["access", "access"],
  );
  assert.equal(calls, 1);
  assert.equal(saves, 1);
  assert.equal(auth.refreshToken, "rotated");
  auth.clear();
  await assert.rejects(auth.ensureToken(), /Connect Spotify/);
});

test("invalid refresh delegates session invalidation to the application", async () => {
  let invalidated = false;
  const auth = new SpotifyAuth({
    session: { refreshToken: "expired" },
    request: async () => {
      throw Object.assign(new Error("revoked"), { status: 400 });
    },
    onInvalidSession: () => {
      invalidated = true;
      auth.clear();
    },
  });
  await assert.rejects(auth.ensureToken(), /revoked/);
  assert.equal(invalidated, true);
  assert.equal(auth.status().connected, false);
});

test('a second unauthorized response is surfaced rather than retried indefinitely', async () => {
  let calls = 0;
  const http = new SpotifyHttp({
    auth: {
      refreshToken: 'refresh',
      ensureToken: async () => 'access',
      invalidateAccessToken: () => {}
    },
    fetch: async () => { calls++; return new Response('{}', { status: 401 }); }
  });
  await assert.rejects(http.api('/me/player'), error => error.status === 401);
  assert.equal(calls, 2);
});

test('failures say what kind they are, so a lasting one can stay on screen', async () => {
  const { SpotifyHttp } = require('../src/integrations/spotify/http');
  const auth = { ensureToken: async () => 'token', refreshToken: 'refresh', invalidateAccessToken() {} };
  const kind = async (fetch) => {
    try {
      await new SpotifyHttp({ auth, fetch, wait: async () => {} }).api('/me/player/pause', { method: 'PUT' });
    } catch (error) {
      return error;
    }
  };
  const status = (code, headers) => async () => new Response('{}', { status: code, headers });
  assert.equal((await kind(status(404))).code, 'no-device');
  assert.equal((await kind(status(403))).code, 'denied');
  assert.equal((await kind(status(503))).code, 'spotify-down');
  const limited = await kind(status(429, { 'retry-after': '60' }));
  assert.equal(limited.code, 'rate-limited');
  assert.ok(limited.until > Date.now(), 'a rate limit says when it ends');
  const offline = await kind(async () => {
    throw new TypeError('fetch failed');
  });
  assert.equal(offline.code, 'offline');
  assert.equal(offline.message, "Can't reach Spotify. Check your internet connection.");
});

test('the playback service passes the kind of failure to its listeners', async () => {
  const { createPlaybackService } = require('../src/app/playback-service');
  const service = createPlaybackService({
    capabilities: {},
    subscribe: () => () => {},
    read: async () => {
      throw Object.assign(new Error('No device'), { code: 'no-device' });
    },
    command: async () => {},
  });
  const events = [];
  service.subscribe((event) => events.push(event));
  service.setConnected(true);
  await service.refresh().catch(() => {});
  service.dispose();
  assert.deepEqual(events.at(-1), { type: 'error', message: 'No device', code: 'no-device' });
});
