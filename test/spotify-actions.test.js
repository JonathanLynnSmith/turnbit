const test=require('node:test');
const assert=require('node:assert/strict');
const {SpotifyClient}=require('../src/spotify');
const {validateEvent}=require('../src/bridge');
function setup(state){const writes=[];let liked=false;const client=new SpotifyClient(()=>{},{fetch:async(url,options)=>{if(url.includes('/library/contains'))return new Response(JSON.stringify([liked]),{status:200});if(options.method==='PUT'||options.method==='DELETE'){if(url.includes('/me/library?'))liked=options.method==='PUT';writes.push({url:new URL(url),method:options.method});return new Response(null,{status:204});}return new Response(JSON.stringify(state),{status:200});}});client.setTokens({access_token:'test',refresh_token:'test',expires_in:3600});return {client,writes};}
test('Like toggles the current Spotify track in and out of the library',async()=>{
 const {client,writes}=setup({item:{uri:'spotify:track:'+'a'.repeat(22)}});
 assert.equal((await client.command('like')).message,'Syncing like with Spotify…');assert.equal((await client.command('like')).message,'Syncing unlike with Spotify…');
 assert.equal(writes.length,2);for(const write of writes){assert.equal(write.url.pathname,'/v1/me/library');assert.equal(write.url.searchParams.get('uris'),'spotify:track:'+'a'.repeat(22));}assert.deepEqual(writes.map(write=>write.method),['PUT','DELETE']);
});
test('Like rejects local tracks, episodes and absent playback without a library write',async()=>{
 for(const state of [null,{item:{uri:'spotify:episode:'+'a'.repeat(22)}},{item:{uri:'spotify:track:'+'a'.repeat(22),is_local:true}}]){const {client,writes}=setup(state);await assert.rejects(client.command('like'));assert.equal(writes.length,0);}
});
test('Shuffle reads live state and repeat cycles all modes on the active device',async()=>{
 for(const enabled of [false,true]){const {client,writes}=setup({shuffle_state:enabled,device:{id:'active'}});await client.command('shuffle');assert.equal(writes[0].url.searchParams.get('state'),String(!enabled));assert.equal(writes[0].url.searchParams.get('device_id'),'active');}
 for(const [before,after] of [['off','context'],['context','track'],['track','off']]){const {client,writes}=setup({repeat_state:before});await client.command('repeat');assert.equal(writes[0].url.pathname,'/v1/me/player/repeat');assert.equal(writes[0].url.searchParams.get('state'),after);}
});
test('New D100H action commands pass bridge validation',()=>{for(const command of ['like','shuffle','repeat'])assert.deepEqual(validateEvent({type:'command',command}),{type:'command',command});});

test('Rapid Like presses reuse confirmed state despite stale Spotify reads',async()=>{
 const requests=[];const client=new SpotifyClient(()=>{},{fetch:async(url,options)=>{requests.push({url,method:options.method||'GET'});if(url.includes('/contains'))return new Response('[false]');if(options.method)return new Response(null,{status:204});return new Response(JSON.stringify({item:{uri:'spotify:track:'+'b'.repeat(22)}}));}});client.setTokens({access_token:'test',refresh_token:'test',expires_in:3600});
 await client.getPlaybackState();await client.command('like');await client.command('like');
 assert.deepEqual(requests.filter(r=>r.method!=='GET').map(r=>r.method),['PUT','DELETE']);assert.equal(requests.filter(r=>r.method==='GET').length,2);
});
test('A poll started before a Like acknowledgement cannot overwrite the new heart',async()=>{
 let defer=false,release;const states=[];const client=new SpotifyClient(state=>states.push(state),{fetch:async(url,options)=>{if(url.includes('/contains'))return new Response('[false]');if(options.method)return new Response(null,{status:204});if(defer)await new Promise(resolve=>release=resolve);return new Response(JSON.stringify({item:{uri:'spotify:track:'+'c'.repeat(22)}}));}});client.setTokens({access_token:'test',refresh_token:'test',expires_in:3600});
 await client.getPlaybackState();defer=true;const poll=client.getPlaybackState();await new Promise(resolve=>setImmediate(resolve));await client.command('like');release();await poll;assert.equal(states.at(-1).liked,true);assert.equal(client.playbackState.liked,true);
});
test('Failed Like write preserves the confirmed heart and allows another attempt',async()=>{
 const {client}=setup({item:{uri:'spotify:track:'+'d'.repeat(22)}});await client.getPlaybackState();const fetch=client.fetch;client.fetch=async(url,options)=>options.method==='PUT'?new Response('{}',{status:500}):fetch(url,options);
 await assert.rejects(client.command('like'));assert.equal(client.playbackState.liked,false);client.fetch=fetch;await client.command('like');assert.equal(client.playbackState.liked,true);
});

test('Like remains pending through stale reads until Spotify confirms it',async()=>{
 let reads=0;const updates=[];const client=new SpotifyClient(state=>updates.push(state),{likeDelays:[0,0,0],waitForLike:async()=>{},fetch:async(url,options)=>{if(url.includes('/contains'))return new Response(JSON.stringify([++reads>=4]));if(options.method)return new Response(null,{status:204});return new Response(JSON.stringify({item:{uri:'spotify:track:'+'e'.repeat(22)}}));}});client.setTokens({access_token:'test',expires_in:3600});
 await client.command('like');const entry=client.likeStates.get('spotify:track:'+'e'.repeat(22));await entry.verification;assert.equal(reads,4);assert.equal(entry.confirmed,true);assert.ok(updates.some(state=>state.likedPending));assert.equal(updates.at(-1).likedPending,false);assert.equal(updates.at(-1).liked,true);
});
test('A second press supersedes the first confirmation without blocking its write',async()=>{
 const waits=[],writes=[];const uri='spotify:track:'+'f'.repeat(22);const client=new SpotifyClient(()=>{},{likeDelays:[0],waitForLike:()=>new Promise(resolve=>waits.push(resolve)),fetch:async(url,options)=>{if(url.includes('/contains'))return new Response('[false]');if(options.method){writes.push(options.method);return new Response(null,{status:204});}return new Response(JSON.stringify({item:{uri}}));}});client.setTokens({access_token:'test',expires_in:3600});
 await client.command('like');const first=client.likeStates.get(uri);await client.command('like');const second=client.likeStates.get(uri);assert.deepEqual(writes,['PUT','DELETE']);waits[0]();waits[1]();await Promise.all([first.verification,second.verification]);assert.equal(client.playbackState.liked,false);assert.equal(client.playbackState.likedPending,false);
});
test('Unconfirmed changes report Spotify actual state instead of claiming success',async()=>{
 const client=new SpotifyClient(()=>{},{likeDelays:[0],waitForLike:async()=>{},fetch:async(url,options)=>url.includes('/contains')?new Response('[false]'):options.method?new Response(null,{status:204}):new Response(JSON.stringify({item:{uri:'spotify:track:'+'g'.repeat(22)}}))});client.setTokens({access_token:'test',expires_in:3600});
 await client.command('like');await client.likeStates.get('spotify:track:'+'g'.repeat(22)).verification;assert.equal(client.playbackState.liked,false);assert.equal(client.playbackState.likedPending,false);assert.match(client.playbackState.likeError,/not confirmed/);
});
test('Polling the same track reuses liked status instead of rechecking the library',async()=>{
 let checks=0,uri='spotify:track:'+'h'.repeat(22);const client=new SpotifyClient(()=>{},{fetch:async url=>{if(url.includes('/contains')){checks++;return new Response('[true]');}return new Response(JSON.stringify({item:{uri}}));}});client.setTokens({access_token:'test',refresh_token:'test',expires_in:3600});
 await client.getPlaybackState();await client.getPlaybackState();await client.getPlaybackState();assert.equal(checks,1);assert.equal(client.playbackState.liked,true);
 uri='spotify:track:'+'i'.repeat(22);await client.getPlaybackState();assert.equal(checks,2);
 client.likedCache.at-=client.likedRecheck;await client.getPlaybackState();assert.equal(checks,3);
});
test('A rate limit on Liked Songs pauses only library calls, not playback',async()=>{
 const requests=[];const client=new SpotifyClient(()=>{},{fetch:async url=>{requests.push(url);if(url.includes('/me/tracks')||url.includes('/contains'))return new Response('{}',{status:429,headers:{'retry-after':'70000'}});return new Response(JSON.stringify({item:{uri:'spotify:track:'+'j'.repeat(22),name:'Song'}}));}});client.setTokens({access_token:'test',refresh_token:'test',expires_in:3600});
 await assert.rejects(client.library('songs'),/Liked Songs and likes paused until/);
 const before=requests.length;await assert.rejects(client.library('songs'),/paused until/);assert.equal(requests.length,before);
 const state=await client.getPlaybackState();assert.equal(state.item.name,'Song');assert.equal(state.liked,null);
 await client.library('playlists');assert.ok(requests.at(-1).includes('/me/playlists'));
});
