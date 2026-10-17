const test=require('node:test'),assert=require('node:assert/strict');
const {HoldTracker}=require('../src/mouse-mode');
function setup(){
  let time=0;const timers=new Map();let nextId=1;const log=[];
  const tracker=new HoldTracker({start:()=>log.push('start'),stop:()=>log.push('stop'),now:()=>time,setTimer:(fn,ms)=>{const id=nextId++;timers.set(id,{fn,at:time+ms});return id;},clearTimer:id=>timers.delete(id)});
  const advance=ms=>{const end=time+ms;for(;;){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);time=due[1].at;due[1].fn();}time=end;};
  return {tracker,log,advance};
}
test('holding the shortcut keeps the mode on until key-up',()=>{
  const {tracker,log,advance}=setup();tracker.press();assert.deepEqual(log,['start']);
  advance(500);tracker.press();advance(33);tracker.press();advance(33);tracker.press();assert.equal(tracker.active,true);
  tracker.release();assert.equal(tracker.active,false);assert.deepEqual(log,['start','stop']);
});
test('a hold ends when key repeats stop, even if key-up never arrives',()=>{
  const {tracker,log,advance}=setup();tracker.press();advance(500);tracker.press();advance(33);tracker.press();
  advance(499);assert.equal(tracker.active,true);advance(2);assert.equal(tracker.active,false);assert.deepEqual(log,['start','stop']);
});
test('a long press without repeats ends on key-up',()=>{
  const {tracker,advance}=setup();tracker.press();advance(400);tracker.release();assert.equal(tracker.active,false);
});
test('a quick tap toggles the mode on, a second tap turns it off',()=>{
  const {tracker,log,advance}=setup();tracker.press();advance(120);tracker.release();assert.equal(tracker.active,true);
  advance(3000);tracker.press();assert.equal(tracker.active,false);assert.deepEqual(log,['start','stop']);
});
test('a tap whose key-up was missed still toggles off on the next press',()=>{
  const {tracker,advance}=setup();tracker.press();advance(1200);tracker.idle();tracker.press();assert.equal(tracker.active,false);
});
test('a tapped-on mode turns off after a while without mouse input, and mouse input keeps it alive',()=>{
  const {tracker,advance}=setup();tracker.press();advance(100);tracker.release();
  advance(15000);tracker.idle();advance(15000);assert.equal(tracker.active,true);advance(5001);assert.equal(tracker.active,false);
});
test('end is safe to call twice',()=>{
  const {tracker,log}=setup();tracker.press();tracker.end();tracker.end();assert.deepEqual(log,['start','stop']);
});
