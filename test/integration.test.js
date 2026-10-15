const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const { createBridge } = require('../src/bridge');
const { SpotifyClient, REDIRECT_URI } = require('../src/spotify');
const response = (data, status=200, headers={}) => new Response(status===204?null:JSON.stringify(data), {status,headers});
test('Spotify routes transport, clamps values and targets selected device', async()=>{
  const requests=[];
  const client=new SpotifyClient(()=>{}, {fetch:async(url,options)=>{requests.push({url,options});return response(null,204);}});
  client.setTokens({access_token:'test',refresh_token:'refresh',expires_in:3600});
  await client.command('device','desktop'); await client.command('next'); await client.command('previous'); await client.command('volume',200); await client.command('seek',-10);
  assert.deepEqual(JSON.parse(requests[0].options.body),{device_ids:['desktop'],play:false});
  assert.match(requests[1].url,/\/next\?device_id=desktop$/); assert.equal(requests[1].options.method,'POST');
  assert.match(requests[2].url,/\/previous\?/); assert.match(requests[3].url,/volume_percent=100/); assert.match(requests[4].url,/position_ms=0/);
  await assert.rejects(client.command('volume',NaN),/finite/); await assert.rejects(client.command('invalid'),/Unknown/);
});
test('Spotify deduplicates refresh and observes Retry-After',async()=>{
  let calls=0;
  const client=new SpotifyClient(()=>{}, {session:{clientId:'a'.repeat(32),refreshToken:'refresh'},fetch:async()=>{calls++;return response({access_token:'new',expires_in:3600});}});
  assert.deepEqual(await Promise.all([client.ensureToken(),client.ensureToken()]),['new','new']);assert.equal(calls,1);
  client.fetch=async()=>response({},429,{'retry-after':'10'});
  await assert.rejects(client.getDevices(),/rate limit/);assert.ok(client.cooldowns.get('/me/player/devices')>Date.now()+9000);
  await assert.rejects(client.getDevices(),/paused until/);
});
test('PKCE callback verifies state, completes exchange and handles cancellation',async t=>{
  let authorization, exchanged, auth;
  const client=new SpotifyClient(()=>{}, {openExternal:async url=>{authorization=new URL(url);},onAuth:data=>{auth=data;},fetch:async(url,options)=>{
    if(url.endsWith('/api/token')){exchanged=options.body;return response({access_token:'access',refresh_token:'refresh',expires_in:3600});}return response(null,204);
  }});
  t.after(()=>client.cancelLogin());client.configure('a'.repeat(32));await client.login();
  assert.equal(authorization.searchParams.get('redirect_uri'),REDIRECT_URI);assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
  let result=await fetch(`${REDIRECT_URI}?state=wrong&code=test`);assert.equal(result.status,400);assert.equal(client.status().connected,false);
  const state=authorization.searchParams.get('state');result=await fetch(`${REDIRECT_URI}?state=${state}&code=test`);assert.equal(result.status,200);
  const challenge=require('node:crypto').createHash('sha256').update(exchanged.get('code_verifier')).digest('base64url');assert.equal(challenge,authorization.searchParams.get('code_challenge'));assert.equal(client.status().connected,true);
  client.logout();await client.login();result=await fetch(`${REDIRECT_URI}?state=${authorization.searchParams.get('state')}&error=access_denied`);assert.equal(result.status,400);assert.match(auth.error,/cancelled/);assert.equal(client.server,null);
});
test('loopback bridge forwards validated commands and rejects malformed or website requests',async t=>{
  const events=[];const server=createBridge(event=>events.push(event),0);t.after(()=>server.close());await once(server,'listening');
  const url=`http://127.0.0.1:${server.address().port}`;
  const post=(event,origin)=>fetch(`${url}/device/event`,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(event)});
  const preflight=await fetch(`${url}/device/event`,{method:'OPTIONS',headers:{Origin:'file://','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'file://');
  assert.equal((await post({type:'dial',delta:1,held:true},'null')).status,204);assert.deepEqual(events[0],{type:'dial',delta:1,held:true});
  assert.equal((await post({type:'command',command:'next'})).status,204);
  assert.equal((await post({type:'command',command:'delete'})).status,400);assert.equal((await post({type:'dial',delta:Infinity})).status,400);
  assert.equal((await post({type:'heartbeat'},'https://example.com')).status,403);
  assert.equal((await post({type:'heartbeat',padding:'x'.repeat(5000)})).status,413);
  const qtEvent=await post({type:'command',command:'select'},'file://');assert.equal(qtEvent.status,204);assert.equal(qtEvent.headers.get('access-control-allow-origin'),'file://');
  const state=await (await fetch(`${url}/device/state`)).json();assert.equal(state.pluginOnline,true);assert.equal(state.lastEvent.command,'select');assert.equal(state.eventCount,3);
});
test('Ulanzi plugin maps transport keys and uses dial release for selection',async()=>{
  const dir=path.join(__dirname,'../ulanzi-plugin/com.ulanzi.dialpod.ulanziPlugin');
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));assert.equal(manifest.Type,'JavaScript');assert.equal(manifest.Actions.length,13);
  for(const action of manifest.Actions){assert.ok(fs.existsSync(path.join(dir,action.Icon)));assert.ok(action.UUID.startsWith(manifest.UUID+'.'));assert.deepEqual(action.Devices,['Dial']);}
  const handlers={},events=[];let connected;
  const ud={connect:id=>{connected=id;},websocket:{readyState:1}};
  for(const name of ['onConnected','onKeyDown','onKeyUp','onRun','onDialDown','onDialUp','onDialRotate'])ud[name]=fn=>{handlers[name]=fn;};
  vm.runInNewContext(fs.readFileSync(path.join(dir,'app.js'),'utf8'),{$UD:ud,fetch:async(_,options)=>{events.push(JSON.parse(options.body));return {ok:true};},AbortSignal,WebSocket:{OPEN:1},setTimeout,clearTimeout,setInterval:()=>{},console});
  assert.equal(connected,manifest.UUID);handlers.onKeyDown({uuid:manifest.UUID+'.next'});handlers.onRun({uuid:manifest.UUID+'.next'});handlers.onKeyUp({uuid:manifest.UUID+'.next'});
  handlers.onDialDown();handlers.onDialRotate({rotateEvent:'hold-right'});handlers.onDialUp();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events.map(e=>e.command||e.type),['next-down','next-up','center-down','dial','center-up']);assert.equal(events[3].held,true);
  handlers.onDialDown();handlers.onDialUp();await new Promise(resolve=>setImmediate(resolve));assert.equal(events[5].command,'center-down');assert.equal(events[6].command,'center-up');assert.equal(events[7].command,'center-click');
  for(const command of ['like','shuffle','repeat','pin']){handlers.onKeyDown({uuid:manifest.UUID+'.'+command});handlers.onRun({uuid:manifest.UUID+'.'+command});handlers.onKeyUp({uuid:manifest.UUID+'.'+command});}
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(events.slice(8).map(e=>e.command),['like','touch','shuffle','touch','repeat','touch','pin']);
});
test('idle Now Playing keeps its screen until explicit navigation and remembers the music source',()=>{
  const {WheelNavigation,IdleNowPlaying}=require('../renderer/navigation');let now=0;
  const nav=new WheelNavigation({title:'Home',rows:[{label:'Music'}]});
  const songs=nav.push({title:'Songs',libraryKind:'songs',rows:[{label:'First'},{label:'Second'}]});nav.move(1);nav.musicPath=nav.rememberMusic();
  const idle=new IdleNowPlaying(nav,{now:()=>now});
  now=9999;assert.equal(idle.tick(),false);assert.equal(nav.current,songs);
  now=10000;assert.equal(idle.tick(),true);assert.equal(nav.current.kind,'now');assert.equal(nav.stack.length,2);
  assert.equal(idle.tick(),false);idle.noteActivity();nav.move(1);assert.equal(nav.current.kind,'now');assert.equal(songs.selected,1);
  assert.equal(nav.returnToMusic(),true);assert.equal(nav.current,songs);assert.equal(nav.current.selected,1);
  now=19999;assert.equal(idle.tick(),false);now=20000;assert.equal(idle.tick(),true);nav.goHome();
  assert.equal(nav.current.title,'Home');nav.push({title:'Settings',rows:[]});nav.showIdle();assert.equal(nav.returnToMusic(),true);assert.equal(nav.current,songs);
  now=30000;assert.equal(idle.tick(false),false);now=39999;assert.equal(idle.tick(),false);
  nav.push({title:'Now Playing',kind:'now'});now=40000;assert.equal(idle.tick(),false);assert.equal(idle.wake(),false);assert.equal(nav.current.kind,'now');
  nav.reset({title:'Home',rows:[]});assert.equal(nav.returnToMusic(),false);
});
test('library paging uses current Spotify item endpoints and plays selected playlist positions',async()=>{
  const requests=[];
  const client=new SpotifyClient(()=>{},{fetch:async(url,options)=>{requests.push({url,options});return response({items:[]});}});
  client.setTokens({access_token:'test',refresh_token:'refresh',expires_in:3600});
  const id='a'.repeat(22);
  await client.library('playlists',null,50);await client.library('songs');await client.library('playlist',id,100);
  assert.match(requests[0].url,/\/me\/playlists\?limit=50&offset=50$/);
  assert.match(requests[1].url,/\/me\/tracks\?/);assert.match(requests[2].url,new RegExp(`/playlists/${id}/items\\?limit=50&offset=100$`));
  await client.command('play-item',{contextUri:`spotify:playlist:${id}`,position:104});
  assert.deepEqual(JSON.parse(requests[3].options.body),{context_uri:`spotify:playlist:${id}`,offset:{position:104}});
  await client.command('play-item',{uri:`spotify:track:${id}`});assert.deepEqual(JSON.parse(requests[4].options.body),{uris:[`spotify:track:${id}`]});
  await assert.rejects(client.command('play-item',{uri:'https://example.com'}),/cannot be played/);
  assert.throws(()=>client.library('playlist','../bad'),/Invalid/);assert.throws(()=>client.library('songs',null,-1),/Invalid/);
});
test('wheel hierarchy keeps parent selection, clamps navigation and does not activate disabled items',()=>{
  const {WheelNavigation}=require('../renderer/navigation');
  const nav=new WheelNavigation({title:'Home',rows:[{label:'Music'},{label:'Settings'}]});
  nav.move(10);assert.equal(nav.select().label,'Settings');
  nav.push({title:'Settings',rows:[{label:'Volume'},{label:'Unavailable',disabled:true}]});nav.move(1);assert.equal(nav.select(),null);
  nav.back();assert.equal(nav.current.title,'Home');assert.equal(nav.current.selected,1);nav.back();assert.equal(nav.stack.length,1);
  nav.move(-10);assert.equal(nav.select().label,'Music');nav.push({title:'Now Playing',kind:'now'});nav.move(1);assert.equal(nav.select(),null);
});
