const test=require('node:test');const assert=require('node:assert/strict');const {SpotifyClient}=require('../src/spotify');
const device={id:'fresh',name:'My PC',type:'Computer',is_restricted:false};
function setup(handler,recovery={}){const requests=[],waits=[],notices=[];let launches=0;const client=new SpotifyClient(state=>notices.push(state),{recovery,waitForDevice:async ms=>waits.push(ms),launchSpotify:async()=>{launches++;},fetch:async(url,options)=>{const request={path:new URL(url).pathname,url:new URL(url),options};requests.push(request);return handler(request,requests);}});client.setTokens({access_token:'test',expires_in:3600});return {client,requests,waits,notices,get launches(){return launches;}};}
const json=data=>new Response(JSON.stringify(data));const ok=()=>new Response(null,{status:204});const missing=()=>new Response(JSON.stringify({error:{message:'No active device'}}),{status:404});
test('healthy start uses one API call and never launches or enumerates devices',async()=>{const s=setup(()=>ok());await s.client.command('play-item',{uri:'spotify:track:'+'a'.repeat(22)});assert.equal(s.requests.length,1);assert.equal(s.launches,0);});
test('stale preferred device is refreshed by name/type, transferred and retried with the original playlist position',async()=>{
 let plays=0;const s=setup(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/play')?++plays===1?missing():ok():ok(),{preferredDevice:{...device,id:'old'}});
 await s.client.command('play-item',{contextUri:'spotify:playlist:'+'a'.repeat(22),position:7});assert.equal(s.requests.length,4);const playsSent=s.requests.filter(r=>r.path.endsWith('/play'));assert.equal(playsSent[1].url.searchParams.get('device_id'),'fresh');assert.deepEqual(JSON.parse(playsSent[0].options.body),JSON.parse(playsSent[1].options.body));assert.equal(JSON.parse(playsSent[1].options.body).offset.position,7);assert.equal(s.launches,0);
});
test('optional launcher runs once and device discovery is bounded',async()=>{
 const s=setup(r=>r.path.endsWith('/devices')?json({devices:[]}):missing(),{autoLaunchSpotify:true});await assert.rejects(s.client.command('play'),/No Spotify device/);assert.equal(s.launches,1);assert.equal(s.requests.filter(r=>r.path.endsWith('/devices')).length,4);assert.deepEqual(s.waits,[500,1500,3000]);
});
test('launch discovery can recover once the preferred device appears',async()=>{
 let reads=0,plays=0;const s=setup(r=>r.path.endsWith('/devices')?json({devices:++reads===3?[device]:[]}):r.path.endsWith('/play')?++plays===1?missing():ok():ok(),{preferredDevice:{...device,id:'old'},autoLaunchSpotify:true});await s.client.command('play');assert.equal(s.launches,1);assert.equal(plays,2);assert.equal(s.client.deviceId,'fresh');
});
test('no launcher when disabled, and no recovery for auth/rate-limit failures',async()=>{
 const s=setup(r=>r.path.endsWith('/devices')?json({devices:[]}):missing());await assert.rejects(s.client.command('play'));assert.equal(s.launches,0);assert.equal(s.requests.length,2);
 for(const status of [403,429]){const limited=setup(()=>new Response('{}',{status,headers:{'retry-after':'2'}}),{autoLaunchSpotify:true});await assert.rejects(limited.client.command('play'));assert.equal(limited.launches,0);assert.equal(limited.requests.length,1);}
});
test('ambiguous or restricted devices are not picked and selected device does not get reset by an unrelated option',()=>{
 const s=setup(()=>ok());assert.equal(s.client.recoveryDevice([{...device,is_restricted:true}]),null);assert.equal(s.client.recoveryDevice([device,{...device,id:'other'}]),null);s.client.deviceId='manual';s.client.configureRecovery({preferredDevice:null,autoLaunchSpotify:true});assert.equal(s.client.deviceId,'manual');
});
test('an existing local Spotify media session can resume with no Web API calls even before web device discovery',async()=>{
 const s=setup(()=>{throw new Error('Unexpected API call');});let played;s.client.media={state:{available:true},command:async command=>{played=command;return true;}};await s.client.command('toggle');assert.equal(played,'play');assert.equal(s.requests.length,0);
});

test('Play toggle also recovers when the playback-state endpoint reports no device',async()=>{
 let plays=0;const s=setup(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/play')?++plays===1?missing():ok():r.path==='/v1/me/player'&&!r.options.method?missing():ok());await s.client.command('toggle');assert.equal(plays,2);assert.equal(s.client.deviceId,'fresh');
});

// Cold starts: Spotify cannot resume an empty player, so Play has to bring its own source.
const track=n=>'spotify:track:'+String(n).repeat(22);
const likedPage=uris=>json({items:uris.map(uri=>({track:{uri}}))});
const playlistUri='spotify:playlist:'+'b'.repeat(22);
const paths=requests=>requests.map(request=>request.path.replace('/v1',''));
const bodies=requests=>requests.filter(request=>request.path.endsWith('/play')).map(request=>request.options.body?JSON.parse(request.options.body):null);

test('a healthy Play still costs a single call and reads no library',async()=>{
 const s=setup(()=>ok());await s.client.command('play');assert.equal(s.requests.length,1);assert.equal(bodies(s.requests)[0],null);
});
test('an empty player seeds Liked Songs once the device is back, and says what it started',async()=>{
 let plays=0;const s=setup(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/play')?(++plays<3?missing():ok()):r.path==='/v1/me/tracks'?likedPage([track(1),track(2)]):ok());
 await s.client.command('play');
 assert.deepEqual(paths(s.requests),['/me/player/play','/me/player/devices','/me/player','/me/player/play','/me/tracks','/me/player/play']);
 assert.deepEqual(bodies(s.requests)[2],{uris:[track(1),track(2)]});
 assert.match(s.notices.map(notice=>notice?.recoveryMessage||'').join(' '),/Liked Songs/);
});
test('the Liked Songs seed is reused, so a second cold start costs no library call',async()=>{
 const failed=new Set([1,2,4,5]);let plays=0;
 const s=setup(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/play')?(failed.has(++plays)?missing():ok()):r.path==='/v1/me/tracks'?likedPage([track(1)]):ok());
 await s.client.command('play');await s.client.command('play');
 assert.equal(s.requests.filter(r=>r.path==='/v1/me/tracks').length,1);
 assert.deepEqual(bodies(s.requests).filter(Boolean),[{uris:[track(1)]},{uris:[track(1)]}]);
});
test('a chosen playlist is what Play starts, and the library is never read',async()=>{
 let plays=0;const s=setup(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/play')?(++plays<3?missing():ok()):ok(),{coldStart:{mode:'playlist',playlist:{uri:playlistUri,name:'Road Trip'}}});
 await s.client.command('play');
 assert.deepEqual(bodies(s.requests).pop(),{context_uri:playlistUri});
 assert.equal(s.requests.some(r=>r.path==='/v1/me/tracks'),false);
 assert.match(s.notices.map(notice=>notice?.recoveryMessage||'').join(' '),/Road Trip/);
});
test('Last Session replays the context turnbit already holds without spending a read',async()=>{
 let plays=0;const s=setup(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/play')?(++plays<3?missing():ok()):ok());
 s.client.playbackState={device:{id:'fresh',type:'Computer'},item:{uri:track(3)},context:{uri:playlistUri}};s.client.playbackRead=Date.now();
 await s.client.command('play');
 assert.deepEqual(bodies(s.requests).pop(),{context_uri:playlistUri,offset:{uri:track(3)}});
 assert.equal(s.requests.some(r=>r.path==='/v1/me/tracks'||r.path==='/v1/me/player'&&!r.options.method),false);
});
test('a device that is already active with nothing loaded seeds at once, skipping device recovery',async()=>{
 const s=setup(r=>r.path==='/v1/me/tracks'?likedPage([track(1)]):ok());
 s.client.playbackState={device:{id:'fresh',type:'Computer'},item:null};s.client.playbackRead=Date.now();
 await s.client.command('play');
 assert.deepEqual(paths(s.requests),['/me/tracks','/me/player/play']);
 assert.deepEqual(bodies(s.requests)[0],{uris:[track(1)]});
});
test('turning the cold start off keeps the old behaviour with an error that points at the setting',async()=>{
 let plays=0;const s=setup(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/play')?(++plays<3?missing():ok()):ok(),{coldStart:{mode:'off',playlist:null}});
 await assert.rejects(s.client.command('play'),/Nothing was playing.*Settings/s);
 assert.equal(s.requests.some(r=>r.path==='/v1/me/tracks'),false);
});
test('a song picked in turnbit is never replaced by a seed',async()=>{
 const s=setup(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/play')?missing():ok());
 await assert.rejects(s.client.command('play-item',{uri:track(4)}),/still starting/);
 assert.equal(s.requests.some(r=>r.path==='/v1/me/tracks'),false);
});
test('cold start settings are validated and a new playlist drops the cached seed',()=>{
 const s=setup(()=>ok());
 assert.throws(()=>s.client.configureRecovery({coldStart:{mode:'playlist',playlist:null}}),/Choose a playlist/);
 assert.equal(s.client.configureRecovery({coldStart:{mode:'nonsense'}}).coldStart.mode,'last');
 s.client.coldStartCache={body:{uris:[track(1)]},at:Date.now()};
 s.client.configureRecovery({coldStart:{mode:'playlist',playlist:{uri:playlistUri,name:'Road Trip'}}});
 assert.equal(s.client.coldStartCache,null);
 assert.equal(s.client.configureRecovery({coldStart:{mode:'liked'}}).coldStart.playlist,null);
});
test('a seed Spotify is throttling never costs a resume that might have worked',async()=>{
 const s=setup(r=>r.path==='/v1/me/tracks'?new Response('{}',{status:429,headers:{'retry-after':'2'}}):ok());
 s.client.playbackState={device:{id:'fresh',type:'Computer'},item:null};s.client.playbackRead=Date.now();
 await s.client.command('play');
 assert.deepEqual(paths(s.requests),['/me/tracks','/me/player/play']);
 assert.equal(bodies(s.requests)[0],null);
});
test('Liked Songs is not a playable context, so a cold start plays its tracks instead',async()=>{
 let plays=0;const s=setup(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/play')?(++plays<3?missing():ok()):r.path==='/v1/me/tracks'?likedPage([track(5)]):ok());
 s.client.playbackState={device:{id:'fresh',type:'Computer'},item:{uri:track(5)},context:{uri:'spotify:collection:tracks'}};s.client.playbackRead=Date.now();
 await s.client.command('play');
 assert.deepEqual(bodies(s.requests).pop(),{uris:[track(5)]});
});

// Picking a device: Automatic has to land on something, or every dial press is a dead end.
const phone={id:'phone',name:'Pixel',type:'Smartphone',is_restricted:false,is_active:true};
const speaker={id:'speaker',name:'Kitchen',type:'Speaker',is_restricted:false};
function withSession(handler,{session,recovery}={}){
 const requests=[],saved=[],notices=[];
 const client=new SpotifyClient(state=>notices.push(state),{session,recovery,persist:data=>saved.push(data),waitForDevice:async()=>{},launchSpotify:async()=>{},fetch:async(url,options)=>{const request={path:new URL(url).pathname,url:new URL(url),options};requests.push(request);return handler(request,requests);}});
 client.setTokens({access_token:'test',expires_in:3600});
 return {client,requests,saved,notices};
}
test('Automatic starts on the device last used, even when Spotify calls another one active',()=>{
 const s=withSession(()=>ok(),{session:{lastDevice:{id:'speaker',name:'Kitchen',type:'Speaker'}}});
 assert.equal(s.client.recoveryDevice([phone,speaker,device]).id,'speaker');
});
test('with nothing remembered Automatic takes the active device, then the only computer',()=>{
 const s=withSession(()=>ok());
 assert.equal(s.client.recoveryDevice([phone,speaker,device]).id,'phone');
 assert.equal(s.client.recoveryDevice([speaker,device]).id,'fresh');
 assert.equal(s.client.recoveryDevice([speaker,{...speaker,id:'other'}]),null);
});
test('a remembered device Spotify renumbered is matched by name and type',()=>{
 const s=withSession(()=>ok(),{session:{lastDevice:{id:'stale',name:'My PC',type:'Computer'}}});
 assert.equal(s.client.recoveryDevice([device,phone]).id,'fresh');
});
test('a Preferred Device still overrules the remembered one, and still refuses a substitute',()=>{
 const s=withSession(()=>ok(),{session:{lastDevice:{id:'speaker',name:'Kitchen',type:'Speaker'}},recovery:{preferredDevice:{id:'fresh',name:'My PC',type:'Computer'}}});
 assert.equal(s.client.recoveryDevice([device,speaker]).id,'fresh');
 assert.equal(s.client.recoveryDevice([speaker,phone]),null);
});
test('the device Spotify reports is remembered, saved, and used after a restart',async()=>{
 const s=withSession(r=>r.path==='/v1/me/player'&&!r.options.method?json({device:{id:'fresh',name:'My PC',type:'Computer'},is_playing:true,item:null}):ok());
 await s.client.getPlaybackState({force:true});
 assert.deepEqual(s.client.lastDevice,{id:'fresh',name:'My PC',type:'Computer'});
 assert.deepEqual(s.saved.pop().lastDevice,{id:'fresh',name:'My PC',type:'Computer'});
 const next=withSession(()=>ok(),{session:{lastDevice:s.client.lastDevice}});
 assert.equal(next.client.recoveryDevice([device,phone]).id,'fresh');
});
test('picking a device by hand remembers it without a second read',async()=>{
 const s=withSession(()=>ok());
 await s.client.command('device',{id:'speaker',name:'Kitchen',type:'Speaker'});
 assert.deepEqual(s.client.lastDevice,{id:'speaker',name:'Kitchen',type:'Speaker'});
 assert.deepEqual(s.requests.map(r=>r.path),['/v1/me/player']);
});
test('a transport press on a device that went away recovers it and retries once',async()=>{
 let nexts=0;const s=withSession(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/next')?(++nexts===1?missing():ok()):ok());
 s.client.deviceId='stale';
 await s.client.command('next');
 const sent=s.requests.filter(r=>r.path.endsWith('/next'));
 assert.equal(sent[0].url.searchParams.get('device_id'),'stale');
 assert.equal(sent[1].url.searchParams.get('device_id'),'fresh');
});
test('pause with nothing playing anywhere settles quietly and drops the dead device',async()=>{
 const s=withSession(()=>missing());
 s.client.deviceId='stale';
 await s.client.command('pause');
 assert.equal(s.client.deviceId,'');
 assert.equal(s.requests.length,1);
});
test('a volume press after Spotify went idle retries on the recovered device with the same value',async()=>{
 let volumes=0;const s=withSession(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/volume')?(++volumes===1?missing():ok()):ok());
 s.client.deviceId='stale';
 await s.client.command('volume',42);
 const sent=s.requests.filter(r=>r.path.endsWith('/volume'));
 assert.equal(sent[1].url.searchParams.get('device_id'),'fresh');
 assert.equal(sent[1].url.searchParams.get('volume_percent'),'42');
 assert.equal(s.client.volumeWrite.value,42);
});
test('a skip with an empty queue says so instead of blaming the device it just connected',async()=>{
 const s=withSession(r=>r.path.endsWith('/devices')?json({devices:[device]}):r.path.endsWith('/next')?missing():ok());
 await assert.rejects(s.client.command('next'),/nothing is queued/);
 assert.equal(s.client.deviceId,'fresh');
});
