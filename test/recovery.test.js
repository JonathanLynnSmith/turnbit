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
