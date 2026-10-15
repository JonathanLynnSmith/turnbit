const {test}=require('node:test');
const assert=require('node:assert/strict');
const {VolumeControl}=require('../renderer/volume');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('live seek sends during a sustained hold, coalesces slow writes, and finishes at the latest position',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const sent=[];let finish;
  const control=new VolumeControl(value=>{sent.push(value);return new Promise(resolve=>{finish=resolve;});},{max:86400000,interval:450});
  control.reset(30000);control.set(35000);assert.deepEqual(sent,[35000]);
  for(let i=1;i<=4;i++){t.mock.timers.tick(100);control.set(35000+i*1000);}
  finish();await tick();t.mock.timers.tick(50);assert.deepEqual(sent,[35000,39000]);
  control.set(42000);t.mock.timers.tick(1500);assert.equal(sent.length,2);
  finish();await tick();assert.deepEqual(sent,[35000,39000,42000]);
  finish();await tick();t.mock.timers.tick(5000);assert.equal(sent.length,3);
});

test('volume responds immediately and sends only the latest target without overlapping requests',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const sent=[],shown=[];let finish;
  const control=new VolumeControl(value=>{sent.push(value);return new Promise(resolve=>{finish=resolve;});},{onValue:value=>shown.push(value)});
  control.set(52);for(let value=54;value<=90;value+=2)control.set(value);
  assert.equal(shown.at(-1),90);assert.deepEqual(sent,[52]);
  assert.equal(control.acceptRemote(50),false);
  finish();await tick();t.mock.timers.tick(199);assert.deepEqual(sent,[52]);
  t.mock.timers.tick(1);assert.deepEqual(sent,[52,90]);
  control.set(70);control.set(64);t.mock.timers.tick(1000);assert.deepEqual(sent,[52,90]);
  finish();await tick();assert.deepEqual(sent,[52,90,64]);
  finish();await tick();assert.equal(control.acceptRemote(90),false);
  t.mock.timers.tick(1200);assert.equal(control.acceptRemote(60),true);assert.equal(control.value,60);
});

test('volume clamps values and stops retrying on failure',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const sent=[],errors=[];
  const control=new VolumeControl(async value=>{sent.push(value);throw new Error('offline');},{onError:error=>errors.push(error.message)});
  control.set(NaN);control.set(150);control.set(80);await tick();
  t.mock.timers.tick(5000);await tick();assert.deepEqual(sent,[100]);assert.deepEqual(errors,['offline']);
  control.set(-10);await tick();assert.deepEqual(sent,[100,0]);
});

test('reset discards queued writes while allowing an existing request to finish',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const sent=[];let finish;
  const control=new VolumeControl(value=>{sent.push(value);return new Promise(resolve=>{finish=resolve;});});
  control.set(60);control.set(80);control.reset(30);control.set(32);
  finish();await tick();assert.deepEqual(sent,[60,32]);
  finish();await tick();control.reset(40);assert.equal(control.acceptRemote(45),true);
});
