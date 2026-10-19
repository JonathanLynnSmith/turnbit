const test = require('node:test');
const assert = require('node:assert/strict');
const { createLibraryService } = require('../src/app/library-service');
const { createSettingsService } = require('../src/app/settings-service');
const { createHardwareInput } = require('../src/app/hardware-input');
const { createSpotifyLibraryProvider } = require('../src/integrations/spotify/library-provider');
const { RECOVERY_DEFAULTS, normalizeRecoverySettings } = require('../src/integrations/spotify/recovery-settings');
const { createApplicationSettingsClient } = require('../renderer/client/settings-client');
const settle = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };

function memorySettings(initial) {
  let saved = initial, fail = false;
  return { read: () => saved, write: value => { if (fail) throw new Error('disk full'); saved=structuredClone(value); },
    get saved(){return saved;}, set fail(value){fail=value;} };
}
const makeSettings = storage => createSettingsService({ storage, defaults: RECOVERY_DEFAULTS, normalize: normalizeRecoverySettings });

test('settings migrate once and remain authoritative across clients and restarts', () => {
  const storage = memorySettings();
  const first = makeSettings(storage);
  first.importLegacy({ autoLaunchSpotify:false, coldStart:{mode:'off'} });
  assert.equal(storage.saved.schemaVersion,1);
  first.update({ autoLaunchSpotify:true });
  const restarted = makeSettings(storage);
  assert.equal(restarted.importLegacy({ autoLaunchSpotify:false }).autoLaunchSpotify,true);
  const copy=restarted.get(); copy.coldStart.mode='liked';
  assert.equal(restarted.get().coldStart.mode,'off');
});

test('failed settings writes and invalid updates do not publish or replace valid values', () => {
  const storage=memorySettings(),settings=makeSettings(storage),events=[];
  settings.subscribe(value=>events.push(value));
  settings.importLegacy({});storage.fail=true;
  assert.throws(()=>settings.update({autoLaunchSpotify:false}),/disk full/);
  assert.equal(settings.get().autoLaunchSpotify,true);
  assert.equal(events.length,1);
  assert.throws(()=>settings.update({coldStart:{mode:'playlist',playlist:{uri:'invalid'}}}),/Choose a playlist/);
  assert.throws(()=>makeSettings(memorySettings({schemaVersion:2})),/newer version/);
});

test('settings client serializes quick edits and ignores obsolete backend notifications', async () => {
  let listener;
  const applied=[],writes=[],releases=[];
  const client=createApplicationSettingsClient({
    onChange:fn=>{listener=fn;return()=>{};}, importLegacy:async()=>({value:0}),
    update:value=>{writes.push(value);return new Promise(resolve=>releases.push(resolve));}
  },{onValue:value=>applied.push(value),onError:assert.fail});
  await client.initialize({});
  const a=client.save({value:1}),b=client.save({value:2});await settle();
  listener({value:1});assert.equal(applied.length,1);
  releases.shift()({value:1});await settle();
  assert.equal(applied.length,1);
  releases.shift()({value:2});await Promise.all([a,b]);
  assert.deepEqual(writes,[{value:1},{value:2}]);
  assert.deepEqual(applied,[{value:0},{value:2}]);
});

test('library deduplicates a page, isolates consumer changes, and rejects reads from a previous connection', async () => {
  let calls=0,release;
  const service=createLibraryService({page:()=>{calls++;return new Promise(resolve=>{release=resolve;});}});
  const a=service.page({kind:'songs'}),b=service.page({kind:'songs'});await settle();
  assert.equal(calls,1);release({items:[{kind:'track',track:{title:'Song'}}],nextOffset:null});
  const [first,second]=await Promise.all([a,b]);first.items[0].track.title='changed';
  assert.equal(second.items[0].track.title,'Song');
  const stale=service.page({kind:'songs'});await settle();service.reset();release({items:[]});
  await assert.rejects(stale,/connection changed/);
  await assert.rejects(service.page({kind:'songs',offset:-1}),/Invalid library page/);
});

test('Spotify library pages use normalized tracks, opaque IDs, and numeric pagination', async () => {
  const provider=createSpotifyLibraryProvider({library:async()=>({items:[{track:{uri:'spotify:track:'+'a'.repeat(22),name:'Song',linked_from:{uri:'original'},artists:[],duration_ms:1000}}],total:80,next:'https://provider-only/page'})});
  const page=await provider.page({kind:'songs',offset:50});
  assert.equal(page.nextOffset,51);
  assert.equal(page.items[0].track.title,'Song');
  assert.equal(page.items[0].track.linkedId,'original');
  assert.equal(page.items[0].playable,true);
  assert.equal(JSON.stringify(page).includes('provider-only'),false);
});

function hardwareFixture() {
  const commands=[],events=[];let idle=false,activity=0;
  const state={track:{id:'song',durationMs:60000},positionMs:1000,observedAt:0,playing:false,device:{volume:50}};
  const input=createHardwareInput({playback:{getState:()=>state,command:async(name,value)=>commands.push({name,value})},forward:event=>events.push(event),isIdle:()=>idle,activity:()=>{activity++;},now:()=>0});
  input.setContext({demo:false});
  return {input,commands,events,state,set idle(value){idle=value;},get activity(){return activity;}};
}
test('hardware playback executes with no renderer while navigation remains an interface event', async t => {
  const f=hardwareFixture();t.after(()=>f.input.dispose());
  await f.input.handle({type:'command',command:'next'});
  f.input.handle({type:'dial',delta:1});
  assert.deepEqual(f.commands,[{name:'next',value:undefined}]);
  assert.equal(f.events[0].handled,true);assert.equal(f.events.at(-1).type,'dial');
  f.input.setContext({demo:false,openPlayerOnToggle:true});
  f.input.handle({type:'command',command:'toggle'});
  assert.equal(f.events.at(-1).type,'open-player');
  await f.input.handle({type:'command',command:'toggle'});
  assert.equal(f.commands.at(-1).name,'toggle');
});

test('quiet hardware playback keeps the view asleep and coalesces rapid volume and hold scrubs', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const f=hardwareFixture();t.after(()=>f.input.dispose());f.idle=true;
  f.input.setContext({demo:false,dialOnlyWake:true,openPlayerOnToggle:true});
  await f.input.handle({type:'command',command:'toggle'});
  assert.equal(f.activity,0);assert.equal(f.events.find(event=>event.handled).quiet,true);
  for(let i=0;i<4;i++)f.input.handle({type:'command',command:'volume-up'});
  await settle();assert.equal(f.commands.filter(command=>command.name==='volume').length,1);
  t.mock.timers.tick(600);await settle();
  assert.equal(f.commands.at(-1).value,70);
  f.input.handle({type:'command',command:'next-down'});t.mock.timers.tick(500);await settle();
  assert.equal(f.commands.at(-1).name,'seek');
  f.input.handle({type:'command',command:'next-up'});
  assert.equal(f.commands.some(command=>command.name==='next'),false);
});
