const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CenterClick}=require('../renderer/center-click');

test('single click waits, double click goes Back without selecting, and separated clicks select twice',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const actions=[],click=new CenterClick(()=>actions.push('select'),()=>actions.push('back'));
  click.click();t.mock.timers.tick(349);assert.deepEqual(actions,[]);
  t.mock.timers.tick(1);assert.deepEqual(actions,['select']);actions.length=0;
  click.click();t.mock.timers.tick(150);click.click();t.mock.timers.tick(1000);
  assert.deepEqual(actions,['back']);actions.length=0;
  click.click();t.mock.timers.tick(400);click.click();t.mock.timers.tick(400);
  assert.deepEqual(actions,['select','select']);
});

test('a delayed timer cannot turn two separated clicks into Back; other input flushes pending Select',()=>{
  let now=1000;const actions=[],click=new CenterClick(()=>actions.push('select'),()=>actions.push('back'),{now:()=>now});
  click.click();now+=1000;click.click();assert.deepEqual(actions,['select']);
  click.flush();assert.deepEqual(actions,['select','select']);
  click.flush();assert.equal(actions.length,2);
});

test('a row that changes a value in place acts at once and never becomes a gesture',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const actions=[];let armed=false;
  const click=new CenterClick(()=>actions.push('select'),()=>actions.push('back'),{armed:()=>armed});
  click.click();assert.deepEqual(actions,['select'],'no wait before a toggle flips');
  click.click();click.click();
  assert.deepEqual(actions,['select','select','select'],'hyper-clicking keeps toggling');
  t.mock.timers.tick(1000);assert.equal(actions.length,3,'nothing is left pending');
  armed=true;
  click.click();t.mock.timers.tick(100);click.click();
  assert.deepEqual(actions.slice(3),['back'],'navigation rows keep the gesture');
});
