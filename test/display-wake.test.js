const test=require('node:test');const assert=require('node:assert/strict');
const {DisplayWake}=require('../src/display-wake');
function blocker(){
  const started=[],stopped=[];let next=1;
  return {started,stopped,start(kind){started.push(kind);return next++;},stop(id){stopped.push(id);},isStarted(id){return started.length>0&&!stopped.includes(id);}};
}
function setup({idle=60000}={}){
  const timers=[];let now=0;
  const block=blocker();
  const wake=new DisplayWake(block,{idle,setTimer:(fn,ms)=>{const timer={fn,at:now+ms};timers.push(timer);return timer;},clearTimer:timer=>{const i=timers.indexOf(timer);if(i>=0)timers.splice(i,1);}});
  return {wake,block,tick(ms){now+=ms;for(const timer of [...timers])if(timer.at<=now){const i=timers.indexOf(timer);if(i>=0)timers.splice(i,1);timer.fn();}},get pending(){return timers.length;}};
}
test('the display is held awake while the dial is in use and released once it goes quiet',()=>{
  const s=setup();
  s.wake.note({type:'dial',delta:1});
  assert.deepEqual(s.block.started,['prevent-display-sleep']);
  s.tick(50000);s.wake.note({type:'command',command:'center-click'});
  s.tick(50000);assert.equal(s.wake.active,true,'still in use, so still held');
  assert.deepEqual(s.block.started,['prevent-display-sleep'],'one block, not one per press');
  s.tick(60000);
  assert.equal(s.wake.active,false);assert.deepEqual(s.block.stopped,[1]);
  assert.equal(s.pending,0);
});
test('the five-second plugin heartbeat never holds the display awake',()=>{
  const s=setup();
  for(let i=0;i<10;i++){assert.equal(s.wake.note({type:'heartbeat'}),false);s.tick(5000);}
  assert.deepEqual(s.block.started,[]);
  assert.equal(s.wake.active,false);
});
test('releasing twice stops the block once, and a release with nothing held is harmless',()=>{
  const s=setup();
  s.wake.release();assert.deepEqual(s.block.stopped,[]);
  s.wake.note({type:'dial',delta:-1});s.wake.release();s.wake.release();
  assert.deepEqual(s.block.stopped,[1]);
  s.wake.note({type:'dial',delta:-1});s.tick(60000);
  assert.deepEqual(s.block.started,['prevent-display-sleep','prevent-display-sleep']);
  assert.deepEqual(s.block.stopped,[1,2]);
});
