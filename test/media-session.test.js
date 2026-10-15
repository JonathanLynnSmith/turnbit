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
