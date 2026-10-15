const http = require('node:http');
const crypto = require('node:crypto');
const API = 'https://api.spotify.com/v1';
const ACCOUNTS = 'https://accounts.spotify.com';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read user-library-modify';
const REDIRECT_URI = 'http://127.0.0.1:43821/callback';
class SpotifyClient {
  constructor(onState, options = {}) {
    this.onState = onState; this.fetch = options.fetch || globalThis.fetch;
    this.openExternal = options.openExternal || (url => require('electron').shell.openExternal(url));
    this.onAuth = options.onAuth || (() => {}); this.persist = options.persist || (() => {});
    this.clientId = options.session?.clientId || ''; this.refreshToken = options.session?.refreshToken || null;
    this.token = null; this.expiresAt = 0; this.deviceId = ''; this.retryAt = 0;
    this.likeStates=new Map();this.playbackRead=0;this.playbackState=null;this.stateRevision=0;
    this.likeDelays=options.likeDelays||[1000,3000,8000];
    // Liked status only changes on a new track or a Like press; recheck occasionally for changes made in other Spotify apps.
    this.likedCache=null;this.likedRecheck=options.likedRecheck??60000;
    this.waitForLike=options.waitForLike||(ms=>new Promise(resolve=>{const timer=setTimeout(resolve,ms);timer.unref();}));
  }
  status() { return { clientId: this.clientId, connected: !!this.refreshToken, authorizing: !!this.server }; }
  configure(clientId) {
    const id = String(clientId || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error('Enter the 32-character Spotify Client ID from your dashboard.');
    if (id !== this.clientId) this.logout();
    this.clientId = id; this.save(); return this.status();
  }
  save() { this.persist({ clientId: this.clientId, refreshToken: this.refreshToken }); }
  notify(error) { this.onAuth({ ...this.status(), error: error?.message }); }
  cancelLogin() { clearTimeout(this.authTimer); this.server?.close(); this.server = null; }
  async request(url, options = {}) {
    const response = await this.fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const text = await response.text(); let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      const hints = { 403: 'Spotify denied access. Check Premium, your app user allowlist, and playback permissions.', 404: 'No active Spotify device. Open Spotify and start a track, then select a device.', 429: 'Spotify rate limit reached. Waiting for cooldown.' };
      const error = new Error(hints[response.status] || data?.error?.message || data?.error_description || `Spotify HTTP ${response.status}`); error.status = response.status;
      if (response.status === 429) this.retryAt = Date.now() + Math.max(1, Number(response.headers.get('retry-after')) || 30) * 1000;
      throw error;
    }
    return data;
  }
  async login() {
    if (!this.clientId) throw new Error('Add a Spotify Client ID first.');
    this.cancelLogin();
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(24).toString('base64url'); let consumed = false;
    const server = http.createServer(async (req, res) => {
      res.setHeader('Connection', 'close');
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') { res.writeHead(404); return res.end(); }
      if (url.searchParams.get('state') !== state || consumed) { res.writeHead(400); return res.end('Invalid authorization state.'); }
      consumed = true;
      try {
        if (url.searchParams.has('error') || !url.searchParams.get('code')) throw new Error('Spotify authorization was cancelled. Try connecting again.');
        const data = await this.request(`${ACCOUNTS}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: this.clientId, grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: REDIRECT_URI, code_verifier: verifier }) });
        if (this.server !== server) { res.writeHead(409); return res.end('This login was cancelled.'); }
        this.setTokens(data); this.notify();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<h2>DialPod is connected.</h2><p>Close this tab and return to the widget.</p>');
        this.getPlaybackState().catch(error => this.onState({ error: error.message }));
      } catch (error) { res.writeHead(400); res.end('Connection failed. Return to DialPod for details.'); this.notify(error); }
      finally { if (this.server === server) this.cancelLogin(); }
    });
    this.server = server;
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(43821, '127.0.0.1', resolve); });
      this.authTimer = setTimeout(() => { this.cancelLogin(); this.notify(new Error('Spotify login timed out. Connect again.')); }, 180000); this.authTimer.unref();
      const auth = new URL(`${ACCOUNTS}/authorize`);
      auth.search = new URLSearchParams({ response_type: 'code', client_id: this.clientId, scope: SCOPES, code_challenge_method: 'S256', code_challenge: challenge, redirect_uri: REDIRECT_URI, state }).toString();
      await this.openExternal(auth.toString()); this.notify(); return { ok: true };
    } catch (error) { this.cancelLogin(); this.notify(error); throw error; }
  }
  setTokens(data) { this.token = data.access_token; this.refreshToken = data.refresh_token || this.refreshToken; this.expiresAt = Date.now() + data.expires_in * 1000 - 60000; this.save(); }
  async ensureToken() {
    if (this.token && Date.now() < this.expiresAt) return this.token;
    if (!this.refreshToken) throw new Error('Connect Spotify to control playback.');
    if (!this.refreshing) this.refreshing = this.request(`${ACCOUNTS}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: this.clientId, grant_type: 'refresh_token', refresh_token: this.refreshToken }) }).then(data => this.setTokens(data)).catch(error => { if (error.status === 400 || error.status === 401) this.logout(); throw error; }).finally(() => { this.refreshing = null; });
    await this.refreshing; return this.token;
  }
  async api(path, options = {}) {
    if (Date.now() < this.retryAt) throw new Error('Waiting for Spotify rate-limit cooldown.');
    const request = async () => this.request(`${API}${path}`, { ...options, headers: { Authorization: `Bearer ${await this.ensureToken()}`, ...options.headers } });
    try { return await request(); } catch (error) { if (error.status !== 401 || !this.refreshToken) throw error; this.token = null; return request(); }
  }
  async getPlaybackState() {
    const revision=this.stateRevision;
    const state = await this.api('/me/player');
    if(state){state.liked=null;if(!state.item?.is_local&&/^spotify:track:[a-zA-Z0-9]{22}$/.test(state.item?.uri||'')){
      const cached=this.likeStates.get(state.item.uri);
      if(cached&&Date.now()<cached.until)state.liked=cached.liked;
      else if(this.likedCache?.uri===state.item.uri&&Date.now()-this.likedCache.at<this.likedRecheck)state.liked=this.likedCache.liked;
      else try{const saved=await this.api(`/me/library/contains?${new URLSearchParams({uris:state.item.uri})}`);if(typeof saved?.[0]==='boolean'){state.liked=saved[0];this.likedCache={uri:state.item.uri,liked:saved[0],at:Date.now()};}}catch{/* Library lookup must not interrupt playback. */}
      const latest=this.likeStates.get(state.item.uri);if(latest&&Date.now()<latest.until){state.liked=latest.liked;state.likedPending=!latest.confirmed;}
    }}
    if(revision!==this.stateRevision)return this.playbackState;
    this.playbackState=state;this.playbackRead=Date.now();
    this.onState(state);return state;
  }
  getDevices() { return this.api('/me/player/devices'); }
  publishLike(uri,entry,error){
    if(this.likeStates.get(uri)!==entry)return;
    this.stateRevision++;
    if(this.playbackState?.item?.uri===uri){this.playbackState={...this.playbackState,liked:entry.liked,likedPending:!entry.confirmed,likeError:error};this.onState(this.playbackState);}
  }
  async verifyLike(uri,entry){
    let observed=null;
    for(const delay of this.likeDelays){
      await this.waitForLike(Math.max(delay,this.retryAt-Date.now()));
      if(this.likeStates.get(uri)!==entry)return;
      try{
        const saved=await this.api(`/me/library/contains?${new URLSearchParams({uris:uri})}`);
        if(this.likeStates.get(uri)!==entry)return;
        if(typeof saved?.[0]==='boolean')observed=saved[0];
        if(observed===entry.liked){this.likedCache={uri,liked:observed,at:Date.now()};entry.confirmed=true;entry.until=Date.now()+4000;this.publishLike(uri,entry);return;}
      }catch{/* Retry confirmation reads, never blindly replay a toggle. */}
    }
    if(this.likeStates.get(uri)!==entry)return;
    entry.confirmed=true;entry.until=0;entry.liked=observed;
    this.likedCache=typeof observed==='boolean'?{uri,liked:observed,at:Date.now()}:null;
    this.publishLike(uri,entry,'Spotify has not confirmed the like change. Its latest state is shown; press Like to retry.');
  }
  library(kind, id, offset = 0) {
    if(!Number.isInteger(offset)||offset<0||offset>100000)throw new Error('Invalid library page.');
    const paging=`limit=50&offset=${offset}`;
    if(kind==='playlists')return this.api(`/me/playlists?${paging}`);
    if(kind==='songs')return this.api(`/me/tracks?${paging}`);
    if(kind==='playlist' && typeof id==='string' && /^[a-zA-Z0-9]{22}$/.test(id))return this.api(`/playlists/${id}/items?${paging}`);
    throw new Error('Invalid library request.');
  }
  async command(command, value) {
    if(['like','shuffle','repeat'].includes(command)) {
      const state=command==='like'&&this.playbackState&&Date.now()-this.playbackRead<6000?this.playbackState:await this.getPlaybackState();
      if(!state)throw new Error('Open Spotify and start a song first.');
      if(command==='like') {
        const item=state.item;
        if(item?.is_local||!/^spotify:track:[a-zA-Z0-9]{22}$/.test(item?.uri||''))throw new Error('The current item is not a Spotify song that can be liked.');
        if(typeof state.liked!=='boolean')throw new Error('Could not check whether this song is liked. Try again.');
        const liked=!state.liked;
        // The write is queued by the main process. Preserve its acknowledged
        // result across delayed polls and Spotify's briefly stale library reads.
        try{await this.api(`/me/library?${new URLSearchParams({uris:item.uri})}`,{method:liked?'PUT':'DELETE'});}
        catch(error){if(error.status===403)throw new Error('Reconnect Spotify in Settings to grant permission to save Liked Songs.');throw error;}
        const entry={liked,confirmed:false,until:Date.now()+60000};this.likeStates.set(item.uri,entry);this.publishLike(item.uri,entry);
        entry.verification=this.verifyLike(item.uri,entry);
        return {message:liked?'Syncing like with Spotify…':'Syncing unlike with Spotify…'};
      }
      const next=command==='shuffle'?!state.shuffle_state:({off:'context',context:'track',track:'off'}[state.repeat_state]||'context');
      const params=new URLSearchParams({state:String(next)});
      if(state.device?.id)params.set('device_id',state.device.id);
      await this.api(`/me/player/${command}?${params}`,{method:'PUT'});
      this.onState({...state,[command==='shuffle'?'shuffle_state':'repeat_state']:next});
      return {message:command==='shuffle'?`Shuffle ${next?'on':'off'}`:`Repeat: ${{off:'off',context:'all',track:'one song'}[next]}`};
    }
    if(command==='play-item') {
      const valid = uri => typeof uri==='string' && /^spotify:(track|episode):[a-zA-Z0-9]{22}$/.test(uri);
      let body;
      if(value?.contextUri && /^spotify:playlist:[a-zA-Z0-9]{22}$/.test(value.contextUri)) {
        body={context_uri:value.contextUri};
        if(value.position!==undefined){if(!Number.isInteger(value.position)||value.position<0)throw new Error('Invalid playlist position.');body.offset={position:value.position};}
      } else if(valid(value?.uri))body={uris:[value.uri]};
      else throw new Error('This item cannot be played through Spotify.');
      await this.api(`/me/player/play${this.deviceId?`?device_id=${encodeURIComponent(this.deviceId)}`:''}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return;
    }
    if (command === 'device') {
      if (typeof value !== 'string' || !value) throw new Error('Select a playback device.');
      await this.api('/me/player', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_ids: [value], play: false }) }); this.deviceId = value; return;
    }
    if (command === 'toggle') command = (await this.getPlaybackState())?.is_playing ? 'pause' : 'play';
    const methods = { play: 'PUT', pause: 'PUT', next: 'POST', previous: 'POST', seek: 'PUT', volume: 'PUT' };
    if (!methods[command]) throw new Error(`Unknown playback command: ${command}`);
    const params = new URLSearchParams(); if (this.deviceId) params.set('device_id', this.deviceId);
    if (command === 'seek' || command === 'volume') {
      if (!Number.isFinite(value)) throw new Error('Playback value must be a finite number.');
      params.set(command === 'seek' ? 'position_ms' : 'volume_percent', Math.round(Math.max(0, Math.min(command === 'volume' ? 100 : 86400000, value))));
    }
    await this.api(`/me/player/${command}${params.size ? `?${params}` : ''}`, { method: methods[command] });
  }
  logout() { this.cancelLogin(); this.token = null; this.refreshToken = null; this.expiresAt = 0; this.deviceId = ''; this.playbackState=null;this.playbackRead=0;this.likeStates.clear();this.likedCache=null;this.stateRevision++;this.save(); this.notify(); return { ok: true }; }
}
module.exports = { SpotifyClient, REDIRECT_URI };
