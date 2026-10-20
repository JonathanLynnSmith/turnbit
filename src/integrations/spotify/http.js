const API = 'https://api.spotify.com/v1';
// Spotify throttles per endpoint (Liked Songs and like checks share one limit), so a 429 there must not block playback.
const limitGroup = (path) =>
  /^\/me\/(library|tracks)(\/|\?|$)/.test(path)
    ? 'library'
    : path.split('?')[0].replace(/\/[A-Za-z0-9]{22}(?=\/|$)/g, '/{id}');
const groupLabel = (group) =>
  group === 'library'
    ? 'Liked Songs and likes'
    : group.startsWith('/me/player')
      ? 'playback control'
      : group.includes('playlists')
        ? 'playlists'
        : 'this feature';
const untilText = (at) =>
  new Date(at).toLocaleString(
    [],
    at - Date.now() > 12 * 3600000
      ? { weekday: 'short', hour: 'numeric', minute: '2-digit' }
      : { hour: 'numeric', minute: '2-digit' },
  );
const cooldownError = (group, at) =>
  Object.assign(
    new Error(
      `Spotify rate limit: ${groupLabel(group)} paused until ${untilText(at)}.`,
    ),
    { status: 429 },
  );

// Owns network policy, endpoint cooldowns, and safe read retries.
class SpotifyHttp {
  constructor({
    auth,
    fetch = globalThis.fetch,
    cooldowns = {},
    onCooldowns = () => {},
    serverRetryMs = 1500,
    wait,
  } = {}) {
    Object.assign(this, { auth, fetch, onCooldowns, serverRetryMs });
    this.wait =
      wait ||
      ((ms) =>
        new Promise((resolve) => {
          const timer = setTimeout(resolve, ms);
          timer.unref?.();
        }));
    this.cooldowns = new Map();
    for (const [group, at] of Object.entries(cooldowns)) {
      if (
        Number.isFinite(at) &&
        at > Date.now() &&
        at < Date.now() + 7 * 86400000
      )
        this.cooldowns.set(group, at);
    }
  }
  async request(url, options = {}) {
    const response = await this.fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15000),
    });
    // TURNBIT_DEBUG_API=1 (or the older DIALPOD_DEBUG_API) logs every Spotify call, so throttling (429 + Retry-After) and call volume are visible.
    if (process.env.TURNBIT_DEBUG_API || process.env.DIALPOD_DEBUG_API) {
      this.debugCalls = (this.debugCalls || [])
        .filter((at) => Date.now() - at < 60000)
        .concat(Date.now());
      const retry = response.headers.get('retry-after');
      console.log(
        `[spotify] ${new Date().toLocaleTimeString()} ${options.method || 'GET'} ${new URL(url).pathname} -> ${response.status}${retry ? ` retry-after=${retry}s` : ''} (${this.debugCalls.length} calls/min)`,
      );
    }
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const hints = {
        403: 'Spotify denied access. Check Premium, your app user allowlist, and playback permissions.',
        404: 'No active Spotify device. Open Spotify and start a track, then select a device.',
        429: 'Spotify rate limit reached. Waiting for cooldown.',
      };
      const serverError = response.status >= 500;
      const error = new Error(
        hints[response.status] ||
          (serverError
            ? 'Spotify is having trouble right now. Try again in a moment.'
            : data?.error?.message ||
              data?.error_description ||
              `Spotify HTTP ${response.status}`),
      );
      error.status = response.status;
      if (response.status === 429)
        error.retryAfter = Math.max(
          1,
          Number(response.headers.get('retry-after')) || 30,
        );
      throw error;
    }
    return data;
  }
  saveCooldowns() {
    const now = Date.now();
    this.onCooldowns(
      Object.fromEntries([...this.cooldowns].filter(([, at]) => at > now)),
    );
  }
  async api(path, options = {}) {
    const group = limitGroup(path),
      until = this.cooldowns.get(group) || 0;
    if (Date.now() < until) throw cooldownError(group, until);
    const request = async () =>
      this.request(`${API}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${await this.auth.ensureToken()}`,
          ...options.headers,
        },
      });
    try {
      try {
        return await request();
      } catch (error) {
        if (
          error.status >= 500 &&
          (!options.method || options.method === 'GET')
        ) {
          await this.wait(this.serverRetryMs);
          return await request();
        }
        if (error.status !== 401 || !this.auth.refreshToken) throw error;
        this.auth.invalidateAccessToken();
        return await request();
      }
    } catch (error) {
      if (error.status === 429 && error.retryAfter) {
        const at = Date.now() + error.retryAfter * 1000;
        this.cooldowns.set(group, at);
        this.saveCooldowns();
        throw cooldownError(group, at);
      }
      throw error;
    }
  }
}
module.exports = { SpotifyHttp };
