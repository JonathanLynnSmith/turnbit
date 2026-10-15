const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TransportHold}=require('../renderer/transport-hold');
test('tap skips once; a hold repeatedly scrubs and never skips on release',t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const skipped=[],scrubbed=[],hold=new TransportHold(d=>skipped.push(d),d=>scrubbed.push(d));
  hold.down(1);t.mock.timers.tick(200);hold.up(1);assert.deepEqual(skipped,[1]);
  hold.down(-1);t.mock.timers.tick(500);assert.deepEqual(scrubbed,[-5000]);
  t.mock.timers.tick(100);assert.deepEqual(scrubbed,[-5000,-1000]);
  hold.up(-1);t.mock.timers.tick(1000);assert.deepEqual(skipped,[1]);assert.equal(scrubbed.length,2);
});
test('repeat keydowns do not restart hold; lost releases stop at the safety timeout',t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const scrubbed=[],hold=new TransportHold(()=>{},d=>scrubbed.push(d),{maxHold:1000});
  hold.down(1);t.mock.timers.tick(300);hold.down(1);t.mock.timers.tick(200);assert.equal(scrubbed[0],5000);
  t.mock.timers.tick(500);const count=scrubbed.length;t.mock.timers.tick(2000);assert.equal(scrubbed.length,count);assert.equal(hold.direction,null);
});
