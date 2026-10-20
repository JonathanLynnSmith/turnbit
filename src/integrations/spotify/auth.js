const http = require('node:http');
const crypto = require('node:crypto');
const ACCOUNTS = 'https://accounts.spotify.com';
const SCOPES =
  'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read user-library-modify';
const REDIRECT_URI = 'http://127.0.0.1:43821/callback';

// Owns authorization lifecycle and tokens; the host supplies browser opening,
// persistence, and the reaction to a connected or invalid session.
class SpotifyAuth {
  constructor({
    session = {},
    request,
    openExternal,
    persist,
    onAuth,
    onConnected,
    onInvalidSession,
  }) {
    this.clientId = session.clientId || '';
    this.refreshToken = session.refreshToken || null;
    this.token = null;
    this.expiresAt = 0;
    Object.assign(this, {
      request,
      openExternal,
      persist,
      onAuth,
      onConnected,
      onInvalidSession,
    });
  }
  status() {
    return {
      clientId: this.clientId,
      connected: !!this.refreshToken,
      authorizing: !!this.server,
    };
  }
  invalidateAccessToken() {
    this.token = null;
  }
  clear() {
    this.cancelLogin();
    this.token = null;
    this.refreshToken = null;
    this.expiresAt = 0;
  }
  notify(error) {
    this.onAuth({ ...this.status(), error: error?.message });
  }
  cancelLogin() {
    clearTimeout(this.authTimer);
    this.server?.close();
    this.server = null;
  }
  async login() {
    if (!this.clientId) throw new Error('Add a Spotify Client ID first.');
    this.cancelLogin();
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    const state = crypto.randomBytes(24).toString('base64url');
    let consumed = false;
    const server = http.createServer(async (req, res) => {
      res.setHeader('Connection', 'close');
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        return res.end();
      }
      if (url.searchParams.get('state') !== state || consumed) {
        res.writeHead(400);
        return res.end('Invalid authorization state.');
      }
      consumed = true;
      try {
        if (url.searchParams.has('error') || !url.searchParams.get('code'))
          throw new Error(
            'Spotify authorization was cancelled. Try connecting again.',
          );
        const data = await this.request(`${ACCOUNTS}/api/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.clientId,
            grant_type: 'authorization_code',
            code: url.searchParams.get('code'),
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
          }),
        });
        if (this.server !== server) {
          res.writeHead(409);
          return res.end('This login was cancelled.');
        }
        this.setTokens(data);
        this.notify();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(
          '<h2>turnbit is connected.</h2><p>Close this tab and return to the widget.</p>',
        );
        this.onConnected();
      } catch (error) {
        res.writeHead(400);
        res.end('Connection failed. Return to turnbit for details.');
        this.notify(error);
      } finally {
        if (this.server === server) this.cancelLogin();
      }
    });
    this.server = server;
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(43821, '127.0.0.1', resolve);
      });
      this.authTimer = setTimeout(() => {
        this.cancelLogin();
        this.notify(new Error('Spotify login timed out. Connect again.'));
      }, 180000);
      this.authTimer.unref();
      const auth = new URL(`${ACCOUNTS}/authorize`);
      auth.search = new URLSearchParams({
        response_type: 'code',
        client_id: this.clientId,
        scope: SCOPES,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        redirect_uri: REDIRECT_URI,
        state,
      }).toString();
      await this.openExternal(auth.toString());
      this.notify();
      return { ok: true };
    } catch (error) {
      this.cancelLogin();
      this.notify(error);
      throw error;
    }
  }
  setTokens(data) {
    this.token = data.access_token;
    this.refreshToken = data.refresh_token || this.refreshToken;
    this.expiresAt = Date.now() + data.expires_in * 1000 - 60000;
    this.persist();
  }
  async ensureToken() {
    if (this.token && Date.now() < this.expiresAt) return this.token;
    if (!this.refreshToken)
      throw new Error('Connect Spotify to control playback.');
    if (!this.refreshing)
      this.refreshing = this.request(`${ACCOUNTS}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        }),
      })
        .then((data) => this.setTokens(data))
        .catch((error) => {
          if (error.status === 400 || error.status === 401)
            this.onInvalidSession();
          throw error;
        })
        .finally(() => {
          this.refreshing = null;
        });
    await this.refreshing;
    return this.token;
  }
}
module.exports = { SpotifyAuth, REDIRECT_URI };
