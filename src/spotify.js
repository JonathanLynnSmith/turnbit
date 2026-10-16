const http = require('node:http');
const crypto = require('node:crypto');
const API = 'https://api.spotify.com/v1';
const ACCOUNTS = 'https://accounts.spotify.com';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read user-library-modify';
const REDIRECT_URI = 'http://127.0.0.1:43821/callback';
// Spotify throttles per endpoint (Liked Songs and like checks share one limit), so a 429 there must not block playback.
const limitGroup = path => /^\/me\/(library|tracks)(\/|\?|$)/.test(path) ? 'library' : path.split('?')[0].replace(/\/[A-Za-z0-9]{22}(?=\/|$)/g, '/{id}');
const groupLabel = group => group === 'library' ? 'Liked Songs and likes' : group.startsWith('/me/player') ? 'playback control' : group.includes('playlists') ? 'playlists' : 'this feature';
const untilText = at => new Date(at).toLocaleString([], at - Date.now() > 12 * 3600000 ? { weekday: 'short', hour: 'numeric', minute: '2-digit' } : { hour: 'numeric', minute: '2-digit' });
const cooldownError = (group, at) => Object.assign(new Error(`Spotify rate limit: ${groupLabel(group)} paused until ${untilText(at)}.`), { status: 429 });
const sameTrack = (item, local) => !!item?.name && !!local?.title && item.name.trim().toLowerCase() === local.title.trim().toLowerCase();
class SpotifyClient {
  constructor(onState, options = {}) {
    this.onState = onState; this.fetch = options.fetch || globalThis.fetch;
    this.openExternal = options.openExternal || (url => require('electron').shell.openExternal(url));
    this.onAuth = options.onAuth || (() => {}); this.persist = options.persist || (() => {});
    this.clientId = options.session?.clientId || ''; this.refreshToken = options.session?.refreshToken || null;
    this.token = null; this.expiresAt = 0; this.deviceId = ''; this.cooldowns = new Map();
    this.likeStates=new Map();this.playbackRead=0;this.playbackState=null;this.stateRevision=0;
    this.likeDelays=options.likeDelays||[1000,3000,8000];
    // Liked status only changes on a new track or a Like press; recheck occasionally for changes made in other Spotify apps.
    this.likedCache=null;this.likedRecheck=options.likedRecheck??60000;
    // Optional Windows media session for the Spotify desktop app: local state and transport without Web API calls.
    this.media=options.media||null;this.webCacheMs=options.webCacheMs??25000;this.lastLocal=null;this.mismatchRetries=0;
    this.waitForLike=options.waitForLike||(ms=>new Promise(resolve=>{const timer=setTimeout(resolve,ms);timer.unref();}));
    this.recovery={preferredDevice:null,autoLaunchSpotify:false};this.configureRecovery(options.recovery||{});
    this.launchSpotify=options.launchSpotify||(()=>this.openExternal('spotify:'));
    this.waitForDevice=options.waitForDevice||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
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
    // TURNBIT_DEBUG_API=1 (or the older DIALPOD_DEBUG_API) logs every Spotify call, so throttling (429 + Retry-After) and call volume are visible.
    if (process.env.TURNBIT_DEBUG_API || process.env.DIALPOD_DEBUG_API) { this.debugCalls = (this.debugCalls || []).filter(at => Date.now() - at < 60000).concat(Date.now()); const retry = response.headers.get('retry-after'); console.log(`[spotify] ${new Date().toLocaleTimeString()} ${options.method || 'GET'} ${new URL(url).pathname} -> ${response.status}${retry ? ` retry-after=${retry}s` : ''} (${this.debugCalls.length} calls/min)`); }
    const text = await response.text(); let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      const hints = { 403: 'Spotify denied access. Check Premium, your app user allowlist, and playback permissions.', 404: 'No active Spotify device. Open Spotify and start a track, then select a device.', 429: 'Spotify rate limit reached. Waiting for cooldown.' };
      const error = new Error(hints[response.status] || data?.error?.message || data?.error_description || `Spotify HTTP ${response.status}`); error.status = response.status;
      if (response.status === 429) error.retryAfter = Math.max(1, Number(response.headers.get('retry-after')) || 30);
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
    const group = limitGroup(path), until = this.cooldowns.get(group) || 0;
    if (Date.now() < until) throw cooldownError(group, until);
    const request = async () => this.request(`${API}${path}`, { ...options, headers: { Authorization: `Bearer ${await this.ensureToken()}`, ...options.headers } });
    try {
      try { return await request(); } catch (error) { if (error.status !== 401 || !this.refreshToken) throw error; this.token = null; return await request(); }
    } catch (error) {
      if (error.status === 429 && error.retryAfter) { const at = Date.now() + error.retryAfter * 1000; this.cooldowns.set(group, at); throw cooldownError(group, at); }
      throw error;
    }
  }
  // Local state is trusted only when Spotify reports playback on a computer, so phone or speaker playback stays on the Web API.
  localTrusted(web=this.playbackState){return !!(this.media?.state?.available&&web?.device?.type==='Computer');}
  localMismatch(web=this.playbackState){return this.localTrusted(web)&&!!this.media.state.title&&!sameTrack(web?.item,this.media.state);}
  // A song picked in TurnBit is shown right away; Spotify's own state replaces it once it reports the new track.
  pendingActive(){return !!this.pendingPlay&&Date.now()<this.pendingPlay.until;}
  switching(web=this.playbackState){return this.pendingActive()||this.localMismatch(web);}
  merge(web){
    let merged=web;
    const local=this.localTrusted(web)?this.media.current():null;
    if(local){
      merged={...web,is_playing:!!local.playing,localSession:true};
      if(local.durationMs>0)merged.progress_ms=local.positionMs;
      // The Web API lags a song change; show the local title until it catches up.
      if(local.title&&!sameTrack(web.item,local)){merged.item={name:local.title,artists:local.artist?[{name:local.artist}]:[],album:{name:local.album||'',images:[]},duration_ms:local.durationMs,uri:`local-session:${local.title}|${local.artist||''}`};merged.liked=null;merged.likedPending=false;merged.provisional=true;}
    }
    if(this.pendingActive()){
      const item=this.pendingPlay.item,started=!!local&&sameTrack(item,local);
      merged={...(merged||{}),item,is_playing:started?!!local.playing:true,progress_ms:started&&local.durationMs>0?local.positionMs:0,liked:null,likedPending:false,provisional:true};
    }
    return merged;
  }
  emit(state){this.onState(this.merge(state));}
  localChanged(local){
    const previous=this.lastLocal;this.lastLocal=local;
    if(!this.refreshToken)return;
    const trackChanged=!!previous&&(previous.title!==local.title||previous.artist!==local.artist);
    const appeared=!previous?.available&&local.available;
    if(trackChanged||appeared||(previous&&previous.playing!==local.playing&&!this.localTrusted()))this.scheduleRefresh(800);
    if(this.playbackState)this.emit(this.playbackState);
  }
  scheduleRefresh(ms){clearTimeout(this.refreshTimer);this.refreshTimer=setTimeout(()=>this.getPlaybackState({force:true}).catch(()=>{}),ms);this.refreshTimer.unref?.();}
  async getPlaybackState({force=false}={}) {
    if(!force&&this.playbackState&&this.localTrusted()&&!this.switching()&&Date.now()-this.playbackRead<this.webCacheMs){this.emit(this.playbackState);return this.playbackState;}
    const revision=this.stateRevision;
    const state = await this.api('/me/player');
    if(state){state.liked=null;if(!state.item?.is_local&&/^spotify:track:[a-zA-Z0-9]{22}$/.test(state.item?.uri||'')){
      const cached=this.likeStates.get(state.item.uri);
      if(cached&&Date.now()<cached.until)state.liked=cached.liked;
      else if(this.likedCache?.uri===state.item.uri&&Date.now()-this.likedCache.at<this.likedRecheck)state.liked=this.likedCache.liked;
      else try{const saved=await this.api(`/me/library/contains?${new URLSearchParams({uris:state.item.uri})}`);if(typeof saved?.[0]==='boolean'){state.liked=saved[0];this.likedCache={uri:state.item.uri,liked:saved[0],at:Date.now()};}}catch{/* Library lookup must not interrupt playback. */}
      const latest=this.likeStates.get(state.item.uri);if(latest&&Date.now()<latest.until){state.liked=latest.liked;state.likedPending=!latest.confirmed;}
    }}
    // Spotify's reads lag volume writes; keep the value TurnBit just set so the dial does not snap back.
    if(state?.device&&this.volumeWrite&&Date.now()-this.volumeWrite.at<5000)state.device={...state.device,volume_percent:this.volumeWrite.value};
    if(revision!==this.stateRevision)return this.playbackState;
    this.playbackState=state;this.playbackRead=Date.now();
    if(this.pendingPlay&&state?.item?.uri===this.pendingPlay.item.uri)this.pendingPlay=null;
    if(this.localMismatch(state)){if(this.mismatchRetries++<3)this.scheduleRefresh(1500);}else this.mismatchRetries=0;
    this.emit(state);return state;
  }
  getDevices() { return this.api('/me/player/devices'); }
  configureRecovery(value={}){
    if(Object.hasOwn(value,'preferredDevice')){
      const device=value.preferredDevice;
      if(device!==null&&(!device||typeof device.id!=='string'||!device.id||device.id.length>256||typeof device.name!=='string'||device.name.length>256))throw new Error('Select a valid preferred device.');
      const changed=JSON.stringify(this.recovery.preferredDevice)!==JSON.stringify(device?{id:device.id,name:device.name,type:String(device.type||'').slice(0,64)}:null);
      this.recovery.preferredDevice=device?{id:device.id,name:device.name,type:String(device.type||'').slice(0,64)}:null;
      if(changed)this.deviceId=device?.id||'';
    }
    if(typeof value.autoLaunchSpotify==='boolean')this.recovery.autoLaunchSpotify=value.autoLaunchSpotify;
    return {...this.recovery};
  }
  recoveryDevice(devices=[]){
    const available=(Array.isArray(devices)?devices:[]).filter(device=>device.id&&!device.is_restricted),preferred=this.recovery.preferredDevice;
    if(preferred){const exact=available.find(device=>device.id===preferred.id);if(exact)return exact;const matches=available.filter(device=>device.name===preferred.name&&device.type?.toLowerCase()===preferred.type?.toLowerCase());return matches.length===1?matches[0]:null;}
    return available.find(device=>device.is_active)||(available.filter(device=>device.type?.toLowerCase()==='computer').length===1?available.find(device=>device.type?.toLowerCase()==='computer'):available.length===1?available[0]:null);
  }
  async recoverDevice(){
    this.onState({recoveryMessage:'Connecting to Spotify…'});
    if(this.pendingPlay)this.pendingPlay.until=Date.now()+30000;
    let device=this.recoveryDevice((await this.getDevices())?.devices);
    if(!device&&this.recovery.autoLaunchSpotify){
      await this.launchSpotify();
      for(const delay of [500,1500,3000]){await this.waitForDevice(delay);device=this.recoveryDevice((await this.getDevices())?.devices);if(device)break;}
    }
    if(!device)throw new Error(this.recovery.preferredDevice?'Preferred Spotify device is unavailable. Open Spotify on that device or choose another preferred device.':'No Spotify device is available. Open Spotify or select a preferred device in Settings.');
    await this.api('/me/player',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({device_ids:[device.id],play:false})});
    this.deviceId=device.id;
    if(this.recovery.preferredDevice){this.recovery.preferredDevice={id:device.id,name:device.name,type:device.type};this.onState({recoveredDevice:this.recovery.preferredDevice});}
    await this.waitForDevice(300);
  }
  async startPlayback(body){
    const send=()=>this.api(`/me/player/play${this.deviceId?`?device_id=${encodeURIComponent(this.deviceId)}`:''}`,{method:'PUT',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    try{return await send();}catch(error){if(error.status!==404)throw error;}
    await this.recoverDevice();
    try{const result=await send();this.onState({recoveryMessage:'Spotify reconnected · playback request sent'});return result;}catch(error){if(error.status===404)throw new Error('Spotify is still starting. Try Play again in a moment.');throw error;}
  }
  publishLike(uri,entry,error){
    if(this.likeStates.get(uri)!==entry)return;
    this.stateRevision++;
    if(this.playbackState?.item?.uri===uri){this.playbackState={...this.playbackState,liked:entry.liked,likedPending:!entry.confirmed,likeError:error};this.emit(this.playbackState);}
  }
  async verifyLike(uri,entry){
    let observed=null;
    for(const delay of this.likeDelays){
      const blocked=(this.cooldowns.get('library')||0)-Date.now();if(blocked>30000)break;
      await this.waitForLike(Math.max(delay,blocked));
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
      const state=command==='like'&&this.playbackState&&Date.now()-this.playbackRead<6000&&!this.switching()?this.playbackState:await this.getPlaybackState({force:true});
      if(!state)throw new Error('Open Spotify and start a song first.');
      if(command==='like'&&this.switching(state))throw new Error('Spotify is still switching songs. Try again in a moment.');
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
      this.emit({...state,[command==='shuffle'?'shuffle_state':'repeat_state']:next});
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
      const pending=valid(value?.item?.uri)?{item:value.item,until:Date.now()+8000}:null;
      if(pending){this.pendingPlay=pending;this.emit(this.playbackState);}
      try{await this.startPlayback(body);}
      catch(error){if(this.pendingPlay===pending&&pending){this.pendingPlay=null;this.emit(this.playbackState);}throw error;}
      if(pending)this.scheduleRefresh(1500);return;
    }
    if (command === 'device') {
      if (typeof value !== 'string' || !value) throw new Error('Select a playback device.');
      await this.api('/me/player', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_ids: [value], play: false }) }); this.deviceId = value; return;
    }
    // Transport goes to Spotify's own Windows media session when it is the active player; the Web API is the fallback.
    const localReady={play:true,pause:true,toggle:true,next:this.media?.state?.canNext,previous:this.media?.state?.canPrevious,seek:this.media?.state?.canSeek&&Number.isFinite(value)};
    if(['play','toggle'].includes(command)&&!this.playbackState?.device&&!this.deviceId&&!this.recovery.preferredDevice&&this.media?.state?.available&&await this.media.command('play'))return;
    if(localReady[command]&&this.localTrusted()&&await this.media.command(command,value))return;
    if (command === 'toggle') {
      let state;try{state=await this.getPlaybackState();}catch(error){if(error.status!==404)throw error;}
      command=state?.is_playing?'pause':'play';
    }
    if(command==='play'){await this.startPlayback();return;}
    const methods = { play: 'PUT', pause: 'PUT', next: 'POST', previous: 'POST', seek: 'PUT', volume: 'PUT' };
    if (!methods[command]) throw new Error(`Unknown playback command: ${command}`);
    const params = new URLSearchParams(); if (this.deviceId) params.set('device_id', this.deviceId);
    if (command === 'seek' || command === 'volume') {
      if (!Number.isFinite(value)) throw new Error('Playback value must be a finite number.');
      params.set(command === 'seek' ? 'position_ms' : 'volume_percent', Math.round(Math.max(0, Math.min(command === 'volume' ? 100 : 86400000, value))));
    }
    await this.api(`/me/player/${command}${params.size ? `?${params}` : ''}`, { method: methods[command] });
    // Update the cached state too; while the desktop session is trusted it is reused instead of re-read.
    if (command === 'volume') {
      const volume = Number(params.get('volume_percent')); this.volumeWrite = { value: volume, at: Date.now() };
      if (this.playbackState?.device) this.playbackState = { ...this.playbackState, device: { ...this.playbackState.device, volume_percent: volume } };
    }
  }
  logout() { this.cancelLogin(); this.token = null; this.refreshToken = null; this.expiresAt = 0; this.deviceId = ''; this.playbackState=null;this.playbackRead=0;this.likeStates.clear();this.likedCache=null;clearTimeout(this.refreshTimer);this.lastLocal=null;this.mismatchRetries=0;this.pendingPlay=null;this.volumeWrite=null;this.stateRevision++;this.save(); this.notify(); return { ok: true }; }
}
module.exports = { SpotifyClient, REDIRECT_URI };
