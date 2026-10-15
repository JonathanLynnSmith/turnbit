const {test}=require('node:test');
const assert=require('node:assert/strict');
const {VisibilityControl}=require('../src/visibility');
const {HardwareWakeGate}=require('../src/hardware-wake');
function fixture(){let now=0;const visibility=new VisibilityControl(()=>{},{now:()=>now});visibility.configure({mode:'idle',timeout:1,idleOpacity:20});const gate=new HardwareWakeGate(visibility,{now:()=>now});return {gate,visibility,sleep(){now+=2000;visibility.tick();},event:command=>gate.handle({type:'command',command})};}
test('first idle dial turn wakes only; subsequent turn acts normally',()=>{
  const {gate,sleep}=fixture();sleep();assert.equal(gate.handle({type:'dial',delta:1}),'wake');assert.equal(gate.handle({type:'dial',delta:1}),'forward');
});
test('center wake consumes down, held rotation, release and click, then allows the next click',()=>{
  const {event,gate,sleep}=fixture();sleep();assert.equal(event('center-down'),'wake');
  assert.equal(gate.handle({type:'dial',delta:1,held:true}),'wake');assert.equal(event('center-up'),'ignore');assert.equal(event('center-click'),'wake');
  assert.equal(event('center-down'),'forward');assert.equal(event('center-up'),'ignore');assert.equal(event('center-click'),'forward');
});
test('Menu wake consumes the entire press without triggering Back or hold Home',()=>{
  const {event,sleep}=fixture();sleep();assert.equal(event('menu-down'),'wake');assert.equal(event('menu-up'),'wake');
  assert.equal(event('menu-down'),'forward');assert.equal(event('menu-up'),'forward');
});
test('Play/Next/Previous wake and act immediately; heartbeats never wake',()=>{
  const {event,gate,visibility,sleep}=fixture();
  for(const command of ['toggle','next-down','previous-down']){sleep();assert.equal(event(command),'forward');assert.equal(visibility.isIdle(),false);}
  sleep();assert.equal(gate.handle({type:'heartbeat'}),'forward');assert.equal(visibility.isIdle(),true);
});
test('normal double clicks remain intact; single-event legacy inputs also wake only',()=>{
  const {event,sleep}=fixture();
  for(let i=0;i<2;i++){assert.equal(event('center-down'),'forward');assert.equal(event('center-up'),'ignore');assert.equal(event('center-click'),'forward');}
  for(const command of ['menu','back','select','center-click']){sleep();assert.equal(event(command),'wake');}
});
test('permanent partial opacity does not swallow controls',()=>{
  const {gate,visibility,event}=fixture();visibility.configure({mode:'always',opacity:35});
  assert.equal(gate.handle({type:'dial',delta:1}),'forward');assert.equal(event('menu-down'),'forward');
});
