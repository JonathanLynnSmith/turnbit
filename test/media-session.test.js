const test=require('node:test');const assert=require('node:assert/strict');const {EventEmitter,once}=require('node:events');const {PassThrough}=require('node:stream');
const {SpotifyClient}=require('../src/spotify');const {MediaSession}=require('../src/media-session');
const uri='spotify:track:'+'m'.repeat(22);
function fakeMedia(state){const sent=[];return {sent,ok:true,state:{available:true,playing:true,title:'Song A',artist:'Artist',durationMs:200000,positionMs:42000,canSeek:true,canNext:true,canPrevious:true,...state},current(){return {...this.state};},async command(cmd,value){sent.push([cmd,value]);return this.ok;}};}
function setup({device='Computer',title='Song A',local}={}){
 const requests=[],states=[];const media=fakeMedia(local);
 const client=new SpotifyClient(state=>states.push(state),{media,fetch:async(url,options)=>{requests.push({url,method:options.method||'GET'});if(url.includes('/contains'))return new Response('[false]');if(options.method)return new Response(null,{status:204});return new Response(JSON.stringify({is_playing:false,progress_ms:0,device:{type:device,name:'PC'},item:{uri,name:title,duration_ms:200000}}));}});
 client.setTokens({access_token:'test',refresh_token:'test',expires_in:3600});return {client,media,requests,states};
}
test('Transport goes to the Spotify desktop session when it is the active player',async()=>{
 const {client,media,requests}=setup();await client.getPlaybackState();const before=requests.length;
 await client.command('toggle');await client.command('next');await client.command('seek',5000);
 assert.deepEqual(media.sent,[['toggle',undefined],['next',undefined],['seek',5000]]);assert.equal(requests.length,before);
});
test('Playback on a phone or speaker stays on the Web API',async()=>{
 const {client,media,requests}=setup({device:'Smartphone'});await client.getPlaybackState();await client.command('next');
 assert.equal(media.sent.length,0);assert.ok(requests.some(r=>r.method==='POST'&&r.url.includes('/me/player/next')));
});
test('A failed local command falls back to the Web API',async()=>{
 const {client,media,requests}=setup();media.ok=false;await client.getPlaybackState();await client.command('pause');
 assert.deepEqual(media.sent,[['pause',undefined]]);assert.ok(requests.some(r=>r.method==='PUT'&&r.url.includes('/me/player/pause')));
});
test('Local state is merged and Web API reads are cached while the desktop session is trusted',async()=>{
 const {client,requests,states}=setup();await client.getPlaybackState();await client.getPlaybackState();await client.getPlaybackState();
 assert.equal(requests.filter(r=>r.url.includes('/me/player')&&!r.url.includes('/contains')).length,1);
 assert.equal(states.at(-1).is_playing,true);assert.equal(states.at(-1).progress_ms,42000);assert.equal(states.at(-1).localSession,true);
});
test('A song change shows the local title and blocks Like until Spotify catches up',async()=>{
 const {client,media,states}=setup();await client.getPlaybackState();media.state={...media.state,title:'Song B',artist:'Other'};client.localChanged(media.state);
 assert.equal(states.at(-1).item.name,'Song B');assert.equal(states.at(-1).provisional,true);assert.equal(states.at(-1).liked,null);
 await assert.rejects(client.command('like'),/still switching/);clearTimeout(client.refreshTimer);
});
test('Media session wrapper parses state, matches replies, and restarts the helper',async()=>{
 const children=[];const spawn=()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};children.push(child);return child;};
 const updates=[];const media=new MediaSession(state=>updates.push(state),{spawn});media.retry=1;media.start();
 children[0].stdout.write(JSON.stringify({type:'state',available:true,playing:false,title:'Song A',durationMs:1000,positionMs:10})+'\n');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(media.state.title,'Song A');assert.equal(updates.at(-1).available,true);
 const reply=media.command('pause');const [line]=await once(children[0].stdin,'data');const {id,cmd}=JSON.parse(line);assert.equal(cmd,'pause');
 children[0].stdout.write(JSON.stringify({type:'result',id,ok:true})+'\n');assert.equal(await reply,true);
 media.retry=1;children[0].emit('exit',1);assert.equal(media.state.available,false);await new Promise(resolve=>setTimeout(resolve,20));assert.equal(children.length,2);media.stop();
});
test('A picked song shows immediately, blocks Like, and clears once Spotify reports it',async()=>{
 const picked={uri:'spotify:track:'+'p'.repeat(22),name:'Picked',artists:[{name:'New'}],album:{name:'LP',images:[{url:'art'}]},duration_ms:180000};
 let release,current={is_playing:true,device:{type:'Computer'},item:{uri,name:'Song A'}};const states=[];const media=fakeMedia();
 const client=new SpotifyClient(state=>states.push(state),{media,fetch:async(url,options)=>{if(url.includes('/contains'))return new Response('[false]');if(options.method==='PUT'){await new Promise(resolve=>release=resolve);return new Response(null,{status:204});}return new Response(JSON.stringify(current));}});
 client.setTokens({access_token:'test',refresh_token:'test',expires_in:3600});await client.getPlaybackState();
 const play=client.command('play-item',{uri:picked.uri,item:picked});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(states.at(-1).item.name,'Picked');assert.equal(states.at(-1).item.album.images[0].url,'art');assert.equal(states.at(-1).progress_ms,0);assert.equal(states.at(-1).is_playing,true);
 await assert.rejects(client.command('like'),/still switching/);
 release();await play;clearTimeout(client.refreshTimer);
 current={...current,item:picked};media.state={...media.state,title:'Picked'};await client.getPlaybackState({force:true});
 assert.equal(client.pendingPlay,null);assert.equal(states.at(-1).provisional,undefined);assert.equal(states.at(-1).item.uri,picked.uri);
});
test('A rejected song pick reverts to what Spotify is actually playing',async()=>{
 const picked={uri:'spotify:track:'+'q'.repeat(22),name:'Picked'};const states=[];
 const client=new SpotifyClient(state=>states.push(state),{fetch:async(url,options)=>{if(url.includes('/contains'))return new Response('[false]');if(options.method==='PUT')return new Response('{}',{status:403});return new Response(JSON.stringify({item:{uri,name:'Song A'}}));}});
 client.setTokens({access_token:'test',refresh_token:'test',expires_in:3600});await client.getPlaybackState();
 await assert.rejects(client.command('play-item',{uri:picked.uri,item:picked}));
 assert.ok(states.some(state=>state?.item?.name==='Picked'));assert.equal(states.at(-1).item.name,'Song A');assert.equal(client.pendingPlay,null);
});
test('A volume change survives cached state and lagging Spotify reads without extra calls',async()=>{
 const requests=[],states=[];const media=fakeMedia();
 const client=new SpotifyClient(state=>states.push(state),{media,fetch:async(url,options)=>{requests.push(url);if(url.includes('/contains'))return new Response('[false]');if(options.method)return new Response(null,{status:204});return new Response(JSON.stringify({is_playing:true,device:{type:'Computer',volume_percent:30},item:{uri,name:'Song A'}}));}});
 client.setTokens({access_token:'test',refresh_token:'test',expires_in:3600});await client.getPlaybackState();
 await client.command('volume',70);const calls=requests.length;
 client.localChanged({...media.state,positionMs:50000});assert.equal(states.at(-1).device.volume_percent,70);
 await client.getPlaybackState();assert.equal(states.at(-1).device.volume_percent,70);assert.equal(requests.length,calls);
 await client.getPlaybackState({force:true});assert.equal(states.at(-1).device.volume_percent,70);
 client.volumeWrite.at-=5000;await client.getPlaybackState({force:true});assert.equal(states.at(-1).device.volume_percent,30);
});
test('Pausing locally does not leave Play blocked by a stale Web API snapshot',async()=>{
 const requests=[],states=[];const media=fakeMedia({playing:false});
 const client=new SpotifyClient(state=>states.push(state),{media,fetch:async(url,options)=>{requests.push(url);if(url.includes('/contains'))return new Response('[false]');if(options.method)return new Response(null,{status:204});return new Response(JSON.stringify({is_playing:true,progress_ms:0,device:{type:'Computer',name:'PC'},actions:{disallows:{resuming:true,toggling_shuffle:true}},item:{uri,name:'Song A',duration_ms:200000}}));}});
 client.setTokens({access_token:'test',refresh_token:'test',expires_in:3600});await client.getPlaybackState();
 const {normalizePlayback}=require('../src/integrations/spotify/playback-provider');const shown=normalizePlayback(states.at(-1));
 assert.equal(shown.playing,false);assert.equal(shown.capabilities.play,true,'resume is allowed once paused locally');assert.equal(shown.capabilities.shuffle,false,'other restrictions remain');
});
